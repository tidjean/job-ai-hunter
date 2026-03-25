export type JobDecision = "APPLY" | "REVIEW" | "REJECT" | "UNSCORED";

export type ApplicationStatus =
  | "NEW"
  | "SHORTLISTED"
  | "APPLIED"
  | "INTERVIEW"
  | "OFFER"
  | "REJECTED"
  | "ARCHIVED";

export interface CandidateProfile {
  fullName: string;
  headline: string;
  email: string;
  location: string;
  timezone: string;
  yearsExperience: number;
  remoteOnly: boolean;
  minMonthlySalaryUsd: number;
  preferredEmployment: Array<"employee" | "contract">;
  summary: string;
  skills: string[];
  desiredKeywords: string[];
  excludedKeywords: string[];
  preferredIndustries: string[];
  languages: string[];
}

export interface SourceConfig {
  enabled: boolean;
  label: string;
  query: string;
  limit: number;
  autoDisabled?: boolean;
  autoDisabledReason?: string | null;
  lastFailureAt?: string | null;
}

export interface AppConfig {
  aiModel: string;
  maxDailyAiBudgetUsd: number;
  autoScore: boolean;
  autoCompareCv: boolean;
  autoGenerateCoverLetters: boolean;
  coverLetterThreshold: number;
  applyThreshold: number;
  reviewThreshold: number;
  searchPlanQueriesPerRefresh: number;
  sources: Record<string, SourceConfig>;
}

export interface CvDocument {
  id: number;
  filename: string;
  mimeType: string;
  storagePath: string;
  extractedText: string;
  uploadedAt: string;
}

export interface JobRecord {
  id: string;
  source: string;
  sourceJobId?: string | null;
  title: string;
  company: string;
  location: string;
  employmentType?: string | null;
  remoteType?: string | null;
  salaryText?: string | null;
  salaryMinUsd?: number | null;
  salaryMaxUsd?: number | null;
  url: string;
  description: string;
  postedAt?: string | null;
  discoveredAt: string;
  queryText?: string | null;
  providerMessage?: string | null;
  aiScore?: number | null;
  aiDecision?: JobDecision | null;
  aiReason?: string | null;
  cvScore?: number | null;
  cvReason?: string | null;
  coverLetter?: string | null;
  applicationStatus: ApplicationStatus;
  notes: string;
  rawJson: string;
  updatedAt: string;
}

export interface ProviderRun {
  providerId: string;
  success: boolean;
  fetchedCount: number;
  message: string;
  createdAt: string;
}

export interface DashboardPayload {
  summary: {
    totalJobs: number;
    applyCount: number;
    reviewCount: number;
    rejectedCount: number;
    activeApplications: number;
    aiSpendToday: number;
    averageScore: number;
  };
  byStatus: Array<{ name: string; value: number }>;
  byDecision: Array<{ name: string; value: number }>;
  bySource: Array<{ name: string; value: number }>;
  scoreTrend: Array<{ date: string; avgScore: number; jobs: number }>;
  providerRuns: ProviderRun[];
}

export interface RefreshResult {
  providerRuns: ProviderRun[];
  searchPlan: string[];
  inserted: number;
  scored: number;
  coverLetters: number;
}

export interface AiCredentialsStatus {
  hasStoredKey: boolean;
  source: "database" | "environment" | "none";
  maskedKey: string | null;
  updatedAt: string | null;
}

export interface AdminStatePayload {
  profile: CandidateProfile;
  config: AppConfig;
  cv: CvDocument | null;
  aiCredentials: AiCredentialsStatus;
}
