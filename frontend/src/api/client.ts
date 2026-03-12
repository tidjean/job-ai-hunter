import type {
  AppConfig,
  CandidateProfile,
  CvDocument,
  DashboardPayload,
  JobRecord,
  RefreshResult
} from "../types/app";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8787/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...init?.headers
    },
    ...init
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed with ${response.status}`);
  }

  return (await response.json()) as T;
}

export const api = {
  getDashboard: () => request<DashboardPayload>("/dashboard"),
  getJobs: () => request<JobRecord[]>("/jobs"),
  refreshJobs: (forceRescore = false) =>
    request<RefreshResult>("/jobs/refresh", {
      method: "POST",
      body: JSON.stringify({ forceRescore })
    }),
  scoreJob: (id: string) => request<JobRecord>(`/jobs/${id}/score`, { method: "POST" }),
  generateCoverLetter: (id: string) =>
    request<JobRecord>(`/jobs/${id}/cover-letter`, { method: "POST" }),
  updateJob: (id: string, payload: { applicationStatus?: string; notes?: string }) =>
    request<JobRecord>(`/jobs/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
  getAdminState: () =>
    request<{ profile: CandidateProfile; config: AppConfig; cv: CvDocument | null }>("/admin/state"),
  saveProfile: (profile: CandidateProfile) =>
    request<CandidateProfile>("/admin/profile", {
      method: "PUT",
      body: JSON.stringify(profile)
    }),
  saveConfig: (config: AppConfig) =>
    request<AppConfig>("/admin/config", {
      method: "PUT",
      body: JSON.stringify(config)
    }),
  uploadCv: async (file: File) => {
    const form = new FormData();
    form.append("cv", file);
    return request<CvDocument>("/admin/cv", {
      method: "POST",
      body: form
    });
  }
};
