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

export interface ProviderJob {
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
  queryText?: string | null;
  providerMessage?: string | null;
  rawPayload: unknown;
}

export interface ProviderResult {
  providerId: string;
  jobs: ProviderJob[];
  success: boolean;
  message: string;
}

export interface JobAnalysis {
  score: number;
  decision: Exclude<JobDecision, "UNSCORED">;
  reason: string;
  remoteFit: string;
  compensationFit: string;
  techFit: string;
  contractFit: string;
  cvScore: number;
  cvReason: string;
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
