import { getLatestCv, getProfile, getConfig, getJobById, listJobs, recordProviderRun, updateJobAnalysis, upsertJob } from "../lib/db.js";
import { nowIso, hashJobKey } from "../lib/utils.js";
import { providerRegistry } from "../providers/index.js";
import { analyzeJob, estimateCvOverlap, generateCoverLetter, generateSearchPlan } from "./ai.js";
import type { JobRecord, ProviderJob, ProviderRun } from "../types/models.js";

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

export async function refreshJobs(options: { forceRescore?: boolean } = {}) {
  const profile = getProfile();
  const config = getConfig();
  const cvText = getLatestCv()?.extractedText ?? "";
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

    const deduped = uniqueJobs(providerJobs).slice(0, providerConfig.limit);

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
    recordProviderRun(run);
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
  const cvText = getLatestCv()?.extractedText ?? "";
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
  const cvText = getLatestCv()?.extractedText ?? "";
  const job = getJobById(id);

  if (!job) {
    return null;
  }

  const letter = await generateCoverLetter(job, profile, config, cvText);
  updateJobAnalysis(id, { coverLetter: letter });
  return getJobById(id);
}
