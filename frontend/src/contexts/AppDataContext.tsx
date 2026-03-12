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
  loading: boolean;
  busyAction: string | null;
  message: string | null;
  lastRefreshResult: RefreshResult | null;
  refreshAll: () => Promise<void>;
  runRefresh: (forceRescore?: boolean) => Promise<void>;
  saveProfile: (profile: CandidateProfile) => Promise<void>;
  saveConfig: (config: AppConfig) => Promise<void>;
  uploadCv: (file: File) => Promise<void>;
  updateJob: (id: string, payload: { applicationStatus?: string; notes?: string }) => Promise<void>;
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
  const [loading, setLoading] = useState(true);
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
      startTransition(() => {
        setDashboard(dashboardData);
        setJobs(jobsData);
        setProfile(adminState.profile);
        setConfig(adminState.config);
        setCv(adminState.cv);
      });
      setMessage(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load application data");
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
      loading,
      busyAction,
      message,
      lastRefreshResult,
      refreshAll,
      runRefresh,
      saveProfile: persistProfile,
      saveConfig: persistConfig,
      uploadCv,
      updateJob,
      scoreJob,
      generateCoverLetter: generateLetter
    }),
    [
      dashboard,
      jobs,
      profile,
      config,
      cv,
      loading,
      busyAction,
      message,
      lastRefreshResult,
      refreshAll,
      runRefresh,
      persistProfile,
      persistConfig,
      uploadCv,
      updateJob,
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
