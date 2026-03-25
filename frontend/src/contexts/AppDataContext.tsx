import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren
} from "react";
import { api } from "../api/client";
import type {
  AdminStatePayload,
  AiCredentialsStatus,
  AppConfig,
  CandidateProfile,
  CvDocument,
  DashboardPayload,
  JobRecord,
  RefreshResult
} from "../types/app";

interface AppDataContextValue {
  dashboard: DashboardPayload | null;
  jobs: JobRecord[];
  profile: CandidateProfile | null;
  config: AppConfig | null;
  cv: CvDocument | null;
  aiCredentials: AiCredentialsStatus | null;
  loading: boolean;
  error: string | null;
  busyAction: string | null;
  message: string | null;
  lastRefreshResult: RefreshResult | null;
  refreshAll: () => Promise<void>;
  runRefresh: (forceRescore?: boolean) => Promise<void>;
  saveProfile: (profile: CandidateProfile) => Promise<void>;
  saveConfig: (config: AppConfig) => Promise<void>;
  saveOpenAiApiKey: (apiKey: string) => Promise<void>;
  clearOpenAiApiKey: () => Promise<void>;
  testOpenAiConnection: () => Promise<void>;
  uploadCv: (file: File) => Promise<void>;
  updateJob: (id: string, payload: { applicationStatus?: string; notes?: string }) => Promise<void>;
  deleteJob: (id: string) => Promise<void>;
  scoreJob: (id: string) => Promise<void>;
  generateCoverLetter: (id: string) => Promise<void>;
}

const AppDataContext = createContext<AppDataContextValue | undefined>(undefined);

export function AppDataProvider({ children }: PropsWithChildren) {
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [cv, setCv] = useState<CvDocument | null>(null);
  const [aiCredentials, setAiCredentials] = useState<AiCredentialsStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [lastRefreshResult, setLastRefreshResult] = useState<RefreshResult | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [dashboardData, jobsData, adminState] = await Promise.all([
        api.getDashboard(),
        api.getJobs(),
        api.getAdminState()
      ]);
      const typedAdminState = adminState as AdminStatePayload;
      startTransition(() => {
        setDashboard(dashboardData);
        setJobs(jobsData);
        setProfile(typedAdminState.profile);
        setConfig(typedAdminState.config);
        setCv(typedAdminState.cv);
        setAiCredentials(typedAdminState.aiCredentials);
      });
      setError(null);
      setMessage(null);
    } catch (error) {
      const nextError = error instanceof Error ? error.message : "Unable to load application data";
      setError(nextError);
      setMessage(nextError);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const updateSingleJob = useCallback((nextJob: JobRecord) => {
    setJobs((current) => current.map((job) => (job.id === nextJob.id ? nextJob : job)));
  }, []);

  const removeSingleJob = useCallback((id: string) => {
    setJobs((current) => current.filter((job) => job.id !== id));
  }, []);

  const refreshAll = useCallback(async () => {
    await loadAll();
  }, [loadAll]);

  const runRefresh = useCallback(async (forceRescore = false) => {
    setBusyAction("Refreshing jobs");
    try {
      const result = await api.refreshJobs(forceRescore);
      setLastRefreshResult(result);
      await loadAll();
      setMessage(`Refresh completed. ${result.inserted} jobs upserted, ${result.scored} scored.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Refresh failed");
    } finally {
      setBusyAction(null);
    }
  }, [loadAll]);

  const persistProfile = useCallback(async (nextProfile: CandidateProfile) => {
    setBusyAction("Saving profile");
    try {
      const saved = await api.saveProfile(nextProfile);
      setProfile(saved);
      setMessage("Profile saved");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save profile");
    } finally {
      setBusyAction(null);
    }
  }, []);

  const persistConfig = useCallback(async (nextConfig: AppConfig) => {
    setBusyAction("Saving configuration");
    try {
      const saved = await api.saveConfig(nextConfig);
      setConfig(saved);
      await loadAll();
      setMessage("Configuration saved");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save configuration");
    } finally {
      setBusyAction(null);
    }
  }, [loadAll]);

  const uploadCv = useCallback(async (file: File) => {
    setBusyAction("Uploading CV");
    try {
      const saved = await api.uploadCv(file);
      setCv(saved);
      setMessage("CV uploaded");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to upload CV");
    } finally {
      setBusyAction(null);
    }
  }, []);

  const persistOpenAiApiKey = useCallback(async (apiKey: string) => {
    setBusyAction("Saving OpenAI key");
    try {
      const saved = await api.saveOpenAiApiKey(apiKey);
      setAiCredentials(saved);
      setMessage("OpenAI API key saved");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save OpenAI API key");
    } finally {
      setBusyAction(null);
    }
  }, []);

  const removeOpenAiApiKey = useCallback(async () => {
    setBusyAction("Removing OpenAI key");
    try {
      const saved = await api.clearOpenAiApiKey();
      setAiCredentials(saved);
      setMessage("Stored OpenAI API key removed");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to remove OpenAI API key");
    } finally {
      setBusyAction(null);
    }
  }, []);

  const runOpenAiConnectionTest = useCallback(async () => {
    setBusyAction("Testing OpenAI connection");
    try {
      const result = await api.testOpenAiConnection();
      setMessage(result.message);
      await loadAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to test OpenAI connection");
    } finally {
      setBusyAction(null);
    }
  }, [loadAll]);

  const updateJob = useCallback(async (id: string, payload: { applicationStatus?: string; notes?: string }) => {
    setBusyAction("Saving job");
    try {
      const saved = await api.updateJob(id, payload);
      updateSingleJob(saved);
      await loadAll();
      setMessage("Job updated");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update job");
    } finally {
      setBusyAction(null);
    }
  }, [loadAll, updateSingleJob]);

  const deleteJob = useCallback(async (id: string) => {
    setBusyAction("Deleting job");
    try {
      await api.deleteJob(id);
      removeSingleJob(id);
      await loadAll();
      setMessage("Job deleted");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to delete job");
    } finally {
      setBusyAction(null);
    }
  }, [loadAll, removeSingleJob]);

  const scoreJob = useCallback(async (id: string) => {
    setBusyAction("Scoring job");
    try {
      const saved = await api.scoreJob(id);
      updateSingleJob(saved);
      await loadAll();
      setMessage("Job rescored");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to score job");
    } finally {
      setBusyAction(null);
    }
  }, [loadAll, updateSingleJob]);

  const generateLetter = useCallback(async (id: string) => {
    setBusyAction("Generating cover letter");
    try {
      const saved = await api.generateCoverLetter(id);
      updateSingleJob(saved);
      setMessage("Cover letter generated");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to generate cover letter");
    } finally {
      setBusyAction(null);
    }
  }, [updateSingleJob]);

  const value = useMemo(
    () => ({
      dashboard,
      jobs,
      profile,
      config,
      cv,
      aiCredentials,
      loading,
      error,
      busyAction,
      message,
      lastRefreshResult,
      refreshAll,
      runRefresh,
      saveProfile: persistProfile,
      saveConfig: persistConfig,
      saveOpenAiApiKey: persistOpenAiApiKey,
      clearOpenAiApiKey: removeOpenAiApiKey,
      testOpenAiConnection: runOpenAiConnectionTest,
      uploadCv,
      updateJob,
      deleteJob,
      scoreJob,
      generateCoverLetter: generateLetter
    }),
    [
      dashboard,
      jobs,
      profile,
      config,
      cv,
      aiCredentials,
      loading,
      error,
      busyAction,
      message,
      lastRefreshResult,
      refreshAll,
      runRefresh,
      persistProfile,
      persistConfig,
      persistOpenAiApiKey,
      removeOpenAiApiKey,
      runOpenAiConnectionTest,
      uploadCv,
      updateJob,
      deleteJob,
      scoreJob,
      generateLetter
    ]
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData() {
  const context = useContext(AppDataContext);
  if (!context) {
    throw new Error("useAppData must be used inside AppDataProvider");
  }
  return context;
}
