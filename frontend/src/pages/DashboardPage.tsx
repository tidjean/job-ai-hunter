import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { useAppData } from "../contexts/AppDataContext";
import { StatCard } from "../components/StatCard";
import { StatePanel } from "../components/StatePanel";

export function DashboardPage() {
  const { dashboard, runRefresh, refreshAll, busyAction, lastRefreshResult, loading, error } = useAppData();

  if (loading && !dashboard) {
    return <div className="empty-state">Loading dashboard...</div>;
  }

  if (!dashboard) {
    return (
      <StatePanel
        title="Dashboard unavailable"
        description={error ?? "The application data could not be loaded."}
        actionLabel="Retry"
        onAction={() => void refreshAll()}
      />
    );
  }

  return (
    <div className="page d-grid">
      <div className="page-header d-flex flex-wrap justify-content-between align-items-start">
        <div>
          <h2>Dashboard</h2>
          <p>Pipeline global, budget IA, santé des sources et qualité de matching.</p>
        </div>
        <div className="header-actions d-flex flex-wrap">
          <button className="btn btn-primary" onClick={() => void runRefresh(false)} disabled={Boolean(busyAction)}>
            Refresh jobs
          </button>
          <button className="secondary btn btn-outline-info" onClick={() => void runRefresh(true)} disabled={Boolean(busyAction)}>
            Force rescore
          </button>
        </div>
      </div>

      <section className="stats-grid">
        <StatCard label="Total jobs" value={dashboard.summary.totalJobs} />
        <StatCard label="Apply" value={dashboard.summary.applyCount} tone="good" />
        <StatCard label="Review" value={dashboard.summary.reviewCount} />
        <StatCard label="Rejected" value={dashboard.summary.rejectedCount} tone="warn" />
        <StatCard label="Active applications" value={dashboard.summary.activeApplications} />
        <StatCard label="AI spend today" value={`$${dashboard.summary.aiSpendToday.toFixed(2)}`} />
        <StatCard label="Average score" value={dashboard.summary.averageScore.toFixed(1)} />
      </section>

      {dashboard.summary.totalJobs === 0 ? (
        <StatePanel
          title="No jobs in the pipeline yet"
          description="The dashboard is connected, but the local database does not contain any jobs yet. Launch a refresh to fetch live providers and the built-in demo source."
          actionLabel="Fetch jobs now"
          onAction={() => void runRefresh(false)}
          secondaryActionLabel="Force rescore"
          onSecondaryAction={() => void runRefresh(true)}
        />
      ) : null}

      {lastRefreshResult ? (
        <section className="panel accent-panel card border-0">
          <h3>Last refresh</h3>
          <p>
            {lastRefreshResult.inserted} jobs upserted, {lastRefreshResult.scored} scored,{" "}
            {lastRefreshResult.coverLetters} cover letters generated.
          </p>
          <div className="chip-row">
            {lastRefreshResult.searchPlan.map((query) => (
              <span key={query} className="chip">
                {query}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      <section className="grid-two">
        <div className="panel chart-panel card border-0">
          <div className="panel-header d-flex justify-content-between">
            <h3>Score trend</h3>
            <span>14 latest refresh days</span>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={dashboard.scoreTrend}>
              <defs>
                <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ff9d2f" stopOpacity={0.8} />
                  <stop offset="100%" stopColor="#ff9d2f" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
              <XAxis dataKey="date" stroke="#8f98b7" />
              <YAxis stroke="#8f98b7" />
              <Tooltip />
              <Area type="monotone" dataKey="avgScore" stroke="#ff9d2f" fill="url(#scoreGradient)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="panel chart-panel card border-0">
          <div className="panel-header d-flex justify-content-between">
            <h3>Pipeline by status</h3>
            <span>Applications and review flow</span>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={dashboard.byStatus}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
              <XAxis dataKey="name" stroke="#8f98b7" />
              <YAxis stroke="#8f98b7" />
              <Tooltip />
              <Bar dataKey="value" fill="#78f0b7" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="grid-two">
        <div className="panel chart-panel card border-0">
          <div className="panel-header d-flex justify-content-between">
            <h3>Decision split</h3>
            <span>AI qualification output</span>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={dashboard.byDecision} dataKey="value" nameKey="name" outerRadius={90} fill="#73dbff" />
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="panel card border-0">
          <div className="panel-header d-flex justify-content-between">
            <h3>Provider activity</h3>
            <span>Most recent runs</span>
          </div>
          <div className="provider-list">
            {dashboard.providerRuns.slice(0, 8).map((run) => (
              <div key={`${run.providerId}-${run.createdAt}`} className={`provider-row ${run.success ? "ok" : "warn"}`}>
                <div>
                  <strong>{run.providerId}</strong>
                  <span>{run.message}</span>
                </div>
                <small>{new Date(run.createdAt).toLocaleString()}</small>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
