import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useAppData } from "../contexts/AppDataContext";
import type { ApplicationStatus, JobRecord } from "../types/app";
import { StatePanel } from "../components/StatePanel";

const statuses: ApplicationStatus[] = [
  "NEW",
  "SHORTLISTED",
  "APPLIED",
  "INTERVIEW",
  "OFFER",
  "REJECTED",
  "ARCHIVED"
];

const allowedCountryOnlyTokens = [
  "thailand",
  "thai",
  "france",
  "french",
  "europe",
  "european",
  "european union",
  "eu",
  "eea"
];

export function JobsPage() {
  const { jobs, cv, scoreJob, generateCoverLetter, updateJob, deleteJob, runRefresh, refreshAll, busyAction, loading, error } =
    useAppData();
  const [selectedJobId, setSelectedJobId] = useState<string | null>(() => getJobIdFromHash());
  const [selectedJobIds, setSelectedJobIds] = useState<string[]>([]);
  const [copiedJobId, setCopiedJobId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [decisionFilter, setDecisionFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("NEW");
  const deferredSearch = useDeferredValue(search);

  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      if (hasDisallowedCountryOnlyRestriction(job)) {
        return false;
      }

      const matchesSearch =
        !deferredSearch ||
        `${job.title} ${job.company} ${job.description}`.toLowerCase().includes(deferredSearch.toLowerCase());
      const matchesDecision = decisionFilter === "ALL" || (job.aiDecision ?? "UNSCORED") === decisionFilter;
      const matchesStatus = statusFilter === "ALL" || job.applicationStatus === statusFilter;
      return matchesSearch && matchesDecision && matchesStatus;
    });
  }, [decisionFilter, deferredSearch, jobs, statusFilter]);

  const setSelectedJob = (jobId: string | null) => {
    setSelectedJobId(jobId);
    syncJobHash(jobId);
  };

  useEffect(() => {
    const hashJobId = getJobIdFromHash();
    const hashMatch = hashJobId ? filteredJobs.find((job) => job.id === hashJobId)?.id ?? null : null;
    const currentStillVisible = selectedJobId ? filteredJobs.some((job) => job.id === selectedJobId) : false;

    if (hashMatch) {
      if (selectedJobId !== hashMatch) {
        setSelectedJobId(hashMatch);
      }
      return;
    }

    if (!currentStillVisible) {
      setSelectedJob(filteredJobs[0]?.id ?? null);
    }
  }, [filteredJobs, selectedJobId]);

  useEffect(() => {
    const syncFromHash = () => {
      const hashJobId = getJobIdFromHash();
      if (hashJobId) {
        setSelectedJobId(hashJobId);
      } else {
        setSelectedJobId((current) => current);
      }
    };

    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, []);

  useEffect(() => {
    setSelectedJobIds((current) => current.filter((jobId) => filteredJobs.some((job) => job.id === jobId)));
  }, [filteredJobs]);

  const selectedJob = filteredJobs.find((job) => job.id === selectedJobId) ?? null;
  const hasNoJobs = !loading && jobs.length === 0;
  const hasNoMatches = !loading && jobs.length > 0 && filteredJobs.length === 0;
  const allFilteredSelected = filteredJobs.length > 0 && filteredJobs.every((job) => selectedJobIds.includes(job.id));
  const hasBulkSelection = selectedJobIds.length > 0;

  const copyDescription = async (job: JobRecord) => {
    try {
      await navigator.clipboard.writeText(job.description);
      setCopiedJobId(job.id);
      window.setTimeout(() => {
        setCopiedJobId((current) => (current === job.id ? null : current));
      }, 1800);
    } catch {
      window.alert("Unable to copy the job description.");
    }
  };

  const toggleJobSelection = (jobId: string) => {
    setSelectedJobIds((current) =>
      current.includes(jobId) ? current.filter((id) => id !== jobId) : [...current, jobId]
    );
  };

  const toggleSelectAllFilteredJobs = () => {
    setSelectedJobIds((current) => {
      if (allFilteredSelected) {
        return current.filter((jobId) => !filteredJobs.some((job) => job.id === jobId));
      }

      const next = new Set(current);
      for (const job of filteredJobs) {
        next.add(job.id);
      }
      return Array.from(next);
    });
  };

  const deleteSelectedJobs = async () => {
    const selectedJobs = filteredJobs.filter((job) => selectedJobIds.includes(job.id));
    if (!selectedJobs.length) {
      return;
    }

    const label =
      selectedJobs.length === 1 ? `"${selectedJobs[0].title}"` : `${selectedJobs.length} selected jobs`;
    if (!window.confirm(`Delete ${label} from your local jobs list?`)) {
      return;
    }

    for (const job of selectedJobs) {
      await deleteJob(job.id);
    }

    setSelectedJobIds([]);
  };

  return (
    <div className="page jobs-page">
      <div className="page-header d-flex flex-wrap justify-content-between align-items-start">
        <div>
          <h2>Jobs</h2>
          <p>Filtre, qualifie, compare au CV et génère une cover letter à la demande.</p>
        </div>
      </div>

      <div className="toolbar d-flex flex-wrap">
        <input
          className="search-input"
          placeholder="Search jobs, companies, description..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <div className="select-shell">
          <select value={decisionFilter} onChange={(event) => setDecisionFilter(event.target.value)}>
            <option value="ALL">All decisions</option>
            <option value="APPLY">APPLY</option>
            <option value="REVIEW">REVIEW</option>
            <option value="REJECT">REJECT</option>
            <option value="UNSCORED">UNSCORED</option>
          </select>
        </div>
        <div className="select-shell">
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="ALL">All statuses</option>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>
      </div>

      <section className="jobs-layout">
        <div className="panel jobs-table card border-0">
          <div className="table-toolbar">
            <label className="jobs-checkbox select-all-checkbox">
              <input
                type="checkbox"
                checked={allFilteredSelected}
                onChange={toggleSelectAllFilteredJobs}
                disabled={Boolean(busyAction) || filteredJobs.length === 0}
              />
              <span>Select all</span>
            </label>
            <button
              type="button"
              className="secondary small-button btn btn-outline-danger"
              disabled={Boolean(busyAction) || !hasBulkSelection}
              onClick={() => void deleteSelectedJobs()}
            >
              Delete selected
            </button>
          </div>
          <div className="table-head">
            <span>Select</span>
            <span>Role</span>
            <span>Score</span>
            <span>Status</span>
          </div>
          <div className="jobs-table-body">
            {filteredJobs.map((job) => {
              const isChecked = selectedJobIds.includes(job.id);

              return (
                <div key={job.id} className={`job-row ${selectedJobId === job.id ? "active" : ""}`}>
                  <label
                    className="jobs-checkbox"
                    onClick={(event) => {
                      event.stopPropagation();
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleJobSelection(job.id)}
                      disabled={Boolean(busyAction)}
                    />
                  </label>
                  <button type="button" className="job-row-trigger" onClick={() => setSelectedJob(job.id)}>
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
                </div>
              );
            })}
            {hasNoJobs ? (
              <div className="list-empty">
                <StatePanel
                  title={error ? "Jobs unavailable" : "No jobs found yet"}
                  description={
                    error ??
                    "Your local database is empty. Run a refresh to fetch provider results and seed the jobs list."
                  }
                  actionLabel={error ? "Retry" : "Refresh jobs"}
                  onAction={() => void (error ? refreshAll() : runRefresh(false))}
                />
              </div>
            ) : null}
            {hasNoMatches ? (
              <div className="list-empty">
                <StatePanel
                  title="No match for these filters"
                  description="Try clearing the search box or broadening the status and decision filters."
                  actionLabel="Refresh jobs"
                  onAction={() => void runRefresh(false)}
                />
              </div>
            ) : null}
          </div>
        </div>

        <div className="panel job-detail card border-0">
          {selectedJob ? (
            <div className="detail-actions d-flex flex-wrap">
              <button
                className="btn btn-outline-primary"
                disabled={Boolean(busyAction)}
                onClick={() => {
                  window.open(selectedJob.url, "_blank", "noopener,noreferrer");
                }}
              >
                Open
              </button>
              <button
                className="btn btn-primary"
                disabled={Boolean(busyAction)}
                onClick={() => {
                  void updateJob(selectedJob.id, { applicationStatus: "APPLIED" });
                }}
              >
                Apply
              </button>
              <button className="btn btn-primary" disabled={Boolean(busyAction)} onClick={() => void scoreJob(selectedJob.id)}>
                Rescore
              </button>
              <button
                className="secondary btn btn-outline-info"
                disabled={Boolean(busyAction) || !cv}
                onClick={() => void generateCoverLetter(selectedJob.id)}
                title={cv ? "Generate a cover letter based on your uploaded CVs" : "Upload at least one CV first"}
              >
                Generate cover letter
              </button>
              <button
                className="secondary btn btn-outline-danger"
                disabled={Boolean(busyAction)}
                onClick={() => {
                  if (!window.confirm(`Delete "${selectedJob.title}" from your local jobs list?`)) {
                    return;
                  }

                  void deleteJob(selectedJob.id);
                }}
              >
                Delete job
              </button>
            </div>
          ) : null}
          {selectedJob ? (
            <JobDetail job={selectedJob} copied={copiedJobId === selectedJob.id} onCopyDescription={() => void copyDescription(selectedJob)} />
          ) : hasNoJobs ? (
            <div className="empty-state">Fetch jobs to start reviewing matches.</div>
          ) : (
            <div className="empty-state">No job selected.</div>
          )}
          {selectedJob ? (
            <JobStatusEditor job={selectedJob} onSave={(payload) => void updateJob(selectedJob.id, payload)} />
          ) : null}
        </div>
      </section>
    </div>
  );
}

function getJobIdFromHash(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const hash = window.location.hash.replace(/^#/, "").trim();
  return hash || null;
}

function normalizeCountryOnlyText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .toLowerCase()
    .trim();
}

function isAllowedCountryOnlyMatch(countryLabel: string): boolean {
  const normalized = normalizeCountryOnlyText(countryLabel);
  return allowedCountryOnlyTokens.some((token) => normalized.includes(token));
}

function hasDisallowedCountryOnlyRestriction(job: JobRecord): boolean {
  const haystack = normalizeCountryOnlyText(
    [job.title, job.company, job.location, job.remoteType, job.description]
      .filter(Boolean)
      .join(" ")
  );

  const explicitCountryOnlyLabels = ["brazil only", "brasil only"];
  if (explicitCountryOnlyLabels.some((label) => haystack.includes(label))) {
    return true;
  }

  const patterns = [
    /\bremote\s*(?:-|in|from|within|across)?\s*([a-z][a-z\s-]{1,40}?)\s+only\b/g,
    /\b([a-z][a-z\s-]{1,40}?)\s+residents\s+only\b/g,
    /\b(?:residents|citizens)\s+of\s+([a-z][a-z\s-]{1,40}?)\s+only\b/g,
    /\bmust\s+be\s+based\s+in\s+([a-z][a-z\s-]{1,40}?)(?:\b|$)/g,
    /\bonly\s+open\s+to\s+candidates\s+in\s+([a-z][a-z\s-]{1,40}?)(?:\b|$)/g,
    /\bonly\s+for\s+candidates\s+based\s+in\s+([a-z][a-z\s-]{1,40}?)(?:\b|$)/g,
    /\bonly\s+for\s+(?:applicants|candidates|people|residents)\s+in\s+([a-z][a-z\s-]{1,40}?)(?:\b|$)/g
  ];

  for (const pattern of patterns) {
    for (const match of haystack.matchAll(pattern)) {
      const countryLabel = match[1]?.trim();
      if (!countryLabel) {
        continue;
      }

      if (!isAllowedCountryOnlyMatch(countryLabel)) {
        return true;
      }
    }
  }

  return false;
}

function syncJobHash(jobId: string | null): void {
  if (typeof window === "undefined") {
    return;
  }

  const nextUrl = jobId
    ? `${window.location.pathname}${window.location.search}#${jobId}`
    : `${window.location.pathname}${window.location.search}`;

  if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== nextUrl) {
    window.history.replaceState(null, "", nextUrl);
  }
}

function JobDetail({ job, copied, onCopyDescription }: { job: JobRecord; copied: boolean; onCopyDescription: () => void }) {
  const formattedDescription = getFormattedDescription(job);

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
        <div className="description-heading">
          <h4>
            Description{" "}
            <button
              type="button"
              className={`icon-button inline-icon ${copied ? "copied" : ""}`}
              onClick={onCopyDescription}
              title={copied ? "Copied" : "Copy description"}
              aria-label={copied ? "Description copied" : "Copy description"}
            >
              {copied ? "✓" : "⧉"}
            </button>
          </h4>
        </div>
        {formattedDescription ? (
          <div className="job-description-rich" dangerouslySetInnerHTML={{ __html: formattedDescription }} />
        ) : (
          <p>{job.description}</p>
        )}
      </div>

      <div className="description-block">
        <h4>Cover letter</h4>
        <pre>{job.coverLetter ?? "No cover letter generated yet. Upload one or more CVs, then generate it here."}</pre>
      </div>
    </div>
  );
}

function getFormattedDescription(job: JobRecord): string | null {
  const htmlCandidates = getHtmlCandidates(job);
  for (const candidate of htmlCandidates) {
    const sanitized = sanitizeHtml(candidate);
    if (sanitized) {
      return sanitized;
    }
  }

  return formatPlainDescription(job.description);
}

function getHtmlCandidates(job: JobRecord): string[] {
  const candidates = new Set<string>();

  if (looksLikeHtmlContent(job.description)) {
    candidates.add(job.description);
  }

  try {
    const raw = JSON.parse(job.rawJson) as Record<string, unknown>;
    for (const candidate of extractHtmlCandidates(raw)) {
      candidates.add(candidate);
    }
  } catch {
    return Array.from(candidates);
  }

  return Array.from(candidates);
}

function extractHtmlCandidates(raw: Record<string, unknown>): string[] {
  const directCandidates = [
    raw.description,
    raw["content:encoded"],
    raw.content,
    raw.html
  ];

  const htmlCandidates: string[] = [];
  for (const candidate of directCandidates) {
    if (typeof candidate === "string" && looksLikeHtmlContent(candidate)) {
      htmlCandidates.push(candidate);
    }
  }

  return htmlCandidates;
}

function looksLikeHtmlContent(value: string): boolean {
  return /<\/?(p|ul|ol|li|br|h\d|strong|b|em|i|div|span|a|blockquote|hr)\b/i.test(value) ||
    /&(?:amp;)*(?:lt|#60);\/?(p|ul|ol|li|br|h\d|strong|b|em|i|div|span|a|blockquote|hr)\b/i.test(value);
}

function hasEncodedHtmlTags(value: string): boolean {
  return /&(?:amp;)*(?:lt|#60);\/?(p|ul|ol|li|br|h\d|strong|b|em|i|div|span|a|blockquote|hr)\b/i.test(value);
}

function sanitizeHtml(html: string): string | null {
  if (typeof window === "undefined") {
    return html;
  }

  const htmlInput = hasEncodedHtmlTags(html) ? decodeHtmlEntitiesDeep(html) : html;
  const normalizedHtml = repairMojibake(htmlInput)
    .replace(/\u3002/g, "• ")
    .replace(/•\s+/g, "• ");
  const parser = new DOMParser();
  const document = parser.parseFromString(normalizedHtml, "text/html");
  const body = document.body;
  if (!body) {
    return formatPlainDescription(html);
  }
  const allowedTags = new Set([
    "P",
    "BR",
    "UL",
    "OL",
    "LI",
    "BLOCKQUOTE",
    "DIV",
    "SPAN",
    "STRONG",
    "B",
    "EM",
    "I",
    "H1",
    "H2",
    "H3",
    "H4",
    "H5",
    "H6",
    "A",
    "HR"
  ]);

  const cleanNode = (node: Node): void => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as HTMLElement;
      if (!allowedTags.has(element.tagName)) {
        const parent = element.parentNode;
        if (!parent) {
          return;
        }

        while (element.firstChild) {
          parent.insertBefore(element.firstChild, element);
        }
        parent.removeChild(element);
        return;
      }

      for (const attribute of Array.from(element.attributes)) {
        if (element.tagName === "A" && attribute.name === "href") {
          continue;
        }
        element.removeAttribute(attribute.name);
      }

      if (element.tagName === "A") {
        element.setAttribute("target", "_blank");
        element.setAttribute("rel", "noreferrer");
      }
    }

    for (const child of Array.from(node.childNodes)) {
      cleanNode(child);
    }
  };

  for (const child of Array.from(body.childNodes)) {
    cleanNode(child);
  }
  return body.innerHTML.trim() || null;
}

function decodeHtmlEntitiesDeep(value: string): string {
  let current = value;

  for (let i = 0; i < 3; i += 1) {
    const decoded = decodeHtmlEntitiesOnce(current);
    if (decoded === current) {
      break;
    }
    current = decoded;
  }

  return current;
}

function decodeHtmlEntitiesOnce(value: string): string {
  if (typeof window === "undefined") {
    return value;
  }

  if (!hasEncodedHtmlTags(value)) {
    return value;
  }

  const textarea = document.createElement("textarea");
  textarea.innerHTML = value;
  const decoded = textarea.value;

  if (decoded !== value && looksLikeHtmlContent(decoded)) {
    return decoded;
  }

  return value;
}

function formatPlainDescription(value: string): string | null {
  const trimmed = repairMojibake(value).trim();
  if (!trimmed) {
    return null;
  }

  const escaped = escapeHtml(trimmed);
  const sectioned = escaped
    .replace(
      /\b(Headquarters|Benefits|Role|Location|Travel|Employment Type|Clearance Requirement|About|Overview|Responsibilities|Requirements|Required Qualifications|Preferred Qualifications|How this works|Heads up)\b:?/g,
      "<br><br><strong>$1:</strong>"
    )
    .replace(/(?<!<br>)(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noreferrer">$1</a>')
    .replace(/\s{2,}/g, " ")
    .trim();

  return `<p>${sectioned.replace(/<br><br>/g, "</p><p>").replace(/<br>/g, "<br>")}</p>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function repairMojibake(value: string): string {
  const suspectPattern = /(?:Ã.|Â|â.|ã|â|ðŸ|�)/;
  if (!suspectPattern.test(value)) {
    return value;
  }

  try {
    const bytes = Uint8Array.from(Array.from(value, (char) => char.charCodeAt(0) & 0xff));
    const decoded = new TextDecoder("utf-8", { fatal: false }).decode(bytes);

    if (decoded && decoded !== value) {
      return decoded
        .replace(/\u00a0/g, " ")
        .replace(/\u3002/g, "• ")
        .replace(/•\s+/g, "• ");
    }
  } catch {
    return value;
  }

  return value;
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

      <button className="btn btn-primary" onClick={() => onSave({ applicationStatus, notes })}>Save tracking</button>
    </div>
  );
}
