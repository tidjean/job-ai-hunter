import type {
  AdminStatePayload,
  AiCredentialsStatus,
  AppConfig,
  CandidateProfile,
  CvDocument,
  DashboardPayload,
  JobRecord,
  ProviderRun,
  RefreshResult
} from "../types/app";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";

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

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export const api = {
  getDashboard: () => request<DashboardPayload>("/dashboard"),
  getProviderRuns: (limit = 100) => request<ProviderRun[]>(`/providers/runs?limit=${limit}`),
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
  deleteJob: (id: string) =>
    request<void>(`/jobs/${id}`, {
      method: "DELETE"
    }),
  getAdminState: () => request<AdminStatePayload>("/admin/state"),
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
  },
  saveOpenAiApiKey: (apiKey: string) =>
    request<AiCredentialsStatus>("/admin/ai/key", {
      method: "PUT",
      body: JSON.stringify({ apiKey })
    }),
  clearOpenAiApiKey: () =>
    request<AiCredentialsStatus>("/admin/ai/key", {
      method: "DELETE"
    }),
  testOpenAiConnection: () =>
    request<{ ok: true; model: string; message: string }>("/admin/ai/test", {
      method: "POST"
    })
};
