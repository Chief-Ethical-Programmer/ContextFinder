"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Circle, Cloud, FileText, GitBranch, LockKeyhole, ShieldCheck, Sparkles, UserRoundCheck } from "lucide-react";
import { completeIngestion, createTransition, uploadSource } from "@/lib/api/browser";
import type { AccessLevel, SourceKind } from "@/lib/types";

type ProjectMemberOption = { id: string; name: string; email: string; role: string };
type ProjectOption = { id: string; name: string; members: ProjectMemberOption[] };
type SetupSourceKind = Exclude<SourceKind, "Slack">;
type SourceOption = { kind: SetupSourceKind; detail: string; Icon: typeof GitBranch; initialAccess: AccessLevel };

const sourceOptions: SourceOption[] = [
  { kind: "GitHub", detail: "Selected documentation, configuration and source files from a public repository", Icon: GitBranch, initialAccess: "Technical only" },
  { kind: "Drive", detail: "Local PDF, DOCX, Markdown or text documents", Icon: Cloud, initialAccess: "Technical only" },
  { kind: "Meeting notes", detail: "Local meeting notes in supported document formats", Icon: FileText, initialAccess: "Leads only" },
];
const accessLevels: AccessLevel[] = ["Public to team", "Technical only", "Leads only"];

function apiAccess(level: AccessLevel) {
  return level === "Public to team" ? "public_team" : level === "Technical only" ? "technical_only" : "leads_only";
}

function backendKind(kind: SetupSourceKind) {
  return kind === "GitHub" ? "github" : kind === "Drive" ? "drive_export" : "meeting_notes";
}

export function TransitionSetup() {
  const router = useRouter();
  const params = useSearchParams();
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [projectId, setProjectId] = useState("");
  const [departingUserId, setDepartingUserId] = useState("");
  const [incomingUserId, setIncomingUserId] = useState("");
  const [incomingRole, setIncomingRole] = useState("Technical successor");
  const [step, setStep] = useState(0);
  const [selectedSources, setSelectedSources] = useState<SetupSourceKind[]>(["GitHub", "Drive"]);
  const [sourceAccess, setSourceAccess] = useState<Record<SetupSourceKind, AccessLevel>>({ GitHub: "Technical only", Drive: "Technical only", "Meeting notes": "Leads only" });
  const [repository, setRepository] = useState("");
  const [driveFiles, setDriveFiles] = useState<File[]>([]);
  const [meetingFiles, setMeetingFiles] = useState<File[]>([]);
  const [freeTierAttested, setFreeTierAttested] = useState(false);
  const [createdTransitionId, setCreatedTransitionId] = useState(params.get("existing") ?? "");
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [running, setRunning] = useState(false);
  const [pipelineStep, setPipelineStep] = useState(-1);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/backend/projects", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.message ?? body.detail ?? "Could not load your supervised projects.");
        return body as ProjectOption[];
      })
      .then((items) => {
        if (!active) return;
        setProjects(items);
        const requested = params.get("projectId");
        const nextProject = items.find((item) => item.id === requested) ?? items[0];
        if (nextProject) {
          setProjectId(nextProject.id);
          setDepartingUserId(nextProject.members.find((member) => member.role === "departing")?.id ?? "");
          setIncomingUserId(nextProject.members.find((member) => member.role === "incoming")?.id ?? "");
        }
      })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Could not load projects."); })
      .finally(() => { if (active) setLoadingProjects(false); });
    return () => { active = false; };
  }, [params]);

  const selectedProject = projects.find((project) => project.id === projectId);
  const departingMembers = useMemo(() => selectedProject?.members.filter((member) => member.role === "departing") ?? [], [selectedProject]);
  const incomingMembers = useMemo(() => selectedProject?.members.filter((member) => member.role === "incoming") ?? [], [selectedProject]);
  const departing = departingMembers.find((member) => member.id === departingUserId);
  const incoming = incomingMembers.find((member) => member.id === incomingUserId);

  function changeProject(id: string) {
    const project = projects.find((item) => item.id === id);
    setProjectId(id);
    setDepartingUserId(project?.members.find((member) => member.role === "departing")?.id ?? "");
    setIncomingUserId(project?.members.find((member) => member.role === "incoming")?.id ?? "");
  }

  function validateAndAdvance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (step === 0 && !selectedProject) { setError("Choose a supervised project."); return; }
    if (step === 1 && (!departing || !incoming || departing.id === incoming.id)) { setError("Choose different departing and incoming members assigned to this project."); return; }
    if (step === 2) {
      if (!selectedSources.length) { setError("Choose at least one source."); return; }
      if (selectedSources.includes("GitHub") && !repository.trim()) { setError("Enter a public GitHub repository in owner/repository format."); return; }
      if (selectedSources.includes("Drive") && !driveFiles.length) { setError("Choose at least one document for the Drive source."); return; }
      if (selectedSources.includes("Meeting notes") && !meetingFiles.length) { setError("Choose at least one meeting-notes file."); return; }
    }
    setStep((current) => Math.min(3, current + 1));
  }

  async function startTransition() {
    if (!freeTierAttested) { setError("Confirm the source-data conditions before sending anything to Gemini."); return; }
    if (!selectedProject || !departing || !incoming) { setError("Project members are missing. Return to the earlier steps and select them."); return; }
    setRunning(true);
    setError("");
    try {
      let transitionId = createdTransitionId;
      if (!transitionId) {
        const transition = await createTransition({
          projectId,
          departingUserId,
          incomingUserId,
          targetRecipientRole: incomingRole === "Project lead" ? "project_lead" : incomingRole === "New volunteer" ? "new_volunteer" : "technical_successor",
          sources: sourceOptions.filter(({ kind }) => selectedSources.includes(kind)).map(({ kind }) => ({
            kind: backendKind(kind), accessLevel: apiAccess(sourceAccess[kind]),
            config: kind === "GitHub"
              ? { repository: repository.trim().replace(/^https:\/\/github\.com\//, "").replace(/\/$/, "") }
              : {},
          })),
        });
        transitionId = transition.id;
        setCreatedTransitionId(transitionId);
      }

      setPipelineStep(0);
      const uploads: Array<{ file: File; kind: SetupSourceKind }> = [
        ...driveFiles.map((file) => ({ file, kind: "Drive" as const })),
        ...meetingFiles.map((file) => ({ file, kind: "Meeting notes" as const })),
      ];
      for (const { file, kind } of uploads) {
        await uploadSource(transitionId, file, backendKind(kind), apiAccess(sourceAccess[kind]));
      }
      setPipelineStep(1);
      const result = await completeIngestion(transitionId, freeTierAttested);
      setPipelineStep(2);
      setTimeout(() => { router.push("/admin"); router.refresh(); }, 450);
      return result;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The handover could not be prepared. Your uploaded records are available for retry.");
      setRunning(false);
      setPipelineStep(-1);
    }
  }

  if (running) return <div className="pipeline-screen"><div className="pipeline-orbit"><Sparkles size={25} /></div><span className="eyebrow">PREPARING THE HANDOVER</span><h1>{pipelineStep >= 2 ? "Ready for human review" : "Building the project context"}</h1><p>{pipelineStep === 0 ? "Uploading the approved source records" : pipelineStep === 1 ? "Checking sources and asking Gemini to propose claims" : "Saving verified proposals for review"}</p><div className="pipeline-stages">{["Ingest", "Normalise", "Extract", "Verify"].map((stage, index) => { const done = index < (pipelineStep === 0 ? 1 : pipelineStep === 1 ? 2 : 4); const active = !done && index === (pipelineStep === 0 ? 1 : pipelineStep === 1 ? 2 : 3); return <div className={`pipeline-stage ${done ? "is-done" : active ? "is-active" : ""}`} key={stage}><span className="pipeline-stage-icon">{done ? <Check size={14} /> : active ? <span className="pipeline-spinner" /> : <Circle size={13} />}</span><span>{stage}</span><span className="pipeline-stage-state">{done ? "Complete" : active ? "In progress" : "Waiting"}</span></div>; })}</div><div className="pipeline-privacy"><ShieldCheck size={15} />AI claims remain proposals until a reviewer checks them.</div>{error && <p className="setup-error" role="alert">{error}</p>}</div>;

  return <div className="page-wrap setup-page">
    <div className="breadcrumb"><a href="/admin">Workspace</a><span>/</span><span>New transition</span></div>
    <div className="setup-heading"><div><div className="eyebrow"><span className="eyebrow-line" />SET UP A HANDOVER</div><h1>Start a real-source transition.</h1><p>Use public or synthetic demo records. Selected content will be sent to Gemini free tier for claim extraction.</p></div><div className="setup-step-count">STEP <strong>{step + 1}</strong> OF 4</div></div>
    <div className="setup-layout"><aside className="setup-stepper" aria-label="Transition setup steps">{["Choose a project", "Assign people", "Approved sources", "Confirm and start"].map((label, index) => <div className={`setup-step ${index === step ? "step-selected" : index < step ? "step-complete" : ""}`} key={label}><span className="setup-step-icon">{index < step ? <Check size={14} /> : index + 1}</span><span>{label}</span></div>)}</aside><section className="setup-card"><form onSubmit={validateAndAdvance}>
      {step === 0 && <div className="setup-form-step"><div className="setup-form-title"><span className="form-step-icon"><Cloud size={18} /></span><div><h2>Choose the project</h2><p>Select a project you supervise.</p></div></div><label htmlFor="project-select">Project</label><select id="project-select" className="setup-select" value={projectId} disabled={loadingProjects || Boolean(createdTransitionId)} onChange={(event) => changeProject(event.target.value)}><option value="">{loadingProjects ? "Loading projects…" : "Select a project"}</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select><div className="setup-info-box"><ShieldCheck size={15} /><span>Transitions are saved in the backend database.</span></div></div>}
      {step === 1 && <div className="setup-form-step"><div className="setup-form-title"><span className="form-step-icon"><UserRoundCheck size={18} /></span><div><h2>Assign people</h2><p>Choose members assigned to this project.</p></div></div><label htmlFor="departing-member">Departing member</label><select id="departing-member" className="setup-select" value={departingUserId} onChange={(event) => setDepartingUserId(event.target.value)}><option value="">Select departing member</option>{departingMembers.map((member) => <option key={member.id} value={member.id}>{member.name} · {member.email}</option>)}</select><label htmlFor="incoming-member">Incoming member</label><select id="incoming-member" className="setup-select" value={incomingUserId} onChange={(event) => setIncomingUserId(event.target.value)}><option value="">Select incoming member</option>{incomingMembers.map((member) => <option key={member.id} value={member.id}>{member.name} · {member.email}</option>)}</select><div className="setup-gap-top"><label htmlFor="incoming-role">Recipient role</label><select id="incoming-role" className="setup-select" value={incomingRole} onChange={(event) => setIncomingRole(event.target.value)}>{["Technical successor", "Project lead", "New volunteer"].map((role) => <option key={role}>{role}</option>)}</select></div><div className="setup-info-box"><LockKeyhole size={15} /><span>Incoming access starts after approval and expires automatically after 30 days.</span></div></div>}
      {step === 2 && <div className="setup-form-step"><div className="setup-form-title"><span className="form-step-icon"><ShieldCheck size={18} /></span><div><h2>Choose approved sources</h2><p>Only selected source records will be ingested.</p></div></div><div className="setup-source-list">{sourceOptions.map(({ kind, detail, Icon }) => { const checked = selectedSources.includes(kind); return <div className={`setup-source-row ${checked ? "source-selected" : ""}`} key={kind}><label className="source-choice"><input type="checkbox" checked={checked} onChange={(event) => setSelectedSources((current) => event.target.checked ? [...current, kind] : current.filter((item) => item !== kind))} /><span className="custom-checkbox"><Check size={12} /></span><span className="source-option-icon"><Icon size={16} /></span><span className="source-option-copy"><strong>{kind}</strong><small>{detail}</small></span></label><label className={`source-access-select ${checked ? "" : "disabled"}`}><span>Access level</span><select aria-label={`${kind} access level`} disabled={!checked} value={sourceAccess[kind]} onChange={(event) => setSourceAccess((current) => ({ ...current, [kind]: event.target.value as AccessLevel }))}>{accessLevels.map((level) => <option key={level}>{level}</option>)}</select></label></div>; })}</div>
        {selectedSources.includes("GitHub") && <div className="setup-upload-control"><label htmlFor="github-repository">Public GitHub repository</label><input id="github-repository" className="setup-input" value={repository} onChange={(event) => setRepository(event.target.value)} placeholder="owner/repository or https://github.com/owner/repository" /><small>Private repositories are rejected; no GitHub token is used.</small></div>}
        {selectedSources.includes("Drive") && <div className="setup-upload-control"><label htmlFor="drive-documents">Documents</label><input id="drive-documents" type="file" accept=".pdf,.docx,.md,.txt,application/pdf" multiple onChange={(event) => setDriveFiles(Array.from(event.target.files ?? []))} /><small>{driveFiles.length ? driveFiles.map((file) => file.name).join(", ") : "PDF, DOCX, Markdown, or text; 10 MB maximum per file."}</small></div>}
        {selectedSources.includes("Meeting notes") && <div className="setup-upload-control"><label htmlFor="meeting-documents">Meeting notes</label><input id="meeting-documents" type="file" accept=".pdf,.docx,.md,.txt,application/pdf" multiple onChange={(event) => setMeetingFiles(Array.from(event.target.files ?? []))} /><small>{meetingFiles.length ? meetingFiles.map((file) => file.name).join(", ") : "PDF, DOCX, Markdown, or text; 10 MB maximum per file."}</small></div>}
        <div className="source-permission-note"><LockKeyhole size={14} /><span>Do not upload private, confidential, personal, or secret content to the Gemini free-tier workflow.</span></div>
      </div>}
      {step === 3 && <div className="setup-form-step"><div className="setup-form-title"><span className="form-step-icon"><CheckCircle2 size={18} /></span><div><h2>Confirm and start</h2><p>Review what will be sent for extraction.</p></div></div><div className="confirm-summary"><div className="confirm-summary-top"><div><span className="mini-label">PROJECT</span><strong>{selectedProject?.name}</strong></div></div><div className="confirm-people"><div><span className="mini-label">DEPARTING</span><strong>{departing?.name}</strong></div><ArrowRight size={16} /><div><span className="mini-label">INCOMING</span><strong>{incoming?.name}</strong><span>{incomingRole}</span></div></div><div className="confirm-sources-heading"><strong>Selected sources</strong><span>{selectedSources.length}</span></div><div className="confirm-sources">{sourceOptions.filter(({ kind }) => selectedSources.includes(kind)).map(({ kind }) => <div className="confirm-source" key={kind}><span>{kind}</span><span>{kind === "GitHub" ? repository : kind === "Drive" ? `${driveFiles.length} file(s)` : `${meetingFiles.length} file(s)`}</span></div>)}</div></div><div className="setup-info-box"><Sparkles size={15} /><span>Gemini will receive the selected source text and propose claims. Evidence is checked by the backend; a reviewer must approve before publishing.</span></div><label className="source-permission-note"><input type="checkbox" checked={freeTierAttested} onChange={(event) => setFreeTierAttested(event.target.checked)} /><span>I confirm these sources are public or synthetic and contain no sensitive, confidential, or personal information. I understand their text will be sent to Gemini’s free tier, where Google may use inputs and outputs to improve services and human reviewers may process them.</span></label></div>}
      {error && <p className="setup-error" role="alert">{error}</p>}
      <div className="setup-actions">{step > 0 ? <button type="button" className="button button-secondary" onClick={() => { setError(""); setStep((current) => current - 1); }}><ArrowLeft size={14} />Back</button> : <a className="button button-secondary" href="/admin"><ArrowLeft size={14} />Cancel</a>}{step < 3 ? <button className="button button-primary" type="submit" disabled={loadingProjects}>Continue <ArrowRight size={14} /></button> : <button className="button button-primary" type="button" onClick={() => void startTransition()} disabled={running || !freeTierAttested}>Confirm and start <ArrowRight size={14} /></button>}</div>
    </form></section></div>
  </div>;
}
