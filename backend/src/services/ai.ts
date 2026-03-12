import OpenAI from "openai";
import { getAiSpendToday, recordAiUsage } from "../lib/db.js";
import { compactText, safeJsonParse, tokenize, truncate } from "../lib/utils.js";
import type { AppConfig, CandidateProfile, JobAnalysis, JobDecision, JobRecord } from "../types/models.js";

const SCORE_COST = 0.008;
const SEARCH_COST = 0.012;
const COVER_LETTER_COST = 0.01;

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

function withinBudget(config: AppConfig, estimatedCost: number): boolean {
  return getAiSpendToday() + estimatedCost <= config.maxDailyAiBudgetUsd;
}

function decideFromScore(score: number, config: AppConfig): Exclude<JobDecision, "UNSCORED"> {
  if (score >= config.applyThreshold) return "APPLY";
  if (score >= config.reviewThreshold) return "REVIEW";
  return "REJECT";
}

function heuristicAnalysis(job: JobRecord, profile: CandidateProfile, config: AppConfig): JobAnalysis {
  const text = compactText(job.title, job.description, job.location).toLowerCase();
  const skillHits = profile.skills.filter((skill) => text.includes(skill.toLowerCase()));
  const excludedHits = profile.excludedKeywords.filter((skill) => text.includes(skill.toLowerCase()));
  const desiredHits = profile.desiredKeywords.filter((skill) => text.includes(skill.toLowerCase()));
  const remotePositive = /(remote|distributed|anywhere|teletravail|télétravail|work from home|global)/i.test(text);
  const remoteNegative = /(hybrid|on-site|onsite|office|relocation|required in)/i.test(text);
  const contractMatch =
    profile.preferredEmployment.includes("employee") &&
    /(full[- ]?time|employee|permanent|cdi)/i.test(text)
      ? 12
      : profile.preferredEmployment.includes("contract") && /(contract|freelance|mission)/i.test(text)
        ? 10
        : 0;
  const seniorityMatch = /(senior|staff|lead|principal|architect)/i.test(text) ? 12 : 0;
  const salaryFloor =
    job.salaryMinUsd && job.salaryMinUsd > 0
      ? job.salaryMinUsd >= profile.minMonthlySalaryUsd
        ? 18
        : -25
      : 4;

  let score = 30;
  score += Math.min(skillHits.length * 7, 28);
  score += Math.min(desiredHits.length * 4, 16);
  score += contractMatch;
  score += seniorityMatch;
  score += salaryFloor;
  score += remotePositive ? 12 : profile.remoteOnly ? -20 : 0;
  score += remoteNegative ? -35 : 0;
  score -= Math.min(excludedHits.length * 8, 24);
  score = Math.max(0, Math.min(100, score));

  const cvScore = Math.max(0, Math.min(100, 35 + skillHits.length * 8 + desiredHits.length * 4 - excludedHits.length * 7));

  return {
    score,
    decision: decideFromScore(score, config),
    reason:
      excludedHits.length > 0
        ? `Red flags found: ${excludedHits.join(", ")}`
        : remoteNegative
          ? "Remote mismatch or office expectation detected"
          : `Matched ${skillHits.length} core skills with strong remote/seniority signals`,
    remoteFit: remotePositive && !remoteNegative ? "Strong remote signal" : remoteNegative ? "Likely mismatch" : "Unclear",
    compensationFit:
      job.salaryMinUsd && job.salaryMinUsd < profile.minMonthlySalaryUsd
        ? `Below target (${job.salaryMinUsd} USD/month)`
        : job.salaryMinUsd
          ? "Salary appears acceptable"
          : "Salary not stated",
    techFit: skillHits.length ? `Core skills found: ${skillHits.join(", ")}` : "Weak keyword overlap",
    contractFit: contractMatch > 0 ? "Compatible employment type" : "Contract type unclear",
    cvScore,
    cvReason: `Estimated CV overlap based on ${skillHits.length} skill hits and ${desiredHits.length} desired signals`
  };
}

export async function generateSearchPlan(
  profile: CandidateProfile,
  config: AppConfig,
  cvText: string
): Promise<string[]> {
  const fallback = Array.from(
    new Set([
      ...profile.desiredKeywords.slice(0, 5),
      "senior fullstack remote",
      "react node remote",
      "ai integration fullstack"
    ])
  );

  if (!openai || !withinBudget(config, SEARCH_COST)) {
    return fallback.slice(0, config.searchPlanQueriesPerRefresh);
  }

  try {
    const completion = await openai.chat.completions.create({
      model: config.aiModel,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You generate compact search queries for remote job boards. Return JSON only."
        },
        {
          role: "user",
          content: JSON.stringify({
            target_count: config.searchPlanQueriesPerRefresh,
            profile,
            cv_excerpt: truncate(cvText, 6000)
          })
        }
      ]
    });

    const payload = safeJsonParse<{ queries?: string[] }>(
      completion.choices[0]?.message?.content ?? "{}",
      {}
    );

    const queries = Array.from(new Set((payload.queries ?? []).map((item) => item.trim()).filter(Boolean)));
    recordAiUsage("search_plan", SEARCH_COST, { queries });
    return queries.length ? queries.slice(0, config.searchPlanQueriesPerRefresh) : fallback.slice(0, config.searchPlanQueriesPerRefresh);
  } catch {
    return fallback.slice(0, config.searchPlanQueriesPerRefresh);
  }
}

export async function analyzeJob(
  job: JobRecord,
  profile: CandidateProfile,
  config: AppConfig,
  cvText: string
): Promise<JobAnalysis> {
  if (!openai || !withinBudget(config, SCORE_COST)) {
    return heuristicAnalysis(job, profile, config);
  }

  try {
    const completion = await openai.chat.completions.create({
      model: config.aiModel,
      temperature: 0.15,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are a strict job-matching engine. Return JSON only with score, decision, reason, remoteFit, compensationFit, techFit, contractFit, cvScore, cvReason."
        },
        {
          role: "user",
          content: JSON.stringify({
            profile,
            job,
            cv_excerpt: truncate(cvText, 8000),
            rules: {
              reject_if: [
                "onsite or hybrid mandatory",
                "relocation required",
                `salary clearly below ${profile.minMonthlySalaryUsd} USD/month`
              ],
              thresholds: {
                apply: config.applyThreshold,
                review: config.reviewThreshold
              }
            }
          })
        }
      ]
    });

    const payload = safeJsonParse<Partial<JobAnalysis>>(
      completion.choices[0]?.message?.content ?? "{}",
      {}
    );

    const score = Math.max(0, Math.min(100, Number(payload.score ?? 0)));
    const decision = payload.decision && ["APPLY", "REVIEW", "REJECT"].includes(payload.decision)
      ? payload.decision
      : decideFromScore(score, config);

    const result: JobAnalysis = {
      score,
      decision,
      reason: payload.reason || "Model returned no explanation",
      remoteFit: payload.remoteFit || "Unknown",
      compensationFit: payload.compensationFit || "Unknown",
      techFit: payload.techFit || "Unknown",
      contractFit: payload.contractFit || "Unknown",
      cvScore: Math.max(0, Math.min(100, Number(payload.cvScore ?? score))),
      cvReason: payload.cvReason || "Model returned no CV explanation"
    };

    recordAiUsage("score_job", SCORE_COST, { jobId: job.id, source: job.source });
    return result;
  } catch {
    return heuristicAnalysis(job, profile, config);
  }
}

export async function generateCoverLetter(
  job: JobRecord,
  profile: CandidateProfile,
  config: AppConfig,
  cvText: string
): Promise<string> {
  if (!openai || !withinBudget(config, COVER_LETTER_COST)) {
    return [
      `Dear ${job.company} team,`,
      "",
      `I am a senior fullstack developer with ${profile.yearsExperience} years of experience building and shipping web products across frontend, backend and API layers. I am based in ${profile.location} and work fully remote.`,
      "",
      `Your ${job.title} role stands out because it aligns with my experience in ${profile.skills.slice(0, 6).join(", ")} as well as my recent work around AI integration and automation. I am comfortable joining established product teams or delivery-focused missions, and I care about shipping practical solutions rather than adding unnecessary complexity.`,
      "",
      "I would be interested in discussing how I can contribute quickly and effectively to your roadmap.",
      "",
      "Best regards,"
    ].join("\n");
  }

  const completion = await openai.chat.completions.create({
    model: config.aiModel,
    temperature: 0.35,
    messages: [
      {
        role: "system",
        content:
          "Write a concise, specific, professional cover letter in English. Avoid empty buzzwords and generic hype."
      },
      {
        role: "user",
        content: JSON.stringify({
          candidate_profile: profile,
          cv_excerpt: truncate(cvText, 6000),
          job: {
            title: job.title,
            company: job.company,
            description: truncate(job.description, 7000)
          },
          constraints: {
            target_words: "180-250",
            tone: "natural and senior",
            emphasize: ["remote collaboration", "fullstack delivery", "AI integration", "adaptability"]
          }
        })
      }
    ]
  });

  const text = completion.choices[0]?.message?.content ?? "";
  recordAiUsage("cover_letter", COVER_LETTER_COST, { jobId: job.id, source: job.source });
  return text;
}

export function estimateCvOverlap(job: JobRecord, cvText: string): { score: number; reason: string } {
  if (!cvText.trim()) {
    return { score: 0, reason: "No CV uploaded yet" };
  }

  const jobTokens = new Set(tokenize(compactText(job.title, job.description)).slice(0, 200));
  const cvTokens = new Set(tokenize(cvText).slice(0, 500));
  const overlap = Array.from(jobTokens).filter((token) => cvTokens.has(token));
  const score = Math.max(0, Math.min(100, Math.round((overlap.length / Math.max(1, jobTokens.size)) * 240)));
  return {
    score,
    reason: overlap.length
      ? `Token overlap found on: ${overlap.slice(0, 12).join(", ")}`
      : "Very limited overlap detected between CV and job description"
  };
}
