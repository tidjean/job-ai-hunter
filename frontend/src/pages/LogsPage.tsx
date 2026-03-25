import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { ProviderRun } from "../types/app";

export function LogsPage() {
  const [runs, setRuns] = useState<ProviderRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadRuns = async () => {
      try {
        setLoading(true);
        setError(null);
        setRuns(await api.getProviderRuns(200));
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load provider logs");
      } finally {
        setLoading(false);
      }
    };

    void loadRuns();
  }, []);

  return (
    <div className="page">
      <div className="page-header d-flex flex-wrap justify-content-between align-items-start">
        <div>
          <h2>Logs</h2>
          <p>Provider execution history, success status, fetched counts and blocker messages.</p>
        </div>
      </div>

      <section className="panel logs-panel card border-0">
        {loading ? <div className="empty-state">Loading provider logs...</div> : null}
        {error ? <div className="empty-state">{error}</div> : null}
        {!loading && !error ? (
          <div className="provider-list">
            {runs.map((run) => (
              <div key={`${run.providerId}-${run.createdAt}`} className={`provider-row ${run.success ? "ok" : "warn"}`}>
                <div>
                  <strong>{run.providerId}</strong>
                  <span>{run.message}</span>
                </div>
                <div className="provider-run-meta">
                  <small>{run.fetchedCount} jobs</small>
                  <small>{new Date(run.createdAt).toLocaleString()}</small>
                </div>
              </div>
            ))}
            {runs.length === 0 ? <div className="empty-state">No provider runs yet.</div> : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
