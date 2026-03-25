import Database from "better-sqlite3";
import { defaultConfig, defaultProfile } from "./defaults.js";
import { ensureDataDirs, DB_PATH } from "./paths.js";
import { nowIso, safeJsonParse } from "./utils.js";
import type {
  AiCredentialsStatus,
  AppConfig,
  CandidateProfile,
  CvDocument,
  DashboardPayload,
  JobRecord,
  ProviderRun
} from "../types/models.js";

ensureDataDirs();

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS cv_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    extracted_text TEXT NOT NULL,
    uploaded_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    source_job_id TEXT,
    title TEXT NOT NULL,
    company TEXT NOT NULL,
    location TEXT NOT NULL,
    employment_type TEXT,
    remote_type TEXT,
    salary_text TEXT,
    salary_min_usd REAL,
    salary_max_usd REAL,
    url TEXT NOT NULL,
    description TEXT NOT NULL,
    posted_at TEXT,
    discovered_at TEXT NOT NULL,
    query_text TEXT,
    provider_message TEXT,
    ai_score REAL,
    ai_decision TEXT,
    ai_reason TEXT,
    cv_score REAL,
    cv_reason TEXT,
    cover_letter TEXT,
    application_status TEXT NOT NULL DEFAULT 'NEW',
    notes TEXT NOT NULL DEFAULT '',
    raw_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_jobs_source ON jobs(source);
  CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(application_status);
  CREATE INDEX IF NOT EXISTS idx_jobs_score ON jobs(ai_score);
  CREATE INDEX IF NOT EXISTS idx_jobs_discovered ON jobs(discovered_at);

  CREATE TABLE IF NOT EXISTS ai_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    operation TEXT NOT NULL,
    estimated_cost_usd REAL NOT NULL,
    metadata TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS provider_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider_id TEXT NOT NULL,
    success INTEGER NOT NULL,
    fetched_count INTEGER NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

function getSetting<T>(key: string, fallback: T): T {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;

  if (!row) {
    return fallback;
  }

  return safeJsonParse(row.value, fallback);
}

function setSetting<T>(key: string, value: T): void {
  const serialized = JSON.stringify(value);
  db.prepare(
    `
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
    `
  ).run(key, serialized, nowIso());
}

if (!db.prepare("SELECT 1 FROM settings WHERE key = ?").get("candidate_profile")) {
  setSetting("candidate_profile", defaultProfile);
}

if (!db.prepare("SELECT 1 FROM settings WHERE key = ?").get("app_config")) {
  setSetting("app_config", defaultConfig);
}

export function getProfile(): CandidateProfile {
  return getSetting("candidate_profile", defaultProfile);
}

export function saveProfile(profile: CandidateProfile): CandidateProfile {
  setSetting("candidate_profile", profile);
  return profile;
}

export function getConfig(): AppConfig {
  const config = getSetting("app_config", defaultConfig);
  return {
    ...defaultConfig,
    ...config,
    sources: {
      ...defaultConfig.sources,
      ...(config.sources ?? {})
    }
  };
}

export function saveConfig(config: AppConfig): AppConfig {
  setSetting("app_config", config);
  return config;
}

function maskApiKey(value: string): string {
  if (value.length <= 8) {
    return "*".repeat(Math.max(4, value.length));
  }

  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export function getStoredOpenAiApiKey(): string | null {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get("openai_api_key") as
    | { value: string }
    | undefined;

  if (!row) {
    return null;
  }

  const parsed = safeJsonParse<{ key?: string }>(row.value, {});
  const key = typeof parsed.key === "string" ? parsed.key.trim() : "";
  return key || null;
}

export function saveOpenAiApiKey(apiKey: string): AiCredentialsStatus {
  const trimmed = apiKey.trim();
  setSetting("openai_api_key", { key: trimmed });
  return getAiCredentialsStatus();
}

export function clearOpenAiApiKey(): AiCredentialsStatus {
  db.prepare("DELETE FROM settings WHERE key = ?").run("openai_api_key");
  return getAiCredentialsStatus();
}

export function getAiCredentialsStatus(): AiCredentialsStatus {
  const storedRow = db.prepare("SELECT updated_at FROM settings WHERE key = ?").get("openai_api_key") as
    | { updated_at: string }
    | undefined;
  const storedKey = getStoredOpenAiApiKey();
  const envKey = process.env.OPENAI_API_KEY?.trim() || null;

  if (storedKey) {
    return {
      hasStoredKey: true,
      source: "database",
      maskedKey: maskApiKey(storedKey),
      updatedAt: storedRow?.updated_at ?? null
    };
  }

  if (envKey) {
    return {
      hasStoredKey: true,
      source: "environment",
      maskedKey: maskApiKey(envKey),
      updatedAt: null
    };
  }

  return {
    hasStoredKey: false,
    source: "none",
    maskedKey: null,
    updatedAt: null
  };
}

export function getLatestCv(): CvDocument | null {
  const row = db
    .prepare(
      `
        SELECT id, filename, mime_type as mimeType, storage_path as storagePath, extracted_text as extractedText, uploaded_at as uploadedAt
        FROM cv_documents
        ORDER BY uploaded_at DESC
        LIMIT 1
      `
    )
    .get() as CvDocument | undefined;

  return row ?? null;
}

export function getCvById(id: number): CvDocument | null {
  const row = db
    .prepare(
      `
        SELECT id, filename, mime_type as mimeType, storage_path as storagePath, extracted_text as extractedText, uploaded_at as uploadedAt
        FROM cv_documents
        WHERE id = ?
      `
    )
    .get(id) as CvDocument | undefined;

  return row ?? null;
}

export function listCvDocuments(): CvDocument[] {
  return db
    .prepare(
      `
        SELECT id, filename, mime_type as mimeType, storage_path as storagePath, extracted_text as extractedText, uploaded_at as uploadedAt
        FROM cv_documents
        ORDER BY uploaded_at DESC
      `
    )
    .all() as CvDocument[];
}

export function getCvCorpus(): string {
  return listCvDocuments()
    .map((document) => document.extractedText.trim())
    .filter(Boolean)
    .join("\n\n");
}

export function saveCvDocument(input: Omit<CvDocument, "id" | "uploadedAt"> & { uploadedAt?: string }): CvDocument {
  const uploadedAt = input.uploadedAt ?? nowIso();
  const result = db
    .prepare(
      `
        INSERT INTO cv_documents (filename, mime_type, storage_path, extracted_text, uploaded_at)
        VALUES (?, ?, ?, ?, ?)
      `
    )
    .run(input.filename, input.mimeType, input.storagePath, input.extractedText, uploadedAt);

  return {
    id: Number(result.lastInsertRowid),
    filename: input.filename,
    mimeType: input.mimeType,
    storagePath: input.storagePath,
    extractedText: input.extractedText,
    uploadedAt
  };
}

export function listJobs(filters: {
  status?: string;
  decision?: string;
  source?: string;
  search?: string;
} = {}): JobRecord[] {
  const conditions: string[] = [];
  const values: Array<string | number> = [];

  if (filters.status) {
    conditions.push("application_status = ?");
    values.push(filters.status);
  }

  if (filters.decision) {
    conditions.push("ai_decision = ?");
    values.push(filters.decision);
  }

  if (filters.source) {
    conditions.push("source = ?");
    values.push(filters.source);
  }

  if (filters.search) {
    conditions.push("(title LIKE ? OR company LIKE ? OR description LIKE ?)");
    const query = `%${filters.search}%`;
    values.push(query, query, query);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = db
    .prepare(
      `
        SELECT
          id,
          source,
          source_job_id as sourceJobId,
          title,
          company,
          location,
          employment_type as employmentType,
          remote_type as remoteType,
          salary_text as salaryText,
          salary_min_usd as salaryMinUsd,
          salary_max_usd as salaryMaxUsd,
          url,
          description,
          posted_at as postedAt,
          discovered_at as discoveredAt,
          query_text as queryText,
          provider_message as providerMessage,
          ai_score as aiScore,
          ai_decision as aiDecision,
          ai_reason as aiReason,
          cv_score as cvScore,
          cv_reason as cvReason,
          cover_letter as coverLetter,
          application_status as applicationStatus,
          notes,
          raw_json as rawJson,
          updated_at as updatedAt
        FROM jobs
        ${whereClause}
        ORDER BY COALESCE(ai_score, 0) DESC, discovered_at DESC
      `
    )
    .all(...values) as JobRecord[];

  return rows;
}

export function getJobById(id: string): JobRecord | null {
  const row = db
    .prepare(
      `
        SELECT
          id,
          source,
          source_job_id as sourceJobId,
          title,
          company,
          location,
          employment_type as employmentType,
          remote_type as remoteType,
          salary_text as salaryText,
          salary_min_usd as salaryMinUsd,
          salary_max_usd as salaryMaxUsd,
          url,
          description,
          posted_at as postedAt,
          discovered_at as discoveredAt,
          query_text as queryText,
          provider_message as providerMessage,
          ai_score as aiScore,
          ai_decision as aiDecision,
          ai_reason as aiReason,
          cv_score as cvScore,
          cv_reason as cvReason,
          cover_letter as coverLetter,
          application_status as applicationStatus,
          notes,
          raw_json as rawJson,
          updated_at as updatedAt
        FROM jobs
        WHERE id = ?
      `
    )
    .get(id) as JobRecord | undefined;

  return row ?? null;
}

export function upsertJob(job: JobRecord): void {
  db.prepare(
    `
      INSERT INTO jobs (
        id,
        source,
        source_job_id,
        title,
        company,
        location,
        employment_type,
        remote_type,
        salary_text,
        salary_min_usd,
        salary_max_usd,
        url,
        description,
        posted_at,
        discovered_at,
        query_text,
        provider_message,
        ai_score,
        ai_decision,
        ai_reason,
        cv_score,
        cv_reason,
        cover_letter,
        application_status,
        notes,
        raw_json,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        source = excluded.source,
        source_job_id = excluded.source_job_id,
        title = excluded.title,
        company = excluded.company,
        location = excluded.location,
        employment_type = excluded.employment_type,
        remote_type = excluded.remote_type,
        salary_text = excluded.salary_text,
        salary_min_usd = excluded.salary_min_usd,
        salary_max_usd = excluded.salary_max_usd,
        url = excluded.url,
        description = excluded.description,
        posted_at = excluded.posted_at,
        discovered_at = excluded.discovered_at,
        query_text = excluded.query_text,
        provider_message = excluded.provider_message,
        ai_score = COALESCE(excluded.ai_score, jobs.ai_score),
        ai_decision = COALESCE(excluded.ai_decision, jobs.ai_decision),
        ai_reason = COALESCE(excluded.ai_reason, jobs.ai_reason),
        cv_score = COALESCE(excluded.cv_score, jobs.cv_score),
        cv_reason = COALESCE(excluded.cv_reason, jobs.cv_reason),
        cover_letter = COALESCE(excluded.cover_letter, jobs.cover_letter),
        application_status = COALESCE(jobs.application_status, excluded.application_status),
        notes = COALESCE(jobs.notes, excluded.notes),
        raw_json = excluded.raw_json,
        updated_at = excluded.updated_at
    `
  ).run(
    job.id,
    job.source,
    job.sourceJobId ?? null,
    job.title,
    job.company,
    job.location,
    job.employmentType ?? null,
    job.remoteType ?? null,
    job.salaryText ?? null,
    job.salaryMinUsd ?? null,
    job.salaryMaxUsd ?? null,
    job.url,
    job.description,
    job.postedAt ?? null,
    job.discoveredAt,
    job.queryText ?? null,
    job.providerMessage ?? null,
    job.aiScore ?? null,
    job.aiDecision ?? null,
    job.aiReason ?? null,
    job.cvScore ?? null,
    job.cvReason ?? null,
    job.coverLetter ?? null,
    job.applicationStatus,
    job.notes,
    job.rawJson,
    job.updatedAt
  );
}

export function updateJobAnalysis(
  id: string,
  input: {
    aiScore?: number | null;
    aiDecision?: string | null;
    aiReason?: string | null;
    cvScore?: number | null;
    cvReason?: string | null;
    coverLetter?: string | null;
  }
): void {
  db.prepare(
    `
      UPDATE jobs
      SET
        ai_score = COALESCE(?, ai_score),
        ai_decision = COALESCE(?, ai_decision),
        ai_reason = COALESCE(?, ai_reason),
        cv_score = COALESCE(?, cv_score),
        cv_reason = COALESCE(?, cv_reason),
        cover_letter = COALESCE(?, cover_letter),
        updated_at = ?
      WHERE id = ?
    `
  ).run(
    input.aiScore ?? null,
    input.aiDecision ?? null,
    input.aiReason ?? null,
    input.cvScore ?? null,
    input.cvReason ?? null,
    input.coverLetter ?? null,
    nowIso(),
    id
  );
}

export function updateJobMeta(
  id: string,
  input: { applicationStatus?: string; notes?: string }
): JobRecord | null {
  const current = getJobById(id);

  if (!current) {
    return null;
  }

  db.prepare(
    `
      UPDATE jobs
      SET
        application_status = ?,
        notes = ?,
        updated_at = ?
      WHERE id = ?
    `
  ).run(
    input.applicationStatus ?? current.applicationStatus,
    input.notes ?? current.notes,
    nowIso(),
    id
  );

  return getJobById(id);
}

export function deleteJobById(id: string): boolean {
  const result = db.prepare("DELETE FROM jobs WHERE id = ?").run(id);
  return result.changes > 0;
}

export function recordAiUsage(operation: string, estimatedCostUsd: number, metadata: unknown): void {
  const createdAt = nowIso();
  const date = createdAt.slice(0, 10);
  db.prepare(
    `
      INSERT INTO ai_usage (date, operation, estimated_cost_usd, metadata, created_at)
      VALUES (?, ?, ?, ?, ?)
    `
  ).run(date, operation, estimatedCostUsd, JSON.stringify(metadata), createdAt);
}

export function getAiSpendToday(): number {
  const today = nowIso().slice(0, 10);
  const row = db
    .prepare(
      `
        SELECT COALESCE(SUM(estimated_cost_usd), 0) as total
        FROM ai_usage
        WHERE date = ?
      `
    )
    .get(today) as { total: number };

  return Number(row.total ?? 0);
}

export function recordProviderRun(run: ProviderRun): void {
  db.prepare(
    `
      INSERT INTO provider_runs (provider_id, success, fetched_count, message, created_at)
      VALUES (?, ?, ?, ?, ?)
    `
  ).run(run.providerId, run.success ? 1 : 0, run.fetchedCount, run.message, run.createdAt);
}

export function getRecentProviderRuns(limit = 20): ProviderRun[] {
  return db
    .prepare(
      `
        SELECT
          provider_id as providerId,
          success,
          fetched_count as fetchedCount,
          message,
          created_at as createdAt
        FROM provider_runs
        ORDER BY created_at DESC
        LIMIT ?
      `
    )
    .all(limit)
    .map((row) => {
      const typedRow = row as {
        providerId: string;
        success: number;
        fetchedCount: number;
        message: string;
        createdAt: string;
      };

      return {
        providerId: typedRow.providerId,
        success: Boolean(typedRow.success),
        fetchedCount: typedRow.fetchedCount,
        message: typedRow.message,
        createdAt: typedRow.createdAt
      };
    }) as ProviderRun[];
}

export function getDashboardPayload(): DashboardPayload {
  const summary = db
    .prepare(
      `
        SELECT
          COUNT(*) as totalJobs,
          COALESCE(SUM(CASE WHEN ai_decision = 'APPLY' THEN 1 ELSE 0 END), 0) as applyCount,
          COALESCE(SUM(CASE WHEN ai_decision = 'REVIEW' THEN 1 ELSE 0 END), 0) as reviewCount,
          COALESCE(SUM(CASE WHEN ai_decision = 'REJECT' THEN 1 ELSE 0 END), 0) as rejectedCount,
          COALESCE(SUM(CASE WHEN application_status IN ('APPLIED', 'INTERVIEW', 'OFFER') THEN 1 ELSE 0 END), 0) as activeApplications,
          COALESCE(AVG(ai_score), 0) as averageScore
        FROM jobs
      `
    )
    .get() as {
    totalJobs: number;
    applyCount: number;
    reviewCount: number;
    rejectedCount: number;
    activeApplications: number;
    averageScore: number;
  };

  const byStatus = db
    .prepare(
      `
        SELECT application_status as name, COUNT(*) as value
        FROM jobs
        GROUP BY application_status
        ORDER BY value DESC
      `
    )
    .all() as Array<{ name: string; value: number }>;

  const byDecision = db
    .prepare(
      `
        SELECT COALESCE(ai_decision, 'UNSCORED') as name, COUNT(*) as value
        FROM jobs
        GROUP BY COALESCE(ai_decision, 'UNSCORED')
        ORDER BY value DESC
      `
    )
    .all() as Array<{ name: string; value: number }>;

  const bySource = db
    .prepare(
      `
        SELECT source as name, COUNT(*) as value
        FROM jobs
        GROUP BY source
        ORDER BY value DESC
      `
    )
    .all() as Array<{ name: string; value: number }>;

  const scoreTrend = db
    .prepare(
      `
        SELECT
          substr(discovered_at, 1, 10) as date,
          ROUND(COALESCE(AVG(ai_score), 0), 2) as avgScore,
          COUNT(*) as jobs
        FROM jobs
        GROUP BY substr(discovered_at, 1, 10)
        ORDER BY date DESC
        LIMIT 14
      `
    )
    .all()
    .reverse() as Array<{ date: string; avgScore: number; jobs: number }>;

  return {
    summary: {
      ...summary,
      aiSpendToday: getAiSpendToday(),
      averageScore: Number(summary.averageScore || 0)
    },
    byStatus,
    byDecision,
    bySource,
    scoreTrend,
    providerRuns: getRecentProviderRuns()
  };
}
