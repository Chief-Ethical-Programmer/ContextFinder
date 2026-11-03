"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, ChevronDown, CircleDashed, Clock3, Download, FileQuestion, GitBranch, History, LockKeyhole, MessageSquareText, PencilLine, Search, Send, ShieldAlert, ShieldCheck, X } from "lucide-react";
import { AccessBadge, OriginBadge, TrustBadge, TypeBadge } from "@/components/shared/badges";
import { editClaim, getTransitionClaims, getTransitionVersions, publishTransition, reviewClaim } from "@/lib/api/browser";
import type { AccessLevel, Claim, ClaimEditInput, Evidence, Origin, Transition, TransitionVersion, TrustLabel } from "@/lib/types";

const trustOrder: Record<TrustLabel, number> = { Conflicting: 0, "Missing evidence": 1, Unverified: 2, "Partially supported": 3, Verified: 4 };
const trustOptions: TrustLabel[] = ["Conflicting", "Missing evidence", "Unverified", "Partially supported", "Verified"];
const originOptions: Origin[] = ["System extracted", "Stated by leaver", "Entered by reviewer"];
const accessOptions: AccessLevel[] = ["Public to team", "Technical only", "Leads only"];
const sourceIcon = { GitHub: GitBranch, Slack: MessageSquareText, Drive: FileQuestion, "Meeting notes": Clock3 };

type ModalState = { kind: "edit"; claim: Claim } | { kind: "ask"; claim: Claim } | { kind: "approve"; claim: Claim } | { kind: "publish" } | null;

function EvidenceItem({ evidence: item }: { evidence: Evidence }) {
  const Icon = sourceIcon[item.source];
  return <article className="review-evidence-item"><div className="review-evidence-top"><span className="review-source-name"><Icon size={13} />{item.source}</span><span className="review-evidence-author">{item.author}</span><time>{item.happenedAt}</time></div><p>{item.excerpt}</p>{item.href ? <a className="synthetic-source-label" href={item.href} target="_blank" rel="noreferrer">Open source record ↗</a> : <span className="synthetic-source-label">Imported record · no source link</span>}</article>;
}

function AnswerPanel({ answer }: { answer: string }) {
  if (answer.length <= 220) return <div className="review-claim-qa-answer"><strong>Departing member answer</strong><p>{answer}</p></div>;
  return <details className="review-claim-qa-answer review-answer-expand"><summary><strong>Departing member answer</strong><p className="review-answer-preview">{answer}</p><span className="review-expand-label">Expand full answer</span></summary><div className="review-answer-full"><p>{answer}</p></div></details>;
}

function ReviewClaimCard({ claim, evidence, busy, onAction, onEdit }: {
  claim: Claim;
  evidence: Evidence[];
  busy: boolean;
  onAction: (claim: Claim, action: "approve" | "reject" | "request-clarification") => void;
  onEdit: (claim: Claim) => void;
}) {
  const byId = new Map(evidence.map((item) => [item.id, item]));
  const linked = claim.evidenceIds.map((id) => ({ id, item: byId.get(id) }));
  const conflicting = claim.trust === "Conflicting";
  const followUps = claim.followUps ?? [];
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const hasFollowUps = followUps.length > 0 || Boolean(claim.responseNote);
  const cardActions = <div className="review-card-actions"><div className="review-action-group"><button type="button" className="review-action-button review-approve-button" disabled={busy || claim.status === "Approved"} title={claim.trust === "Conflicting" || claim.trust === "Missing evidence" ? "Confirm your human review and add a note to approve this AI-flagged claim." : undefined} onClick={() => onAction(claim, "approve")}><ShieldCheck size={13} />Approve claim</button><button type="button" className="review-action-button" disabled={busy} onClick={() => onEdit(claim)}><PencilLine size={13} />Edit</button><button type="button" className="review-action-button review-reject-button" disabled={busy || claim.status === "Rejected"} onClick={() => onAction(claim, "reject")}><X size={13} />Reject</button></div><button type="button" className="review-ask-button" disabled={busy} onClick={() => onAction(claim, "request-clarification")}><MessageSquareText size={13} />Ask for more</button></div>;
  return <article id={`review-claim-${claim.id}`} className={`review-claim-card ${conflicting ? "review-claim-conflicting" : ""}`}>
    <div className="review-card-head"><TrustBadge label={claim.trust} /><div className="review-card-head-right"><TypeBadge>{claim.type}</TypeBadge><AccessBadge level={claim.access} /></div></div>
    <div className="review-claim-body"><div className="review-claim-title-row"><div><span className="review-ai-finding-label">AI finding</span><h3>{claim.statement}</h3></div>{claim.status !== "Pending review" && <span className={`claim-review-status ${claim.status === "Approved" ? "claim-status-approved" : "claim-status-rejected"}`}>{claim.status === "Approved" ? <ShieldCheck size={12} /> : <X size={12} />}{claim.status}</span>}</div><div className="review-card-meta"><OriginBadge origin={claim.origin} /></div>
      {(followUps.length > 0 || claim.responseNote) && <section className="review-claim-qa"><div className="review-claim-qa-layout"><div className="review-claim-qa-main"><h4>Departing member follow-up</h4>{(followUps.length > 0 ? followUps : [{ source: "Gemini" as const, question: claim.statement, answer: claim.responseNote, status: "Answered" as const }]).map((followUp, index) => { const duplicateQuestion = normalize(followUp.question) === normalize(claim.statement); return <div className="review-claim-qa-item" key={`${claim.id}-${followUp.source}-${index}`}>{duplicateQuestion ? <div className="review-claim-qa-question"><span>Response to the AI finding above</span></div> : <div className="review-claim-qa-question"><span>{followUp.source === "Gemini" ? "Question for departing member" : "Reviewer follow-up question"}</span><p>{followUp.question}</p></div>}{followUp.answer ? <AnswerPanel answer={followUp.answer} /> : <p className="review-followup-waiting">{followUp.status === "Skipped" ? "The departing member skipped this question." : followUp.status === "Draft saved" ? "A draft has been saved but not submitted." : "Waiting for the departing member to respond."}</p>}</div>; })}</div>{cardActions}</div></section>}
      {!hasFollowUps && cardActions}
      {conflicting && <div className="conflict-comparison"><div className="conflict-comparison-header"><ShieldAlert size={14} /><strong>Sources disagree</strong><span>Compare the records before resolving this claim.</span></div><div className="conflict-columns">{linked.slice(0, 2).map(({ id, item }, index) => item ? <div className="conflict-column" key={id}><span className="conflict-source-label">{item.source} record</span><p>{item.excerpt}</p><small>{item.author} Â· {item.happenedAt}</small></div> : <div className="conflict-column conflict-no-source" key={id}><span className="conflict-source-label">{index === 0 ? "Source record" : "Source record"}</span><p>Evidence reference unavailable. The system rejected this reference.</p></div>)}{claim.origin === "Stated by leaver" && <div className="conflict-column conflict-leaver-answer"><span className="conflict-source-label">Leaver statement</span><p>{claim.statement}</p><small>Stated by leaver Â· review as their own words</small></div>}</div></div>}
      <div className="review-evidence-heading"><span>SUPPORTING EVIDENCE</span><span>{claim.evidenceIds.length} reference{claim.evidenceIds.length === 1 ? "" : "s"}</span></div><div className="review-evidence-list">{linked.map(({ id, item }) => item ? <EvidenceItem key={id} evidence={item} /> : <div className="review-missing-reference" key={id}><CircleDashed size={14} /><div><strong>System rejected broken evidence reference</strong><span>No source record exists for ID <code>{id}</code>.</span></div><span className="system-flag">SYSTEM FLAG</span></div>)}{linked.length === 0 && <div className="review-missing-reference"><FileQuestion size={14} /><div><strong>No supporting evidence linked</strong><span>This proposal needs a source or clarification.</span></div><span className="system-flag">NO EVIDENCE</span></div>}</div>
      <details className="claim-history-details"><summary><History size={13} />Review history <span>{claim.history.length} event{claim.history.length === 1 ? "" : "s"}</span><ChevronDown size={13} className="history-chevron" /></summary><div className="claim-history-list">{[...claim.history].reverse().map((entry, index) => <div className="claim-history-entry" key={`${claim.id}-${index}`}><span className="history-entry-dot" /><div><strong>{entry.action} Â· {entry.actor}</strong><span>{entry.at} Â· version {entry.version}</span>{entry.note && <p>{entry.note}</p>}</div></div>)}</div></details>
    </div>
  </article>;
}

function EditModal({ claim, evidence, onClose, onSave, busy, error }: { claim: Claim; evidence: Evidence[]; onClose: () => void; onSave: (edit: ClaimEditInput) => void; busy: boolean; error: string }) {
  const [statement, setStatement] = useState(claim.statement);
  const [trust, setTrust] = useState(claim.trust);
  const [access, setAccess] = useState(claim.access);
  const [origin, setOrigin] = useState(claim.origin);
  const [evidenceIds, setEvidenceIds] = useState(claim.evidenceIds.filter((id) => evidence.some((item) => item.id === id)));
  const [reviewerNote, setReviewerNote] = useState(claim.reviewerNote ?? "");
  const needsEvidence = trust === "Verified" || trust === "Partially supported";
  return <div className="review-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="review-modal edit-modal" role="dialog" aria-modal="true" aria-labelledby="edit-claim-title"><div className="review-modal-heading"><div><span className="eyebrow">REVIEWER EDIT Â· VERSIONED</span><h2 id="edit-claim-title">Edit claim</h2><p>Changes create a version entry and return the claim to review.</p></div><button type="button" className="icon-close-button" aria-label="Close edit panel" onClick={onClose}><X size={18} /></button></div><label htmlFor="edit-statement">Claim statement</label><textarea id="edit-statement" value={statement} onChange={(event) => setStatement(event.target.value)} rows={3} /><div className="review-modal-grid"><div><label htmlFor="edit-trust">Trust label</label><select id="edit-trust" value={trust} onChange={(event) => setTrust(event.target.value as TrustLabel)}>{trustOptions.map((item) => <option key={item}>{item}</option>)}</select></div><div><label htmlFor="edit-access">Access level</label><select id="edit-access" value={access} onChange={(event) => setAccess(event.target.value as AccessLevel)}>{accessOptions.map((item) => <option key={item}>{item}</option>)}</select></div></div><div className="review-modal-grid"><div><label htmlFor="edit-origin">Origin</label><select id="edit-origin" value={origin} onChange={(event) => setOrigin(event.target.value as Origin)}>{originOptions.map((item) => <option key={item}>{item}</option>)}</select></div><div className="evidence-selector-hint">{needsEvidence ? "A verified or partially supported claim needs at least one linked record." : "Link the records that support the revised statement."}</div></div><fieldset className="evidence-selector"><legend>Linked evidence</legend>{evidence.map((item) => <label key={item.id} className="evidence-selector-item"><input type="checkbox" checked={evidenceIds.includes(item.id)} onChange={(event) => setEvidenceIds((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} /><span className="selector-check"><Check size={10} /></span><span><strong>{item.source}</strong><small>{item.author} Â· {item.excerpt}</small></span></label>)}</fieldset><label htmlFor="reviewer-note">Reviewer note <span className="label-optional">(required to resolve a conflict or evidence gap)</span></label><textarea id="reviewer-note" value={reviewerNote} onChange={(event) => setReviewerNote(event.target.value)} rows={2} placeholder="Why is this change supported?" />{error && <p className="review-modal-error" role="alert">{error}</p>}<div className="review-modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button><button type="button" className="button button-primary" disabled={busy} onClick={() => onSave({ statement, trust, access, origin, evidenceIds, reviewerNote })}>{busy ? "Savingâ€¦" : "Save versioned edit"}<Check size={14} /></button></div></section></div>;
}

function NoteModal({ title, description, value, setValue, onClose, onSubmit, busy, error, submitLabel, fieldLabel, fieldPlaceholder }: { title: string; description: string; value: string; setValue: (value: string) => void; onClose: () => void; onSubmit: () => void; busy: boolean; error: string; submitLabel: string; fieldLabel?: string; fieldPlaceholder?: string }) {
  return <div className="review-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className={`review-modal note-modal ${title === "Confirm human approval" ? "human-approval-modal" : ""}`} role="dialog" aria-modal="true" aria-labelledby="note-modal-title"><div className="review-modal-heading"><div><span className="eyebrow">AUDITABLE REVIEW</span><h2 id="note-modal-title">{title}</h2><p>{description}</p></div><button type="button" className="icon-close-button" aria-label="Close dialog" onClick={onClose}><X size={18} /></button></div><label htmlFor="review-note-text">{fieldLabel ?? (title.toLowerCase().includes("approv") ? "Reviewer remarks" : "Question for departing member")}</label><textarea id="review-note-text" rows={4} autoFocus value={value} onChange={(event) => setValue(event.target.value)} placeholder={fieldPlaceholder ?? (title.toLowerCase().includes("approv") ? "Add context for the incoming person." : "What should the departing person clarify?")} />{error && <p className="review-modal-error" role="alert">{error}</p>}<div className="review-modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button><button type="button" className="button button-primary" disabled={busy} onClick={onSubmit}>{busy ? "Savingâ€¦" : submitLabel}{title.toLowerCase().includes("approv") ? <ShieldCheck size={14} /> : <Send size={13} />}</button></div></section></div>;
}

function VersionsDrawer({ versions, onClose }: { versions: TransitionVersion[]; onClose: () => void }) {
  return <div className="versions-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><aside className="versions-drawer" role="dialog" aria-modal="true" aria-labelledby="versions-title"><div className="versions-drawer-head"><div><span className="eyebrow">CHANGE RECORD</span><h2 id="versions-title">Version history</h2><p>Every reviewer decision is preserved.</p></div><button className="icon-close-button" aria-label="Close version history" type="button" onClick={onClose}><X size={18} /></button></div><div className="versions-list">{versions.length === 0 && <div className="versions-empty">No versions recorded yet.</div>}{versions.map((version) => <article className={`version-entry ${version.published ? "version-published" : ""}`} key={`${version.transitionId}-${version.version}`}><div className="version-entry-marker">{version.published ? <ShieldCheck size={14} /> : <History size={13} />}</div><div className="version-entry-content"><div className="version-entry-title"><strong>Version {version.version}</strong>{version.published && <span>Published</span>}</div><p>{version.summary}</p><small>{version.actor} Â· {version.createdAt}</small>{version.remark && <blockquote>â€œ{version.remark}â€</blockquote>}</div></article>)}</div><div className="versions-drawer-foot"><LockKeyhole size={13} />Version changes are included in the audit history.</div></aside></div>;
}

export function ReviewerWorkspace({ transition, initialClaims, evidence, initialVersions, homeHref = "/admin" }: { transition: Transition; initialClaims: Claim[]; evidence: Evidence[]; initialVersions: TransitionVersion[]; homeHref?: string }) {
  const router = useRouter();
  const [claims, setClaims] = useState(initialClaims);
  const [versions, setVersions] = useState(initialVersions);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyClaimId, setBusyClaimId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [modal, setModal] = useState<ModalState>(null);
  const [modalError, setModalError] = useState("");
  const [noteValue, setNoteValue] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const latest = await getTransitionClaims(transition.id);
        if (active) setClaims(latest);
      } catch { /* Keep the last loaded claims if a refresh is temporarily unavailable. */ }
    };
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 6000);
    return () => { active = false; window.clearInterval(timer); };
  }, [transition.id]);

  const sortedClaims = useMemo(() => [...claims].sort((a, b) => trustOrder[a.trust] - trustOrder[b.trust] || a.statement.localeCompare(b.statement)), [claims]);
  const filteredClaims = useMemo(() => sortedClaims.filter((claim) => {
    const evidenceText = claim.evidenceIds.map((id) => evidence.find((item) => item.id === id)).filter((item): item is Evidence => Boolean(item)).map((item) => `${item.source} ${item.author} ${item.excerpt}`).join(" ");
    const searchText = `${claim.statement} ${claim.type} ${claim.origin} ${claim.trust} ${evidenceText}`.toLowerCase();
    return !query || searchText.includes(query.toLowerCase());
  }), [sortedClaims, query, evidence]);
  const reviewedCount = claims.filter((claim) => claim.status !== "Pending review").length;
  const blockingClaims = claims.filter((claim) => (claim.trust === "Conflicting" || claim.trust === "Missing evidence") && claim.status !== "Rejected" && claim.status !== "Approved");
  const alreadyApproved = transition.status === "Approved";

  const reviewLocked = alreadyApproved;
  const canGiveFinalApproval = claims.length > 0 && reviewedCount === claims.length && blockingClaims.length === 0;
  const editModal = modal?.kind === "edit" ? modal : null;
  const askModal = modal?.kind === "ask" ? modal : null;
  const approveModal = modal?.kind === "approve" ? modal : null;
  const publishModal = modal?.kind === "publish" ? modal : null;
  async function refreshVersions() {
    try { setVersions(await getTransitionVersions(transition.id)); } catch { /* The audit history already exists on the server; keep the visible version list. */ }
  }

  async function applyReviewAction(claim: Claim, action: "approve" | "reject" | "request-clarification", note?: string) {
    setBusy(true); setBusyClaimId(claim.id); setError(""); setSuccess("");
    try {
      const updated = await reviewClaim(transition.id, claim.id, action, note);
      setClaims((current) => current.map((item) => item.id === updated.id ? updated : item));
      setModal(null); setModalError(""); setNoteValue("");
      setSuccess(action === "approve" ? "Claim approved and saved to a new version." : action === "reject" ? "Claim rejected and recorded in history." : "Clarification request saved for the departing person.");
      await refreshVersions();
    } catch (cause) { const message = cause instanceof Error ? cause.message : "Review action failed."; if (action === "approve" && (claim.trust === "Conflicting" || claim.trust === "Missing evidence")) setModalError(message); else setError(message); }
    finally { setBusy(false); setBusyClaimId(""); }
  }

  async function saveClaimEdit(claim: Claim, edit: ClaimEditInput) {
    if (!edit.statement.trim()) { setModalError("Enter a claim statement."); return; }
    if ((edit.trust === "Verified" || edit.trust === "Partially supported") && edit.evidenceIds.length === 0) { setModalError("Link at least one evidence record for this trust label."); return; }
    if ((claim.trust === "Conflicting" || claim.trust === "Missing evidence") && claim.trust !== edit.trust && !edit.reviewerNote.trim()) { setModalError("Add a reviewer note explaining how this conflict or evidence gap was resolved."); return; }
    setBusy(true); setBusyClaimId(claim.id); setModalError(""); setError("");
    try {
      const updated = await editClaim(transition.id, claim.id, edit);
      setClaims((current) => current.map((item) => item.id === updated.id ? updated : item));
      setModal(null); setSuccess("Claim edited. The change was saved as a new version and returned to review.");
      await refreshVersions();
    } catch (cause) { setModalError(cause instanceof Error ? cause.message : "Claim edit failed."); }
    finally { setBusy(false); setBusyClaimId(""); }
  }

  async function publish() {
    setBusy(true); setError(""); setModalError("");
    try {
      const result = await publishTransition(transition.id, noteValue);
      await refreshVersions();
      router.push(homeHref === "/reviewer" ? homeHref : `${homeHref}/transitions/${result.id}/approved`);
      router.refresh();
    } catch (cause) { setModalError(cause instanceof Error ? cause.message : "Publishing failed."); }
    finally { setBusy(false); }
  }

  function handleCardAction(claim: Claim, action: "approve" | "reject" | "request-clarification") {
    if (action === "request-clarification") { setModal({ kind: "ask", claim }); setModalError(""); setNoteValue(""); return; }
    if (action === "approve" && (claim.trust === "Conflicting" || claim.trust === "Missing evidence")) { setModal({ kind: "approve", claim }); setModalError(""); setNoteValue(""); return; }
    void applyReviewAction(claim, action);
  }

  return <div className="review-page">
    <div className="review-page-wrap"><div className="breadcrumb"><a href={homeHref}>Workspace</a><span>/</span><span>{transition.project}</span><span>/</span><span>Review</span></div>
      <div className="review-page-titlebar"><div><a className="review-back-link" href={homeHref}><ArrowLeft size={14} />All transitions</a><div className="review-title-row"><div><div className="eyebrow"><span className="eyebrow-line" />HUMAN REVIEW</div><h1>{transition.project}</h1><p className="review-subtitle">Review each proposed claim against its source records before the handover is shared.</p></div><div className="review-version-button-group"><button className="versions-open-button" type="button" onClick={() => setDrawerOpen(true)}><History size={14} />Version history<span>{versions.length}</span></button><a className="review-version-link" href={`${homeHref}/transitions/${transition.id}/versions`} aria-label="Open version history page"><ArrowUpRight size={14} /></a></div></div></div></div>
      <div className="review-participants"><div className="review-participant"><span className="person-avatar avatar-indigo">{transition.departing.initials}</span><span><small>HANDING OVER</small><strong>{transition.departing.name}</strong></span></div></div>
      <div className="review-toolbar"><div className="review-count-label"><strong>{filteredClaims.length}</strong><span>{filteredClaims.length === claims.length ? "claims" : `of ${claims.length} claims`}</span><span className="review-sort-label">Risk first</span></div><label className="review-search"><Search size={15} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search claims or evidence" aria-label="Search claims or evidence" /></label></div>
      {success && <div className="review-feedback feedback-success" role="status"><ShieldCheck size={14} />{success}<button type="button" aria-label="Dismiss message" onClick={() => setSuccess("")}><X size={13} /></button></div>}{error && <div className="review-feedback feedback-error" role="alert"><ShieldAlert size={14} />{error}<button type="button" aria-label="Dismiss message" onClick={() => setError("")}><X size={13} /></button></div>}
      <div className="review-claims-list">{filteredClaims.map((claim) => <ReviewClaimCard key={claim.id} claim={claim} evidence={evidence} busy={busy || reviewLocked} onAction={handleCardAction} onEdit={(item) => { setModal({ kind: "edit", claim: item }); setModalError(""); }} />)}{filteredClaims.length === 0 && <div className="review-empty-state"><Search size={19} /><strong>No matching claims</strong><span>Try another search.</span></div>}</div>
      <div className="review-source-footer"><span><Download size={13} />{transition.project} source records</span><span>Imported content is rendered as plain text Â· secrets are redacted</span></div>
    </div>
      <div className="review-sticky-footer"><div className="review-progress"><div className="review-progress-copy"><span><strong>{reviewedCount}</strong> of {claims.length} reviewed</span><span className={blockingClaims.length ? "blocking-text" : "resolved-text"}>{blockingClaims.length ? `${blockingClaims.length} flagged claim${blockingClaims.length === 1 ? "" : "s"} awaiting a decision` : alreadyApproved ? "Reviewer approved" : "No unresolved claims"}</span></div><div className="review-progress-track"><span style={{ width: `${claims.length ? Math.round(reviewedCount / claims.length * 100) : 0}%` }} /></div></div><div className="publish-gate-copy">{blockingClaims.length ? <><ShieldAlert size={14} />Review flagged claims; approve with a note or reject</> : <><ShieldCheck size={14} />Your approval completes the handover review</>}</div><button className="publish-button" type="button" disabled={busy || reviewLocked || !canGiveFinalApproval} title={alreadyApproved ? "You have approved this handover." : !canGiveFinalApproval ? "Review every claim and resolve all flagged claims first." : "Approve the full handover after all claims are reviewed."} onClick={() => { setModal({ kind: "publish" }); setModalError(""); setNoteValue(transition.reviewerRemarks ?? ""); }}>{alreadyApproved ? "Handover approved" : "Approve handover"}<ArrowRight size={15} /></button></div>
    {drawerOpen && <VersionsDrawer versions={versions} onClose={() => setDrawerOpen(false)} />}
    {editModal && <EditModal claim={editModal.claim} evidence={evidence} onClose={() => setModal(null)} onSave={(edit) => void saveClaimEdit(editModal.claim, edit)} busy={busyClaimId === editModal.claim.id} error={modalError} />}
    {askModal && <NoteModal title="Ask for more context" description="This request will be added to the claim history and prepared for the departing person." value={noteValue} setValue={setNoteValue} onClose={() => setModal(null)} onSubmit={() => { if (!noteValue.trim()) { setModalError("Enter a short, specific question."); return; } void applyReviewAction(askModal.claim, "request-clarification", noteValue); }} busy={busyClaimId === askModal.claim.id} error={modalError} submitLabel="Save question" />}
    {approveModal && <NoteModal title="Confirm human approval" description={`This AI flagged the claim as ${approveModal.claim.trust}. If you have checked the answer and evidence and are satisfied, add a note explaining your decision. The AI label will remain visible in the audit trail.`} value={noteValue} setValue={setNoteValue} onClose={() => setModal(null)} onSubmit={() => { if (!noteValue.trim()) { setModalError("Add a short note explaining your human review decision."); return; } void applyReviewAction(approveModal.claim, "approve", noteValue); }} busy={busyClaimId === approveModal.claim.id} error={modalError} submitLabel="Approve claim" fieldLabel="Human review note (required)" fieldPlaceholder="Explain why you approve this claim despite the AI flag." />}
    {publishModal && <NoteModal title="Approve handover?" description="This publishes all reviewed claims and moves the handover to the admin onboarding queue for incoming-member assignment." value={noteValue} setValue={setNoteValue} onClose={() => setModal(null)} onSubmit={() => void publish()} busy={busy} error={modalError} submitLabel="Approve and publish handover" fieldLabel="Reviewer remarks (optional)" fieldPlaceholder="Add context for the incoming person." />}
  </div>;
}
