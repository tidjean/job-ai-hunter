import { useEffect, useState } from "react";
import { PdfViewer } from "../components/PdfViewer";
import { TagEditor } from "../components/TagEditor";
import { StatePanel } from "../components/StatePanel";
import { useAppData } from "../contexts/AppDataContext";
import type { AppConfig, CandidateProfile } from "../types/app";

export function AdminPage() {
  const {
    profile,
    config,
    cv,
    aiCredentials,
    saveProfile,
    saveConfig,
    saveOpenAiApiKey,
    clearOpenAiApiKey,
    testOpenAiConnection,
    uploadCv,
    busyAction,
    loading,
    error,
    refreshAll
  } = useAppData();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [localProfile, setLocalProfile] = useState<CandidateProfile | null>(null);
  const [localConfig, setLocalConfig] = useState<AppConfig | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState("");

  useEffect(() => {
    if (profile) {
      setLocalProfile(structuredClone(profile));
    }
  }, [profile]);

  useEffect(() => {
    if (config) {
      setLocalConfig(structuredClone(config));
    }
  }, [config]);

  if (loading && (!localProfile || !localConfig)) {
    return <div className="empty-state">Loading admin configuration...</div>;
  }

  if (!localProfile || !localConfig) {
    return (
      <StatePanel
        title="Settings unavailable"
        description={error ?? "The candidate profile and AI configuration could not be loaded."}
        actionLabel="Retry"
        onAction={() => void refreshAll()}
      />
    );
  }

  return (
    <div className="page">
      <div className="page-header d-flex flex-wrap justify-content-between align-items-start">
        <div>
          <h2>Admin</h2>
          <p>CV, profil candidat, budget IA, scoring thresholds et providers.</p>
        </div>
      </div>

      <section className="grid-two">
        <div className="panel form-panel card border-0">
          <div className="panel-header d-flex justify-content-between">
            <h3>Candidate profile</h3>
            <span>Used by search planning, scoring and cover letters</span>
          </div>

          <div className="field-row row g-3">
            <label className="field col">
              <span>Full name</span>
              <input
                value={localProfile.fullName}
                onChange={(event) => setLocalProfile({ ...localProfile, fullName: event.target.value })}
              />
            </label>
            <label className="field col">
              <span>Headline</span>
              <input
                value={localProfile.headline}
                onChange={(event) => setLocalProfile({ ...localProfile, headline: event.target.value })}
              />
            </label>
          </div>

          <div className="field-row row g-3">
            <label className="field col">
              <span>Email</span>
              <input
                value={localProfile.email}
                onChange={(event) => setLocalProfile({ ...localProfile, email: event.target.value })}
              />
            </label>
            <label className="field col">
              <span>Location</span>
              <input
                value={localProfile.location}
                onChange={(event) => setLocalProfile({ ...localProfile, location: event.target.value })}
              />
            </label>
          </div>

          <div className="field-row row g-3">
            <label className="field col">
              <span>Timezone</span>
              <input
                value={localProfile.timezone}
                onChange={(event) => setLocalProfile({ ...localProfile, timezone: event.target.value })}
              />
            </label>
            <label className="field col">
              <span>Years of experience</span>
              <input
                type="number"
                value={localProfile.yearsExperience}
                onChange={(event) =>
                  setLocalProfile({ ...localProfile, yearsExperience: Number(event.target.value) })
                }
              />
            </label>
          </div>

          <div className="field-row row g-3">
            <label className="field col">
              <span>Minimum monthly salary (USD)</span>
              <input
                type="number"
                value={localProfile.minMonthlySalaryUsd}
                onChange={(event) =>
                  setLocalProfile({
                    ...localProfile,
                    minMonthlySalaryUsd: Number(event.target.value)
                  })
                }
              />
            </label>
            <label className="field checkbox-field col">
              <input
                type="checkbox"
                checked={localProfile.remoteOnly}
                onChange={(event) => setLocalProfile({ ...localProfile, remoteOnly: event.target.checked })}
              />
              <span>Remote only</span>
            </label>
          </div>

          <label className="field">
            <span>Summary</span>
            <textarea
              rows={6}
              value={localProfile.summary}
              onChange={(event) => setLocalProfile({ ...localProfile, summary: event.target.value })}
            />
          </label>

          <TagEditor label="Skills" value={localProfile.skills} onChange={(skills) => setLocalProfile({ ...localProfile, skills })} />
          <TagEditor
            label="Desired keywords"
            value={localProfile.desiredKeywords}
            onChange={(desiredKeywords) => setLocalProfile({ ...localProfile, desiredKeywords })}
          />
          <TagEditor
            label="Excluded keywords"
            value={localProfile.excludedKeywords}
            onChange={(excludedKeywords) => setLocalProfile({ ...localProfile, excludedKeywords })}
          />
          <TagEditor
            label="Preferred industries"
            value={localProfile.preferredIndustries}
            onChange={(preferredIndustries) => setLocalProfile({ ...localProfile, preferredIndustries })}
          />
          <TagEditor
            label="Languages"
            value={localProfile.languages}
            onChange={(languages) => setLocalProfile({ ...localProfile, languages })}
          />

          <button
            className="btn btn-primary form-submit-button"
            disabled={Boolean(busyAction)}
            onClick={() => void saveProfile(localProfile)}
          >
            Save profile
          </button>
        </div>

        <div className="panel form-panel card border-0">
          <div className="panel-header d-flex justify-content-between">
            <h3>AI and providers</h3>
            <span>Daily budget, automation levels and job sources</span>
          </div>

          <div className="field credential-panel">
            <span>OpenAI API key</span>
            <p className="field-help">
              Stored server-side only. The browser never receives the full key back after save.
            </p>
            <input
              type="password"
              autoComplete="off"
              placeholder={aiCredentials?.hasStoredKey ? "Enter a new key to replace the current one" : "sk-..."}
              value={apiKeyInput}
              onChange={(event) => setApiKeyInput(event.target.value)}
            />
            <div className="credential-meta">
              <span>
                Status:{" "}
                {aiCredentials?.hasStoredKey
                  ? `${aiCredentials.maskedKey} via ${aiCredentials.source}`
                  : "No OpenAI API key configured"}
              </span>
              {aiCredentials?.updatedAt ? <span>Updated: {new Date(aiCredentials.updatedAt).toLocaleString()}</span> : null}
            </div>
            <div className="credential-actions">
              <button
                className="btn btn-primary"
                disabled={Boolean(busyAction) || !apiKeyInput.trim()}
                onClick={async () => {
                  await saveOpenAiApiKey(apiKeyInput);
                  setApiKeyInput("");
                }}
              >
                Save API key
              </button>
              <button
                className="secondary btn btn-outline-info"
                disabled={Boolean(busyAction) || !aiCredentials?.hasStoredKey}
                onClick={() => void testOpenAiConnection()}
              >
                Test connection
              </button>
              <button
                className="secondary btn btn-outline-danger"
                disabled={Boolean(busyAction) || !aiCredentials?.hasStoredKey || aiCredentials.source !== "database"}
                onClick={() => void clearOpenAiApiKey()}
                title={
                  aiCredentials?.source === "environment"
                    ? "This key comes from the server environment and cannot be removed from the UI"
                    : "Remove the stored API key"
                }
              >
                Remove stored key
              </button>
            </div>
          </div>

          <div className="field-row row g-3">
            <label className="field col">
              <span>AI model</span>
              <input
                value={localConfig.aiModel}
                onChange={(event) => setLocalConfig({ ...localConfig, aiModel: event.target.value })}
              />
            </label>
            <label className="field col">
              <span>Max daily AI budget (USD)</span>
              <input
                type="number"
                step="0.1"
                value={localConfig.maxDailyAiBudgetUsd}
                onChange={(event) =>
                  setLocalConfig({
                    ...localConfig,
                    maxDailyAiBudgetUsd: Number(event.target.value)
                  })
                }
              />
            </label>
          </div>

          <div className="field-row triple row g-3">
            <label className="field col">
              <span>Apply threshold</span>
              <input
                type="number"
                value={localConfig.applyThreshold}
                onChange={(event) =>
                  setLocalConfig({ ...localConfig, applyThreshold: Number(event.target.value) })
                }
              />
            </label>
            <label className="field col">
              <span>Review threshold</span>
              <input
                type="number"
                value={localConfig.reviewThreshold}
                onChange={(event) =>
                  setLocalConfig({ ...localConfig, reviewThreshold: Number(event.target.value) })
                }
              />
            </label>
            <label className="field col">
              <span>Cover letter threshold</span>
              <input
                type="number"
                value={localConfig.coverLetterThreshold}
                onChange={(event) =>
                  setLocalConfig({
                    ...localConfig,
                    coverLetterThreshold: Number(event.target.value)
                  })
                }
              />
            </label>
          </div>

          <div className="field-row triple row g-3">
            <label className="field checkbox-field col">
              <input
                type="checkbox"
                checked={localConfig.autoScore}
                onChange={(event) => setLocalConfig({ ...localConfig, autoScore: event.target.checked })}
              />
              <span>Auto score jobs</span>
            </label>
            <label className="field checkbox-field col">
              <input
                type="checkbox"
                checked={localConfig.autoCompareCv}
                onChange={(event) =>
                  setLocalConfig({ ...localConfig, autoCompareCv: event.target.checked })
                }
              />
              <span>Auto compare CV</span>
            </label>
            <label className="field checkbox-field col">
              <input
                type="checkbox"
                checked={localConfig.autoGenerateCoverLetters}
                onChange={(event) =>
                  setLocalConfig({
                    ...localConfig,
                    autoGenerateCoverLetters: event.target.checked
                  })
                }
              />
              <span>Auto generate letters</span>
            </label>
          </div>

          <label className="field">
            <span>AI search queries per refresh</span>
            <input
              type="number"
              value={localConfig.searchPlanQueriesPerRefresh}
              onChange={(event) =>
                setLocalConfig({
                  ...localConfig,
                  searchPlanQueriesPerRefresh: Number(event.target.value)
                })
              }
            />
          </label>

          <div className="provider-config-list">
            {Object.entries(localConfig.sources).map(([providerId, source]) => (
              <div className="provider-config-card" key={providerId}>
                <div className="provider-card-header">
                  <div className="provider-card-title">
                    <strong>{source.label}</strong>
                    {source.autoDisabled ? <span className="provider-status-badge">Auto-disabled</span> : null}
                  </div>
                  <div className="provider-card-actions">
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={source.enabled}
                        onChange={(event) =>
                          setLocalConfig({
                            ...localConfig,
                            sources: {
                              ...localConfig.sources,
                              [providerId]: {
                                ...source,
                                enabled: event.target.checked,
                                autoDisabled: false,
                                autoDisabledReason: null
                              }
                            }
                          })
                        }
                      />
                      <span>{source.enabled ? "On" : "Off"}</span>
                    </label>
                    {source.autoDisabled ? (
                      <button
                        type="button"
                        className="secondary small-button btn btn-outline-info"
                        onClick={() =>
                          setLocalConfig({
                            ...localConfig,
                            sources: {
                              ...localConfig.sources,
                              [providerId]: {
                                ...source,
                                enabled: true,
                                autoDisabled: false,
                                autoDisabledReason: null
                              }
                            }
                          })
                        }
                      >
                        Re-enable
                      </button>
                    ) : null}
                  </div>
                </div>
                {source.autoDisabledReason ? (
                  <div className="provider-warning">
                    <strong>Disabled automatically.</strong> {source.autoDisabledReason}
                    {source.lastFailureAt ? ` Last failure: ${new Date(source.lastFailureAt).toLocaleString()}` : ""}
                  </div>
                ) : null}
                <label className="field">
                  <span>Query</span>
                  <input
                    value={source.query}
                    onChange={(event) =>
                      setLocalConfig({
                        ...localConfig,
                        sources: {
                          ...localConfig.sources,
                          [providerId]: { ...source, query: event.target.value }
                        }
                      })
                    }
                  />
                </label>
                <label className="field">
                  <span>Limit</span>
                  <input
                    type="number"
                    value={source.limit}
                    onChange={(event) =>
                      setLocalConfig({
                        ...localConfig,
                        sources: {
                          ...localConfig.sources,
                          [providerId]: { ...source, limit: Number(event.target.value) }
                        }
                      })
                    }
                  />
                </label>
              </div>
            ))}
          </div>

          <button className="btn btn-primary form-submit-button" disabled={Boolean(busyAction)} onClick={() => void saveConfig(localConfig)}>
            Save configuration
          </button>
        </div>
      </section>

      <section className="panel form-panel card border-0">
        <div className="panel-header d-flex justify-content-between">
          <h3>CV upload</h3>
          <span>PDF, DOCX or TXT. The extracted text feeds scoring and comparison.</span>
        </div>

        <div className="field-row row g-3 align-items-center">
          <input type="file" accept=".pdf,.docx,.txt" onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)} />
          <button className="btn btn-primary" disabled={!selectedFile || Boolean(busyAction)} onClick={() => selectedFile && void uploadCv(selectedFile)}>
            Upload CV
          </button>
        </div>

        {cv ? (
          cv.mimeType === "application/pdf" ? (
            <PdfViewer cv={cv} />
          ) : (
            <div className="cv-preview">
              <strong>{cv.filename}</strong>
              <span>Uploaded {new Date(cv.uploadedAt).toLocaleString()}</span>
              <a href={`/api/admin/cv/${cv.id}/file`} target="_blank" rel="noreferrer">
                Open file
              </a>
              <p>{cv.extractedText.slice(0, 1200)}...</p>
            </div>
          )
        ) : (
          <div className="empty-state">No CV uploaded yet.</div>
        )}
      </section>
    </div>
  );
}
