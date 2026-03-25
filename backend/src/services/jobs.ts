import {
  getCvCorpus,
  getProfile,
  getConfig,
  getJobById,
  getRecentProviderRuns,
  listJobs,
  deleteJobById,
  recordProviderRun,
  saveConfig,
  updateJobAnalysis,
  upsertJob
} from "../lib/db.js";
import { nowIso, hashJobKey } from "../lib/utils.js";
import { providerRegistry } from "../providers/index.js";
import { analyzeJob, estimateCvOverlap, generateCoverLetter, generateSearchPlan } from "./ai.js";
import type { CandidateProfile, JobRecord, ProviderJob, ProviderRun } from "../types/models.js";

type CountryRestrictedJob = Pick<ProviderJob, "title" | "company" | "location" | "remoteType" | "description">;

const allowedCountryOnlyTokens = [
  "thailand",
  "thai",
  "france",
  "french",
  "europe",
  "european",
  "european union",
  "eu",
  "eea"
];

const engineeringRolePattern =
  /(full.?stack|full stack|software|web|application|frontend|front-end|backend|back-end|node|typescript|javascript|react|vue|angular|php|python|api|platform|engineer|developer|devops|sre|data engineer|mobile)/i;
const offProfileTitlePattern =
  /(marketing|recruit(ing|er)?|talent|procurement|coordinator|intern(ship)?|operations|sales|account executive|business development|customer success|human resources|hr\b|finance|accounting|legal|compliance)/i;

function normalizeCountryOnlyText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .toLowerCase()
    .trim();
}

function isAllowedCountryOnlyMatch(countryLabel: string): boolean {
  const normalized = normalizeCountryOnlyText(countryLabel);
  return allowedCountryOnlyTokens.some((token) => normalized.includes(token));
}

function hasDisallowedCountryOnlyRestriction(job: CountryRestrictedJob): boolean {
  const haystack = normalizeCountryOnlyText(
    [job.title, job.company, job.location, job.remoteType, job.description]
      .filter(Boolean)
      .join(" ")
  );

  const patterns = [
    /\bremote\s*(?:-|in|from|within|across)?\s*([a-z][a-z\s-]{1,40}?)\s+only\b/g,
    /\b([a-z][a-z\s-]{1,40}?)\s+residents\s+only\b/g,
    /\b(?:residents|citizens)\s+of\s+([a-z][a-z\s-]{1,40}?)\s+only\b/g,
    /\bmust\s+be\s+based\s+in\s+([a-z][a-z\s-]{1,40}?)(?:\b|$)/g,
    /\bonly\s+open\s+to\s+candidates\s+in\s+([a-z][a-z\s-]{1,40}?)(?:\b|$)/g,
    /\bonly\s+for\s+candidates\s+based\s+in\s+([a-z][a-z\s-]{1,40}?)(?:\b|$)/g,
    /\bonly\s+for\s+(?:applicants|candidates|people|residents)\s+in\s+([a-z][a-z\s-]{1,40}?)(?:\b|$)/g
  ];

  for (const pattern of patterns) {
    for (const match of haystack.matchAll(pattern)) {
      const countryLabel = match[1]?.trim();
      if (!countryLabel) {
        continue;
      }

      if (!isAllowedCountryOnlyMatch(countryLabel)) {
        return true;
      }
    }
  }

  return false;
}

function hasKeywordMatch(text: string, keywords: string[]): boolean {
  return keywords
    .map((keyword) => keyword.trim().toLowerCase())
    .filter((keyword) => keyword.length >= 3)
    .some((keyword) => text.includes(keyword));
}

function isRelevantForProfile(job: ProviderJob, profile: CandidateProfile): boolean {
  const titleText = `${job.title} ${job.employmentType ?? ""}`.toLowerCase();
  const fullText = [
    job.title,
    job.company,
    job.location,
    job.remoteType,
    job.description,
    job.employmentType
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const hasEngineeringSignal = engineeringRolePattern.test(fullText);
  const hasProfileSignal = hasKeywordMatch(fullText, [...profile.skills, ...profile.desiredKeywords]);
  const hasExcludedSignal = hasKeywordMatch(fullText, profile.excludedKeywords);
  const looksOffProfileByTitle = offProfileTitlePattern.test(titleText) && !engineeringRolePattern.test(titleText);

  if (hasExcludedSignal || looksOffProfileByTitle) {
    return false;
  }

  return hasEngineeringSignal || hasProfileSignal;
}

function toJobRecord(job: ProviderJob): JobRecord {
  const id = hashJobKey(`${job.source}|${job.url}`);
  const timestamp = nowIso();

  return {
    id,
    source: job.source,
    sourceJobId: job.sourceJobId ?? null,
    title: job.title,
    company: job.company,
    location: job.location,
    employmentType: job.employmentType ?? null,
    remoteType: job.remoteType ?? null,
    salaryText: job.salaryText ?? null,
    salaryMinUsd: job.salaryMinUsd ?? null,
    salaryMaxUsd: job.salaryMaxUsd ?? null,
    url: job.url,
    description: job.description,
    postedAt: job.postedAt ?? null,
    discoveredAt: timestamp,
    queryText: job.queryText ?? null,
    providerMessage: job.providerMessage ?? null,
    aiScore: null,
    aiDecision: null,
    aiReason: null,
    cvScore: null,
    cvReason: null,
    coverLetter: null,
    applicationStatus: "NEW",
    notes: "",
    rawJson: JSON.stringify(job.rawPayload),
    updatedAt: timestamp
  };
}

function uniqueJobs(items: ProviderJob[]): ProviderJob[] {
  const map = new Map<string, ProviderJob>();
  for (const item of items) {
    const key = `${item.source}:${item.url}`;
    if (!map.has(key)) {
      map.set(key, item);
    }
  }
  return Array.from(map.values());
}

function countRecentFailures(providerId: string): number {
  const recentRuns = getRecentProviderRuns(20).filter((run) => run.providerId === providerId);
  let failures = 0;

  for (const run of recentRuns) {
    if (run.success) {
      break;
    }
    failures += 1;
  }

  return failures;
}

export async function refreshJobs(options: { forceRescore?: boolean } = {}) {
  const profile = getProfile();
  const config = getConfig();
  const cvText = getCvCorpus();
  const searchPlan = await generateSearchPlan(profile, config, cvText);
  const providerRuns: ProviderRun[] = [];
  const insertedIds: string[] = [];
  let scoredCount = 0;
  let coverLettersCount = 0;

  for (const [providerId, providerConfig] of Object.entries(config.sources)) {
    if (!providerConfig.enabled) {
      continue;
    }

    const provider = providerRegistry[providerId as keyof typeof providerRegistry];
    if (!provider) {
      continue;
    }

    const queries = Array.from(
      new Set([providerConfig.query, ...searchPlan].filter(Boolean))
    ).slice(0, config.searchPlanQueriesPerRefresh);

    let providerJobs: ProviderJob[] = [];
    let message = "No runs";
    let success = false;

    for (const query of queries) {
      const result = await provider(query, providerConfig.limit);
      providerJobs = providerJobs.concat(result.jobs);
      message = result.message;
      success = success || result.success;
    }

    const deduped = uniqueJobs(providerJobs)
      .filter((job) => isRelevantForProfile(job, profile))
      .filter((job) => !hasDisallowedCountryOnlyRestriction(job))
      .slice(0, providerConfig.limit);

    for (const job of deduped) {
      const record = toJobRecord(job);
      upsertJob(record);
      insertedIds.push(record.id);
    }

    const run: ProviderRun = {
      providerId,
      success,
      fetchedCount: deduped.length,
      message,
      createdAt: nowIso()
    };

    providerRuns.push(run);

    if (!run.success) {
      const failureCount = countRecentFailures(providerId) + 1;
      if (config.sources[providerId]) {
        config.sources[providerId] = {
          ...config.sources[providerId],
          autoDisabled: false,
          autoDisabledReason: null,
          lastFailureAt: run.createdAt
        };
        saveConfig(config);
      }

      if (failureCount >= 3 && config.sources[providerId]) {
        config.sources[providerId] = {
          ...config.sources[providerId],
          enabled: false,
          autoDisabled: true,
          autoDisabledReason: `Disabled after ${failureCount} consecutive failures`,
          lastFailureAt: run.createdAt
        };
        saveConfig(config);
        run.message = `${run.message} | Auto-disabled after ${failureCount} consecutive failures`;
      }
    } else if (config.sources[providerId]?.autoDisabled || config.sources[providerId]?.autoDisabledReason) {
      config.sources[providerId] = {
        ...config.sources[providerId],
        autoDisabled: false,
        autoDisabledReason: null,
        lastFailureAt: null
      };
      saveConfig(config);
    }

    recordProviderRun(run);
  }

  for (const existingJob of listJobs()) {
    if (hasDisallowedCountryOnlyRestriction(existingJob)) {
      deleteJobById(existingJob.id);
    }
  }

  if (config.autoScore) {
    const jobsToAnalyze = listJobs().filter((job) => {
      if (options.forceRescore) {
        return true;
      }
      return insertedIds.includes(job.id) || job.aiScore == null;
    });

    for (const job of jobsToAnalyze) {
      const analysis = await analyzeJob(job, profile, config, cvText);
      const cvFallback = estimateCvOverlap(job, cvText);

      updateJobAnalysis(job.id, {
        aiScore: analysis.score,
        aiDecision: analysis.decision,
        aiReason: [
          analysis.reason,
          `Remote: ${analysis.remoteFit}`,
          `Tech: ${analysis.techFit}`,
          `Comp: ${analysis.compensationFit}`,
          `Contract: ${analysis.contractFit}`
        ].join(" | "),
        cvScore: config.autoCompareCv ? analysis.cvScore : cvFallback.score,
        cvReason: config.autoCompareCv ? analysis.cvReason : cvFallback.reason
      });

      scoredCount += 1;

      if (config.autoGenerateCoverLetters && analysis.score >= config.coverLetterThreshold) {
        const letter = await generateCoverLetter(job, profile, config, cvText);
        updateJobAnalysis(job.id, { coverLetter: letter });
        coverLettersCount += 1;
      }
    }
  }

  return {
    providerRuns,
    searchPlan,
    inserted: insertedIds.length,
    scored: scoredCount,
    coverLetters: coverLettersCount
  };
}

export async function scoreSingleJob(id: string) {
  const profile = getProfile();
  const config = getConfig();
  const cvText = getCvCorpus();
  const job = getJobById(id);

  if (!job) {
    return null;
  }

  const analysis = await analyzeJob(job, profile, config, cvText);
  updateJobAnalysis(job.id, {
    aiScore: analysis.score,
    aiDecision: analysis.decision,
    aiReason: [
      analysis.reason,
      `Remote: ${analysis.remoteFit}`,
      `Tech: ${analysis.techFit}`,
      `Comp: ${analysis.compensationFit}`,
      `Contract: ${analysis.contractFit}`
    ].join(" | "),
    cvScore: analysis.cvScore,
    cvReason: analysis.cvReason
  });

  return getJobById(id);
}

export async function createCoverLetterForJob(id: string) {
  const profile = getProfile();
  const config = getConfig();
  const cvText = getCvCorpus();
  const job = getJobById(id);

  if (!job) {
    return null;
  }

  const letter = await generateCoverLetter(job, profile, config, cvText);
  updateJobAnalysis(id, { coverLetter: letter });
  return getJobById(id);
}
