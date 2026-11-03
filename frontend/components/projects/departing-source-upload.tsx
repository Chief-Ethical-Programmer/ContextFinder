"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, LockKeyhole, Sparkles, UploadCloud } from "lucide-react";
import { configureSource, retryApprovedAnalysis, uploadSource } from "@/lib/api/browser";

type IntakeItem = { kind: string; recordCount: number; config: Record<string, unknown> };
type Intake = { status: string; items: IntakeItem[] };
type PipelineStage = { stage: string; status: string };

export function DepartingSourceUpload({ transitionId, embedded = false, analysisEnabled = false, submitAfterSave, onSourcesChanged }: { transitionId: string; embedded?: boolean; analysisEnabled?: boolean; submitAfterSave?: () => Promise<void>; onSourcesChanged?: () => void }) {
  const router = useRouter();
  const [repository, setRepository] = useState("");
  const [documents, setDocuments] = useState<File[]>([]);
  const [documentFolderFiles, setDocumentFolderFiles] = useState<File[]>([]);
  const [attested, setAttested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [intake, setIntake] = useState<Intake>({ status: "awaiting_project_approval", items: [] });
  const [pipelineStages, setPipelineStages] = useState<PipelineStage[]>([]);
  const repositorySeeded = useRef(false);
  const redirectedToExit = useRef(false);

  const refreshIntake = useCallback(async () => {
    const response = await fetch(`/api/backend/transitions/${encodeURIComponent(transitionId)}/source-intake`, { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.detail ?? "Could not check saved project sources.");
    const intakeBody = body as Intake;
    setIntake(intakeBody);
    const pipelineResponse = await fetch(`/api/backend/transitions/${encodeURIComponent(transitionId)}/pipeline`, { cache: "no-store" });
    if (pipelineResponse.ok) {
      const pipelineBody = await pipelineResponse.json();
      setPipelineStages(Array.isArray(pipelineBody.stages) ? pipelineBody.stages : []);
    }
    if (!repositorySeeded.current) {
      const savedRepository = intakeBody.items.find((item) => item.kind === "github")?.config.repository;
      if (typeof savedRepository === "string") setRepository(savedRepository.replace(/\.git$/i, ""));
      repositorySeeded.current = true;
    }
  }, [transitionId]);

  useEffect(() => {
    void refreshIntake().catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load source status."));
    const timer = window.setInterval(() => { void refreshIntake().catch(() => undefined); }, 3000);
    return () => window.clearInterval(timer);
  }, [refreshIntake]);

  useEffect(() => {
    if (analysisEnabled && ["awaiting_leaver_answers", "review"].includes(intake.status) && !redirectedToExit.current) {
      redirectedToExit.current = true;
      router.push(`/exit/${encodeURIComponent(transitionId)}`);
    }
  }, [intake.status, analysisEnabled, router, transitionId]);

  async function saveSelectedSources() {
    const allDocuments = [...documents, ...documentFolderFiles];
    if (repository.trim()) await configureSource(transitionId, "github", "technical_only", { repository: repository.trim() });
    if (allDocuments.length) await configureSource(transitionId, "drive_export", "technical_only");
    for (const file of allDocuments) await uploadSource(transitionId, file, "drive_export", "technical_only");
  }

  async function saveGeminiAttestation() {
    const response = await fetch(`/api/backend/transitions/${encodeURIComponent(transitionId)}/free-tier-attestation`, { method: "POST" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.detail ?? body.error ?? body.message ?? `Could not save your Gemini processing confirmation (HTTP ${response.status}).`);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setMessage("");
    const addingSources = Boolean(repository.trim() || documents.length || documentFolderFiles.length);
    const hasSavedSource = intake.items.some((item) => item.recordCount > 0 || (item.kind === "github" && Boolean(item.config.repository)));
    if (!addingSources && !hasSavedSource) { setError("Add a public GitHub repository or upload at least one source file first."); return; }
    if (!analysisEnabled && !attested) { setError("Confirm that these sources may be sent for analysis before submitting."); return; }
    setBusy(true);
    try {
      if (addingSources) await saveSelectedSources();
      if (analysisEnabled) {
        await saveGeminiAttestation();
        await retryApprovedAnalysis(transitionId);
        setMessage("Analysis started. You can follow its progress below.");
      } else {
        await saveGeminiAttestation();
        if (submitAfterSave) await submitAfterSave();
        setMessage(submitAfterSave ? "Sources submitted. Analysis and question generation have started." : "Sources and analysis confirmation saved with your request.");
      }
      setRepository(""); setDocuments([]); setDocumentFolderFiles([]);
      await refreshIntake(); onSourcesChanged?.();
    } catch (cause) { setError(cause instanceof TypeError ? "Could not reach the app server. Refresh the page and try again; any sources already saved will remain available." : cause instanceof Error ? cause.message : "Source processing failed. Saved records are kept so you can retry."); }
    finally { setBusy(false); }
  }

  async function retryParsing() {
    if (!attested) { setError("Confirm that the saved sources may be sent to Gemini free tier."); return; }
    setBusy(true); setError(""); setMessage("");
    try {
      await saveGeminiAttestation();
      await retryApprovedAnalysis(transitionId);
      setMessage("Analysis started. You can follow its progress below.");
      await refreshIntake();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not restart Gemini processing."); }
    finally { setBusy(false); }
  }

  const processingDone = ["sources_ready", "ingesting", "awaiting_leaver_answers", "awaiting_reviewer_assignment", "review", "awaiting_admin_approval", "published", "acknowledged"].includes(intake.status);
  const statusText = intake.status === "awaiting_leaver_answers" ? "Analysis is complete. Your generated questions are ready." : intake.status === "awaiting_reviewer_assignment" ? "Your responses are submitted. The admin will assign a reviewer." : intake.status === "review" ? "The assigned reviewer is checking claims and evidence." : intake.status === "sources_ready" && analysisEnabled ? "Automatic analysis did not finish. Confirm the sources and try again." : intake.status === "sources_ready" ? "Sources are saved and ready to submit for analysis." : intake.status === "awaiting_admin_approval" ? "The reviewer is completing the final handover decision." : ["published", "acknowledged"].includes(intake.status) ? "The reviewer approved the handover. The admin can now assign an incoming teammate." : analysisEnabled ? "Analysis is starting." : intake.items.length ? "Sources are saved. Submit them to start analysis." : "Add the sources for this project before submitting for analysis.";
  const latestStage = (name: string) => [...pipelineStages].reverse().find((stage) => stage.stage === name)?.status;
  const progressSteps = [
    { key: "ingest", label: "Import sources" },
    { key: "extract", label: "Extract and verify claims" },
    { key: "exit_questions", label: "Prepare questions" },
  ];
  const activeProgressIndex = progressSteps.findIndex(({ key }) => latestStage(key) === "running");
  const completedProgress = progressSteps.filter(({ key }) => latestStage(key) === "completed").length;
  const progressPercent = intake.status === "review" ? 100 : activeProgressIndex >= 0 ? [12, 48, 83][activeProgressIndex] : Math.min(90, completedProgress * 34);
  const sourceName: Record<string, string> = { github: "GitHub", slack_export: "Slack", slack_leads_export: "Slack", drive_export: "Documents", meeting_notes: "Meeting notes" };

  return <section className={`setup-card ${embedded ? "departing-source-upload-inline" : ""}`} style={{ maxWidth: embedded ? "none" : 760, margin: embedded ? "1rem 0" : "2rem auto", padding: embedded ? "1.25rem" : "2rem" }}>
    <div className="setup-form-title"><span className="form-step-icon"><UploadCloud size={18} /></span><div><h2>Project sources</h2></div></div>
    {intake.items.filter((item) => !( ["slack_export", "slack_leads_export"].includes(item.kind) && item.recordCount === 0)).length > 0 && <div className="project-source-intake-list"><strong>Sources for this request</strong>{intake.items.filter((item) => !(["slack_export", "slack_leads_export"].includes(item.kind) && item.recordCount === 0)).map((item, index) => <span key={`${item.kind}-${index}`}>{sourceName[item.kind] ?? item.kind}{item.config.repository ? <> | <a href={String(item.config.repository).startsWith("http") ? String(item.config.repository) : `https://github.com/${String(item.config.repository).replace(/\.git$/i, "")}`} target="_blank" rel="noreferrer">{String(item.config.repository).replace(/\.git$/i, "")}</a></> : ""}{item.recordCount ? ` | ${item.recordCount} records uploaded` : item.kind === "github" ? " | link saved; files are fetched when analysis starts" : " | no files uploaded yet"}</span>)}</div>}
    {!processingDone && <form onSubmit={(event) => void submit(event)}><div className="setup-upload-control"><label htmlFor={`departing-github-${transitionId}`}>Public GitHub repository</label><input id={`departing-github-${transitionId}`} className="setup-input" value={repository} onChange={(event) => setRepository(event.target.value)} placeholder="owner/repository" /><small>Paste owner/repository or a GitHub repository, branch, or clone URL.</small></div><div className="setup-upload-control"><label htmlFor={`departing-documents-${transitionId}`}>Project documents and notes</label><input id={`departing-documents-${transitionId}`} type="file" accept=".pdf,.docx,.md,.txt,application/pdf" multiple onChange={(event) => setDocuments(Array.from(event.target.files ?? []))} /><label className="source-folder-picker" htmlFor={`departing-documents-folder-${transitionId}`}>Choose a documents folder</label><input id={`departing-documents-folder-${transitionId}`} className="source-folder-input" type="file" accept=".pdf,.docx,.md,.txt,application/pdf" multiple {...({ webkitdirectory: "" } as Record<string, string>)} onChange={(event) => setDocumentFolderFiles(Array.from(event.target.files ?? []))} /><div className="source-selected-files">{[...documents, ...documentFolderFiles].length ? [...documents, ...documentFolderFiles].map((file) => <span key={`${file.name}-${file.lastModified}`}>{file.webkitRelativePath || file.name}</span>) : <small>No documents selected. Choose PDF, DOCX, Markdown, or text files, or a folder.</small>}</div><small>10 MB per file.</small></div>
      {!analysisEnabled && <><div className="setup-info-box"><Sparkles size={15} /><span>Once you confirm and submit the sources, analysis and departing-member questions start automatically.</span></div><label className="source-permission-note"><input type="checkbox" checked={attested} onChange={(event) => setAttested(event.target.checked)} /><span>I confirm the sources are public or synthetic, contain no sensitive, confidential, or personal information, and may be processed by the configured AI model.</span></label></>}
      <button className="button button-primary" type="submit" disabled={busy || !attested}>{busy ? "Saving sources…" : submitAfterSave ? "Save sources & start analysis" : "Save sources"}<LockKeyhole size={14} /></button>
      {error && <p className="setup-error" role="alert">{error}</p>}{message && <p className="project-request-success" role="status"><CheckCircle2 size={15} />{message}</p>}
    </form>}
    {processingDone && <div className="setup-info-box"><CheckCircle2 size={15} /><span>{statusText}</span></div>}{!processingDone && <p className="source-status-notice" role="status">{statusText}</p>}
    {intake.status === "ingesting" && <div className="analysis-progress-panel" role="status" aria-live="polite"><div className="analysis-progress-heading"><strong>Analyzing project sources</strong><span>{progressPercent}%</span></div><div className="analysis-progress-track" role="progressbar" aria-label="Project analysis progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPercent}><span style={{ width: `${progressPercent}%` }} /></div><ol className="analysis-progress-steps">{progressSteps.map(({ key, label }, index) => { const stageStatus = latestStage(key); const done = stageStatus === "completed"; const active = stageStatus === "running" || (activeProgressIndex < 0 && index === completedProgress); return <li className={done ? "is-done" : active ? "is-active" : ""} key={key}><span>{done ? "✓" : index + 1}</span><strong>{label}</strong><small>{done ? "Complete" : active ? "In progress" : "Waiting"}</small></li>; })}</ol><p>Sources stay saved while claims are extracted, evidence is checked, and follow-up questions are prepared.</p></div>}
    {analysisEnabled && intake.status === "sources_ready" && <div className="project-retry-panel"><label className="source-permission-note"><input type="checkbox" checked={attested} onChange={(event) => setAttested(event.target.checked)} /><span>I confirm the saved sources may be processed by the configured AI model.</span></label><button className="button button-primary" type="button" disabled={busy || !attested} onClick={() => void retryParsing()}>{busy ? "Starting analysis…" : "Analyze sources"}<Sparkles size={14} /></button>{error && <p className="setup-error" role="alert">{error}</p>}</div>}
  </section>;
}
