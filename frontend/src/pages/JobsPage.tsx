import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useAppData } from "../contexts/AppDataContext";
import type { ApplicationStatus, JobRecord } from "../types/app";

const statuses: ApplicationStatus[] = [
  "NEW",
  "SHORTLISTED",
  "APPLIED",
  "INTERVIEW",
  "OFFER",
  "REJECTED",
  "ARCHIVED"
];

export function JobsPage() {
  const { jobs, scoreJob, generateCoverLetter, updateJob, busyAction } = useAppData();
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [decisionFilter, setDecisionFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const deferredSearch = useDeferredValue(search);

  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      const matchesSearch =
        !deferredSearch ||
        `${job.title} ${job.company} ${job.description}`.toLowerCase().includes(deferredSearch.toLowerCase());
      const matchesDecision = decisionFilter === "ALL" || (job.aiDecision ?? "UNSCORED") === decisionFilter;
      const matchesStatus = statusFilter === "ALL" || job.applicationStatus === statusFilter;
      return matchesSearch && matchesDecision && matchesStatus;
    });
  }, [decisionFilter, deferredSearch, jobs, statusFilter]);

  useEffect(() => {
    if (!selectedJobId && filteredJobs[0]) {
      setSelectedJobId(filteredJobs[0].id);
    }
  }, [filteredJobs, selectedJobId]);

  const selectedJob = filteredJobs.find((job) => job.id === selectedJobId) ?? null;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Jobs</h2>
          <p>Filtre, qualifie, compare au CV et génère une cover letter à la demande.</p>
        </div>
      </div>

      <div className="toolbar">
        <input
          className="search-input"
          placeholder="Search jobs, companies, description..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select value={decisionFilter} onChange={(event) => setDecisionFilter(event.target.value)}>
          <option value="ALL">All decisions</option>
          <option value="APPLY">APPLY</option>
          <option value="REVIEW">REVIEW</option>
          <option value="REJECT">REJECT</option>
          <option value="UNSCORED">UNSCORED</option>
        </select>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="ALL">All statuses</option>
          {statuses.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </div>

      <section className="jobs-layout">
        <div className="panel jobs-table">
          <div className="table-head">
            <span>Role</span>
            <span>Score</span>
            <span>Status</span>
          </div>
          {filteredJobs.map((job) => (
            <button
              key={job.id}
              type="button"
              className={`job-row ${selectedJobId === job.id ? "active" : ""}`}
              onClick={() => setSelectedJobId(job.id)}
            >
              <div>
                <strong>{job.title}</strong>
                <span>
                  {job.company} · {job.source}
                </span>
                <small>
                  {job.location} {job.remoteType ? `· ${job.remoteType}` : ""}
                </small>
              </div>
              <b>{job.aiScore?.toFixed(0) ?? "-"}</b>
              <em>{job.applicationStatus}</em>
            </button>
          ))}
        </div>

        <div className="panel job-detail">
          {selectedJob ? <JobDetail job={selectedJob} /> : <div className="empty-state">No job selected.</div>}
          {selectedJob ? (
            <div className="detail-actions">
              <button disabled={Boolean(busyAction)} onClick={() => void scoreJob(selectedJob.id)}>
                Rescore
              </button>
              <button
                className="secondary"
                disabled={Boolean(busyAction)}
                onClick={() => void generateCoverLetter(selectedJob.id)}
              >
                Generate cover letter
              </button>
              <a href={selectedJob.url} target="_blank" rel="noreferrer">
                Open listing
              </a>
            </div>
          ) : null}
          {selectedJob ? (
            <JobStatusEditor job={selectedJob} onSave={(payload) => void updateJob(selectedJob.id, payload)} />
          ) : null}
        </div>
      </section>
    </div>
  );
}

function JobDetail({ job }: { job: JobRecord }) {
  return (
    <div>
      <div className="panel-header">
        <div>
          <h3>{job.title}</h3>
          <span>
            {job.company} · {job.location}
          </span>
        </div>
        <span className={`score-badge score-${(job.aiDecision ?? "UNSCORED").toLowerCase()}`}>
          {job.aiDecision ?? "UNSCORED"} {job.aiScore ? `· ${job.aiScore.toFixed(0)}` : ""}
        </span>
      </div>

      <div className="chip-row">
        {job.remoteType ? <span className="chip">{job.remoteType}</span> : null}
        {job.employmentType ? <span className="chip">{job.employmentType}</span> : null}
        {job.salaryText ? <span className="chip">{job.salaryText}</span> : null}
        {job.queryText ? <span className="chip">Query: {job.queryText}</span> : null}
      </div>

      <div className="detail-grid">
        <div>
          <h4>AI reason</h4>
          <p>{job.aiReason ?? "Not scored yet."}</p>
        </div>
        <div>
          <h4>CV match</h4>
          <p>
            {job.cvScore?.toFixed(0) ?? "-"} / 100
            <br />
            {job.cvReason ?? "No CV comparison yet."}
          </p>
        </div>
      </div>

      <div className="description-block">
        <h4>Description</h4>
        <p>{job.description}</p>
      </div>

      <div className="description-block">
        <h4>Cover letter</h4>
        <pre>{job.coverLetter ?? "No cover letter generated yet."}</pre>
      </div>
    </div>
  );
}

function JobStatusEditor({
  job,
  onSave
}: {
  job: JobRecord;
  onSave: (payload: { applicationStatus?: string; notes?: string }) => void;
}) {
  const [applicationStatus, setApplicationStatus] = useState(job.applicationStatus);
  const [notes, setNotes] = useState(job.notes);

  useEffect(() => {
    setApplicationStatus(job.applicationStatus);
    setNotes(job.notes);
  }, [job.applicationStatus, job.notes, job.id]);

  return (
    <div className="status-editor">
      <div className="field-row">
        <label className="field">
          <span>Application status</span>
          <select value={applicationStatus} onChange={(event) => setApplicationStatus(event.target.value as ApplicationStatus)}>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="field">
        <span>Notes</span>
        <textarea rows={5} value={notes} onChange={(event) => setNotes(event.target.value)} />
      </label>

      <button onClick={() => onSave({ applicationStatus, notes })}>Save tracking</button>
    </div>
  );
}
