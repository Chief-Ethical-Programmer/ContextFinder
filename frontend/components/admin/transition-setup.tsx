"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Circle, Cloud, FileText, GitBranch, LockKeyhole, MessageSquareText, ShieldCheck, Sparkles, UserRoundCheck } from "lucide-react";
import { completeIngestion, createTransition } from "@/lib/api/browser";
import type { AccessLevel, SourceKind } from "@/lib/types";

const projects = [
  { name: "CloudCart Platform", code: "P1", incomingName: "Ryan Chen", incomingRole: "Technical successor" },
  { name: "Atlas Community Portal", code: "P2", incomingName: "Mira Patel", incomingRole: "New volunteer" },
  { name: "Northstar Analytics", code: "P3", incomingName: "Sam Lee", incomingRole: "Project lead" },
];
const sourceOptions: Array<{ kind: SourceKind; detail: string; Icon: typeof GitBranch; initialAccess: AccessLevel }> = [
  { kind: "GitHub", detail: "Repository history, pull requests and issues", Icon: GitBranch, initialAccess: "Technical only" },
  { kind: "Slack", detail: "Approved Slack export files", Icon: MessageSquareText, initialAccess: "Public to team" },
  { kind: "Drive", detail: "Approved Drive export files", Icon: Cloud, initialAccess: "Technical only" },
  { kind: "Meeting notes", detail: "Meeting notes provided as files", Icon: FileText, initialAccess: "Leads only" },
];
const accessLevels: AccessLevel[] = ["Public to team", "Technical only", "Leads only"];
const stages = ["Ingest", "Normalise", "Extract", "Verify"];
const shortDelay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function TransitionSetup() {
  const router = useRouter();
  const params = useSearchParams();
  const existingId = params.get("existing") ?? undefined;
  const existingProject = existingId === "cf-atlas-02" ? projects[1] : projects[0];
  const [step, setStep] = useState(0);
  const [projectName, setProjectName] = useState(existingProject.name);
  const selectedProject = projects.find((project) => project.name === projectName) ?? projects[0];
  const [departingName, setDepartingName] = useState(existingId ? "" : "Alex Morgan");
  const [departingTitle, setDepartingTitle] = useState(existingId ? "" : "Senior DevOps Engineer");
  const [incomingName, setIncomingName] = useState(existingProject.incomingName);
  const [incomingRole, setIncomingRole] = useState(existingProject.incomingRole);
  const [daysRemaining, setDaysRemaining] = useState(7);
  const [selectedSources, setSelectedSources] = useState<SourceKind[]>(["GitHub", "Slack", "Drive"]);
  const [sourceAccess, setSourceAccess] = useState<Record<SourceKind, AccessLevel>>({ GitHub: "Technical only", Slack: "Public to team", Drive: "Technical only", "Meeting notes": "Leads only" });
  const [pipelineStep, setPipelineStep] = useState(-1);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  function updateProject(name: string) {
    setProjectName(name);
    const project = projects.find((item) => item.name === name);
    if (project) { setIncomingName(project.incomingName); setIncomingRole(project.incomingRole); }
  }

  function validateAndAdvance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step === 1 && (!departingName.trim() || !incomingName.trim() || !departingTitle.trim())) {
      setError("Add the departing and incoming people, plus the departing person’s role.");
      return;
    }
    if (step === 2 && selectedSources.length === 0) {
      setError("Choose at least one source for the handover.");
      return;
    }
    setError("");
    setStep((current) => Math.min(3, current + 1));
  }

  async function startTransition() {
    setRunning(true);
    setError("");
    try {
      const transition = await createTransition({
        project: selectedProject.name,
        projectCode: selectedProject.code,
        departingName: departingName.trim(),
        departingTitle: departingTitle.trim(),
        incomingName: incomingName.trim(),
        incomingRole,
        daysRemaining,
        existingTransitionId: existingId,
        sources: sourceOptions.filter((source) => selectedSources.includes(source.kind)).map((source) => ({ kind: source.kind, access: sourceAccess[source.kind] })),
      });
      setPipelineStep(0);
      for (let index = 0; index < stages.length; index += 1) {
        await shortDelay(700);
        setPipelineStep(index + 1);
      }
      await completeIngestion(transition.id);
      await shortDelay(550);
      router.push("/admin");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start the transition. Try again.");
      setRunning(false);
    }
  }

  const stageSubtitles = ["Reading the approved source files", "Putting notes and records into a common format", "Drafting claims from the available evidence", "Checking traceability and flagging gaps"];
  if (running) return <div className="pipeline-screen"><div className="pipeline-orbit"><Sparkles size={25} /></div><span className="eyebrow">PREPARING THE HANDOVER</span><h1>{pipelineStep >= stages.length ? "Ready for human review" : "Building the project context"}</h1><p>{pipelineStep >= stages.length ? "The proposed claims are on their way to the Departing review queue." : stageSubtitles[Math.min(pipelineStep, stages.length - 1)]}</p><div className="pipeline-stages">{stages.map((stage, index) => { const done = index < pipelineStep; const active = index === pipelineStep && pipelineStep < stages.length; return <div className={`pipeline-stage ${done ? "is-done" : active ? "is-active" : ""}`} key={stage}><span className="pipeline-stage-icon">{done ? <Check size={14} /> : active ? <span className="pipeline-spinner" /> : <Circle size={13} />}</span><span>{stage}</span><span className="pipeline-stage-state">{done ? "Complete" : active ? "In progress" : "Waiting"}</span></div>; })}</div><div className="pipeline-privacy"><ShieldCheck size={15} /> AI extracted content remains a proposal until a reviewer approves it.</div>{error && <p className="setup-error" role="alert">{error}</p>}</div>;

  return <div className="page-wrap setup-page">
    <div className="breadcrumb"><a href="/admin">Workspace</a><span>/</span><span>New transition</span></div>
    <div className="setup-heading"><div><div className="eyebrow"><span className="eyebrow-line" />SET UP A HANDOVER</div><h1>{existingId ? "Assign a team and start the handover." : "Start a new transition."}</h1><p>Choose what the system can read. You’ll review every claim before sharing anything.</p></div><div className="setup-step-count">STEP <strong>{step + 1}</strong> OF 4</div></div>
    <div className="setup-layout"><aside className="setup-stepper" aria-label="Transition setup steps">{["Choose a project", "People and timing", "Approved sources", "Confirm and start"].map((label, index) => <div className={`setup-step ${index === step ? "step-selected" : index < step ? "step-complete" : ""}`} key={label}><span className="setup-step-icon">{index < step ? <Check size={14} /> : index + 1}</span><span>{label}</span></div>)}</aside><section className="setup-card"><form onSubmit={validateAndAdvance}>
      {step === 0 && <div className="setup-form-step"><div className="setup-form-title"><span className="form-step-icon"><Cloud size={18} /></span><div><h2>Choose the project</h2><p>Which project is changing hands?</p></div></div><label htmlFor="project-select">Project</label><select id="project-select" className="setup-select" value={projectName} disabled={Boolean(existingId)} onChange={(event) => updateProject(event.target.value)}>{projects.map((project) => <option key={project.code} value={project.name}>{project.code} · {project.name}</option>)}</select><div className="setup-field-hint">{existingId ? "This handover is already attached to the project selected on the dashboard." : "Pick an existing project to attach the handover to its team and sources."}</div><div className="setup-info-box"><ShieldCheck size={15} /><span>ContextFinder reads only the sources you approve in the next step.</span></div></div>}
      {step === 1 && <div className="setup-form-step"><div className="setup-form-title"><span className="form-step-icon"><UserRoundCheck size={18} /></span><div><h2>People and timing</h2><p>Set the handover owner and the person continuing the work.</p></div></div><div className="setup-two-col"><div><label htmlFor="departing-name">Departing person</label><input id="departing-name" className="setup-input" required value={departingName} onChange={(event) => setDepartingName(event.target.value)} placeholder="Full name" /></div><div><label htmlFor="departing-title">Their role</label><input id="departing-title" className="setup-input" required value={departingTitle} onChange={(event) => setDepartingTitle(event.target.value)} placeholder="e.g. Senior engineer" /></div></div><div className="setup-two-col setup-gap-top"><div><label htmlFor="incoming-name">Incoming person</label><input id="incoming-name" className="setup-input" required value={incomingName} onChange={(event) => setIncomingName(event.target.value)} placeholder="Full name" /></div><div><label htmlFor="incoming-role">Incoming role</label><select id="incoming-role" className="setup-select" value={incomingRole} onChange={(event) => setIncomingRole(event.target.value)}>{["Technical successor", "Project lead", "New volunteer"].map((role) => <option key={role}>{role}</option>)}</select></div></div><div className="setup-days-row"><label htmlFor="days-remaining">Time until transition</label><div className="days-control"><input id="days-remaining" type="number" min={1} max={90} value={daysRemaining} onChange={(event) => setDaysRemaining(Number(event.target.value))} /><span>days remaining</span></div></div><div className="setup-info-box"><ShieldCheck size={15} /><span>Only the assigned people and cleared reviewers can see this setup.</span></div></div>}
      {step === 2 && <div className="setup-form-step"><div className="setup-form-title"><span className="form-step-icon"><ShieldCheck size={18} /></span><div><h2>Choose approved sources</h2><p>Select only the sources this handover is allowed to read.</p></div></div><div className="source-permission-note"><LockKeyhole size={14} /><span>Connecting a source does not mean every recipient can read it.</span></div><div className="setup-source-list">{sourceOptions.map(({ kind, detail, Icon }) => { const checked = selectedSources.includes(kind); return <div className={`setup-source-row ${checked ? "source-selected" : ""}`} key={kind}><label className="source-choice"><input type="checkbox" checked={checked} onChange={(event) => setSelectedSources((current) => event.target.checked ? [...current, kind] : current.filter((item) => item !== kind))} /><span className="custom-checkbox"><Check size={12} /></span><span className="source-option-icon"><Icon size={16} /></span><span className="source-option-copy"><strong>{kind === "Slack" ? "Slack export" : kind === "Drive" ? "Drive export" : kind}</strong><small>{detail}</small></span></label><label className={`source-access-select ${checked ? "" : "disabled"}`}><span>Access level</span><select aria-label={`${kind} access level`} disabled={!checked} value={sourceAccess[kind]} onChange={(event) => setSourceAccess((current) => ({ ...current, [kind]: event.target.value as AccessLevel }))}>{accessLevels.map((level) => <option key={level}>{level}</option>)}</select></label></div>; })}</div><div className="setup-field-hint">Restricted excerpts are filtered before a handover is shown to its recipient.</div></div>}
      {step === 3 && <div className="setup-form-step"><div className="setup-form-title"><span className="form-step-icon"><CheckCircle2 size={18} /></span><div><h2>Confirm and start</h2><p>Check the transition details and the source permissions.</p></div></div><div className="confirm-summary"><div className="confirm-summary-top"><div><span className="mini-label">PROJECT</span><strong>{selectedProject.name}</strong></div><span className="project-code">{selectedProject.code}</span></div><div className="confirm-people"><div><span className="mini-label">DEPARTING</span><strong>{departingName}</strong><span>{departingTitle}</span></div><ArrowRight size={16} /><div><span className="mini-label">INCOMING</span><strong>{incomingName}</strong><span>{incomingRole}</span></div><div className="confirm-days"><strong>{daysRemaining}</strong><span>days</span></div></div><div className="confirm-sources-heading"><strong>Approved sources</strong><span>{selectedSources.length} selected</span></div><div className="confirm-sources">{sourceOptions.filter((source) => selectedSources.includes(source.kind)).map(({ kind, Icon }) => <div className="confirm-source" key={kind}><span><Icon size={14} />{kind}</span><span>{sourceAccess[kind]}</span></div>)}</div></div><div className="setup-info-box"><Sparkles size={15} /><span>ContextFinder will propose claims. A reviewer must approve the handover before the incoming person can see it.</span></div></div>}
      {error && <p className="setup-error" role="alert">{error}</p>}
      <div className="setup-actions">{step > 0 ? <button type="button" className="button button-secondary" onClick={() => { setError(""); setStep((current) => current - 1); }}><ArrowLeft size={14} />Back</button> : <a className="button button-secondary" href="/admin"><ArrowLeft size={14} />Cancel</a>}{step < 3 ? <button className="button button-primary" type="submit">Continue <ArrowRight size={14} /></button> : <button className="button button-primary" type="button" onClick={startTransition} disabled={running}>Confirm and start <ArrowRight size={14} /></button>}</div>
    </form></section></div>
  </div>;
}
