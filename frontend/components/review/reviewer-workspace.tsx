"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, CheckCheck, ChevronDown, CircleDashed, Clock3, Download, FileQuestion, GitBranch, History, LockKeyhole, MessageSquareText, PencilLine, Search, Send, ShieldAlert, ShieldCheck, SlidersHorizontal, X } from "lucide-react";
import { AccessBadge, OriginBadge, TrustBadge, TypeBadge } from "@/components/shared/badges";
import { bulkApproveClaims, editClaim, getTransitionVersions, publishTransition, reviewClaim } from "@/lib/api/browser";
import type { AccessLevel, Claim, ClaimEditInput, ClaimType, Evidence, Origin, Transition, TransitionVersion, TrustLabel } from "@/lib/types";

const trustOrder: Record<TrustLabel, number> = { Conflicting: 0, "Missing evidence": 1, Unverified: 2, "Partially supported": 3, Verified: 4 };
const trustOptions: TrustLabel[] = ["Conflicting", "Missing evidence", "Unverified", "Partially supported", "Verified"];
const typeOptions: ClaimType[] = ["Decision", "Owner", "Task", "Dependency", "Risk", "Open question", "Next action"];
const originOptions: Origin[] = ["System extracted", "Stated by leaver", "Entered by reviewer"];
const accessOptions: AccessLevel[] = ["Public to team", "Technical only", "Leads only"];
const sourceIcon = { GitHub: GitBranch, Slack: MessageSquareText, Drive: FileQuestion, "Meeting notes": Clock3 };

type ModalState = { kind: "edit"; claim: Claim } | { kind: "ask"; claim: Claim } | { kind: "publish" } | null;

function EvidenceItem({ evidence: item }: { evidence: Evidence }) {
  const Icon = sourceIcon[item.source];
  return <article className="review-evidence-item"><div className="review-evidence-top"><span className="review-source-name"><Icon size={13} />{item.source}</span><span className="review-evidence-author">{item.author}</span><time>{item.happenedAt}</time></div><p>{item.excerpt}</p><span className="synthetic-source-label">Synthetic demo excerpt · source link unavailable</span></article>;
}

function ReviewClaimCard({ claim, evidence, selected, disabledSelection, busy, onSelect, onAction, onEdit }: {
  claim: Claim;
  evidence: Evidence[];
  selected: boolean;
  disabledSelection?: string;
  busy: boolean;
  onSelect: (id: string, checked: boolean) => void;
  onAction: (claim: Claim, action: "approve" | "reject" | "request-clarification") => void;
  onEdit: (claim: Claim) => void;
}) {
  const byId = new Map(evidence.map((item) => [item.id, item]));
  const linked = claim.evidenceIds.map((id) => ({ id, item: byId.get(id) }));
  const conflicting = claim.trust === "Conflicting";
  return <article className={`review-claim-card ${conflicting ? "review-claim-conflicting" : ""}`}>
    <div className="review-card-head"><label className={`review-select ${disabledSelection ? "review-select-disabled" : ""}`} title={disabledSelection ?? "Select for bulk approval"}><input type="checkbox" checked={selected} disabled={Boolean(disabledSelection) || busy} onChange={(event) => onSelect(claim.id, event.target.checked)} aria-label={`Select claim: ${claim.statement}`} /><span className="review-checkmark"><Check size={11} /></span></label><TrustBadge label={claim.trust} /><div className="review-card-head-right"><TypeBadge>{claim.type}</TypeBadge><AccessBadge level={claim.access} /></div></div>
    <div className="review-claim-body"><div className="review-claim-title-row"><h3>{claim.statement}</h3>{claim.status !== "Pending review" && <span className={`claim-review-status ${claim.status === "Approved" ? "claim-status-approved" : "claim-status-rejected"}`}>{claim.status === "Approved" ? <ShieldCheck size={12} /> : <X size={12} />}{claim.status}</span>}</div><div className="review-card-meta"><OriginBadge origin={claim.origin} />{claim.proposal && <span className="proposal-note"><span aria-hidden="true">✦</span> AI proposal · not shared</span>}{claim.reviewerNote && <span className="reviewer-note-chip">Reviewer note attached</span>}</div>
      {conflicting && <div className="conflict-comparison"><div className="conflict-comparison-header"><ShieldAlert size={14} /><strong>Sources disagree</strong><span>Compare the records before resolving this claim.</span></div><div className="conflict-columns">{linked.slice(0, 2).map(({ id, item }, index) => item ? <div className="conflict-column" key={id}><span className="conflict-source-label">{item.source} record</span><p>{item.excerpt}</p><small>{item.author} · {item.happenedAt}</small></div> : <div className="conflict-column conflict-no-source" key={id}><span className="conflict-source-label">{index === 0 ? "Source record" : "Source record"}</span><p>Evidence reference unavailable. The system rejected this reference.</p></div>)}{claim.origin === "Stated by leaver" && <div className="conflict-column conflict-leaver-answer"><span className="conflict-source-label">Leaver statement</span><p>{claim.statement}</p><small>Stated by leaver · review as their own words</small></div>}</div></div>}
      <div className="review-evidence-heading"><span>SUPPORTING EVIDENCE</span><span>{claim.evidenceIds.length} reference{claim.evidenceIds.length === 1 ? "" : "s"}</span></div><div className="review-evidence-list">{linked.map(({ id, item }) => item ? <EvidenceItem key={id} evidence={item} /> : <div className="review-missing-reference" key={id}><CircleDashed size={14} /><div><strong>System rejected broken evidence reference</strong><span>No source record exists for ID <code>{id}</code>.</span></div><span className="system-flag">SYSTEM FLAG</span></div>)}{linked.length === 0 && <div className="review-missing-reference"><FileQuestion size={14} /><div><strong>No supporting evidence linked</strong><span>This proposal needs a source or clarification.</span></div><span className="system-flag">NO EVIDENCE</span></div>}</div>
      <details className="claim-history-details"><summary><History size={13} />Review history <span>{claim.history.length} event{claim.history.length === 1 ? "" : "s"}</span><ChevronDown size={13} className="history-chevron" /></summary><div className="claim-history-list">{[...claim.history].reverse().map((entry, index) => <div className="claim-history-entry" key={`${claim.id}-${index}`}><span className="history-entry-dot" /><div><strong>{entry.action} · {entry.actor}</strong><span>{entry.at} · version {entry.version}</span>{entry.note && <p>{entry.note}</p>}</div></div>)}</div></details>
      <div className="review-card-actions"><div className="review-action-group"><button type="button" className="review-action-button review-approve-button" disabled={busy || claim.status === "Approved" || claim.trust === "Conflicting" || claim.trust === "Missing evidence"} title={claim.trust === "Conflicting" || claim.trust === "Missing evidence" ? "Edit the trust label with a reviewer note or reject this blocker first." : undefined} onClick={() => onAction(claim, "approve")}><ShieldCheck size={13} />Approve</button><button type="button" className="review-action-button" disabled={busy} onClick={() => onEdit(claim)}><PencilLine size={13} />Edit</button><button type="button" className="review-action-button review-reject-button" disabled={busy || claim.status === "Rejected"} onClick={() => onAction(claim, "reject")}><X size={13} />Reject</button></div><button type="button" className="review-ask-button" disabled={busy} onClick={() => onAction(claim, "request-clarification")}><MessageSquareText size={13} />Ask for more</button></div>
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
  return <div className="review-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="review-modal edit-modal" role="dialog" aria-modal="true" aria-labelledby="edit-claim-title"><div className="review-modal-heading"><div><span className="eyebrow">REVIEWER EDIT · VERSIONED</span><h2 id="edit-claim-title">Edit claim</h2><p>Changes create a version entry and return the claim to review.</p></div><button type="button" className="icon-close-button" aria-label="Close edit panel" onClick={onClose}><X size={18} /></button></div><label htmlFor="edit-statement">Claim statement</label><textarea id="edit-statement" value={statement} onChange={(event) => setStatement(event.target.value)} rows={3} /><div className="review-modal-grid"><div><label htmlFor="edit-trust">Trust label</label><select id="edit-trust" value={trust} onChange={(event) => setTrust(event.target.value as TrustLabel)}>{trustOptions.map((item) => <option key={item}>{item}</option>)}</select></div><div><label htmlFor="edit-access">Access level</label><select id="edit-access" value={access} onChange={(event) => setAccess(event.target.value as AccessLevel)}>{accessOptions.map((item) => <option key={item}>{item}</option>)}</select></div></div><div className="review-modal-grid"><div><label htmlFor="edit-origin">Origin</label><select id="edit-origin" value={origin} onChange={(event) => setOrigin(event.target.value as Origin)}>{originOptions.map((item) => <option key={item}>{item}</option>)}</select></div><div className="evidence-selector-hint">{needsEvidence ? "A verified or partially supported claim needs at least one linked record." : "Link the records that support the revised statement."}</div></div><fieldset className="evidence-selector"><legend>Linked evidence</legend>{evidence.map((item) => <label key={item.id} className="evidence-selector-item"><input type="checkbox" checked={evidenceIds.includes(item.id)} onChange={(event) => setEvidenceIds((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} /><span className="selector-check"><Check size={10} /></span><span><strong>{item.source}</strong><small>{item.author} · {item.excerpt}</small></span></label>)}</fieldset><label htmlFor="reviewer-note">Reviewer note <span className="label-optional">(required to resolve a conflict or evidence gap)</span></label><textarea id="reviewer-note" value={reviewerNote} onChange={(event) => setReviewerNote(event.target.value)} rows={2} placeholder="Why is this change supported?" />{error && <p className="review-modal-error" role="alert">{error}</p>}<div className="review-modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button><button type="button" className="button button-primary" disabled={busy} onClick={() => onSave({ statement, trust, access, origin, evidenceIds, reviewerNote })}>{busy ? "Saving…" : "Save versioned edit"}<Check size={14} /></button></div></section></div>;
}

function NoteModal({ title, description, value, setValue, onClose, onSubmit, busy, error, submitLabel }: { title: string; description: string; value: string; setValue: (value: string) => void; onClose: () => void; onSubmit: () => void; busy: boolean; error: string; submitLabel: string }) {
  return <div className="review-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="review-modal note-modal" role="dialog" aria-modal="true" aria-labelledby="note-modal-title"><div className="review-modal-heading"><div><span className="eyebrow">AUDITABLE REVIEW</span><h2 id="note-modal-title">{title}</h2><p>{description}</p></div><button type="button" className="icon-close-button" aria-label="Close dialog" onClick={onClose}><X size={18} /></button></div><label htmlFor="review-note-text">{title.includes("Publish") ? "Reviewer remarks" : "Question for Alex"}</label><textarea id="review-note-text" rows={4} autoFocus value={value} onChange={(event) => setValue(event.target.value)} placeholder={title.includes("Publish") ? "Add any final context for the incoming person…" : "What should the departing person clarify?"} />{error && <p className="review-modal-error" role="alert">{error}</p>}<div className="review-modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button><button type="button" className="button button-primary" disabled={busy} onClick={onSubmit}>{busy ? "Saving…" : submitLabel}{title.includes("Publish") ? <ShieldCheck size={14} /> : <Send size={13} />}</button></div></section></div>;
}

function VersionsDrawer({ versions, onClose }: { versions: TransitionVersion[]; onClose: () => void }) {
  return <div className="versions-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><aside className="versions-drawer" role="dialog" aria-modal="true" aria-labelledby="versions-title"><div className="versions-drawer-head"><div><span className="eyebrow">CHANGE RECORD</span><h2 id="versions-title">Version history</h2><p>Every reviewer decision is preserved.</p></div><button className="icon-close-button" aria-label="Close version history" type="button" onClick={onClose}><X size={18} /></button></div><div className="versions-list">{versions.length === 0 && <div className="versions-empty">No versions recorded yet.</div>}{versions.map((version) => <article className={`version-entry ${version.published ? "version-published" : ""}`} key={`${version.transitionId}-${version.version}`}><div className="version-entry-marker">{version.published ? <ShieldCheck size={14} /> : <History size={13} />}</div><div className="version-entry-content"><div className="version-entry-title"><strong>Version {version.version}</strong>{version.published && <span>Published</span>}</div><p>{version.summary}</p><small>{version.actor} · {version.createdAt}</small>{version.remark && <blockquote>“{version.remark}”</blockquote>}</div></article>)}</div><div className="versions-drawer-foot"><LockKeyhole size={13} />Version changes are included in the audit history.</div></aside></div>;
}

export function ReviewerWorkspace({ transition, initialClaims, evidence, initialVersions }: { transition: Transition; initialClaims: Claim[]; evidence: Evidence[]; initialVersions: TransitionVersion[] }) {
  const router = useRouter();
  const [claims, setClaims] = useState(initialClaims);
  const [versions, setVersions] = useState(initialVersions);
  const [trustFilter, setTrustFilter] = useState("All trust labels");
  const [typeFilter, setTypeFilter] = useState("All claim types");
  const [originFilter, setOriginFilter] = useState("All origins");
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [busyClaimId, setBusyClaimId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [modal, setModal] = useState<ModalState>(null);
  const [modalError, setModalError] = useState("");
  const [noteValue, setNoteValue] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);

  const sortedClaims = useMemo(() => [...claims].sort((a, b) => trustOrder[a.trust] - trustOrder[b.trust] || a.statement.localeCompare(b.statement)), [claims]);
  const filteredClaims = useMemo(() => sortedClaims.filter((claim) => {
    const evidenceText = claim.evidenceIds.map((id) => evidence.find((item) => item.id === id)).filter((item): item is Evidence => Boolean(item)).map((item) => `${item.source} ${item.author} ${item.excerpt}`).join(" ");
    const searchText = `${claim.statement} ${claim.type} ${claim.origin} ${claim.trust} ${evidenceText}`.toLowerCase();
    return (trustFilter === "All trust labels" || claim.trust === trustFilter) && (typeFilter === "All claim types" || claim.type === typeFilter) && (originFilter === "All origins" || claim.origin === originFilter) && (!query || searchText.includes(query.toLowerCase()));
  }), [sortedClaims, trustFilter, typeFilter, originFilter, query, evidence]);
  const reviewedCount = claims.filter((claim) => claim.status !== "Pending review").length;
  const blockingClaims = claims.filter((claim) => (claim.trust === "Conflicting" || claim.trust === "Missing evidence") && claim.status !== "Rejected");
  const alreadyPublished = transition.status === "Approved";
  const eligibleSelected = selectedIds.filter((id) => { const claim = claims.find((item) => item.id === id); return claim && (claim.trust === "Verified" || claim.trust === "Partially supported"); });
  const editModal = modal?.kind === "edit" ? modal : null;
  const askModal = modal?.kind === "ask" ? modal : null;
  const publishModal = modal?.kind === "publish" ? modal : null;

  async function refreshVersions() {
    try { setVersions(await getTransitionVersions(transition.id)); } catch { /* The audit history already exists on the server; keep the visible version list. */ }
  }

  async function applyReviewAction(claim: Claim, action: "approve" | "reject" | "request-clarification", note?: string) {
    setBusy(true); setBusyClaimId(claim.id); setError(""); setSuccess("");
    try {
      const updated = await reviewClaim(transition.id, claim.id, action, note);
      setClaims((current) => current.map((item) => item.id === updated.id ? updated : item));
      setSelectedIds((current) => current.filter((id) => id !== claim.id));
      setModal(null); setModalError(""); setNoteValue("");
      setSuccess(action === "approve" ? "Claim approved and saved to a new version." : action === "reject" ? "Claim rejected and recorded in history." : "Clarification request saved for the departing person.");
      await refreshVersions();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Review action failed."); }
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
      setSelectedIds((current) => current.filter((id) => id !== claim.id));
      setModal(null); setSuccess("Claim edited. The change was saved as a new version and returned to review.");
      await refreshVersions();
    } catch (cause) { setModalError(cause instanceof Error ? cause.message : "Claim edit failed."); }
    finally { setBusy(false); setBusyClaimId(""); }
  }

  async function approveSelected() {
    if (!eligibleSelected.length) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      const updated = await bulkApproveClaims(transition.id, eligibleSelected);
      const map = new Map(updated.map((claim) => [claim.id, claim]));
      setClaims((current) => current.map((claim) => map.get(claim.id) ?? claim));
      setSelectedIds([]); setSuccess(`${updated.length} eligible claims approved in one version.`);
      await refreshVersions();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Bulk approval failed."); }
    finally { setBusy(false); }
  }

  async function publish() {
    setBusy(true); setError(""); setModalError("");
    try {
      const result = await publishTransition(transition.id, noteValue);
      await refreshVersions();
      router.push(`/admin/transitions/${result.id}/approved`);
      router.refresh();
    } catch (cause) { setModalError(cause instanceof Error ? cause.message : "Publishing failed."); }
    finally { setBusy(false); }
  }

  function handleCardAction(claim: Claim, action: "approve" | "reject" | "request-clarification") {
    if (action === "request-clarification") { setModal({ kind: "ask", claim }); setModalError(""); setNoteValue(""); return; }
    void applyReviewAction(claim, action);
  }

  return <div className="review-page">
    <div className="review-page-wrap"><div className="breadcrumb"><a href="/admin">Workspace</a><span>/</span><span>{transition.projectCode}</span><span>/</span><span>Review</span></div>
      <div className="review-page-titlebar"><div><a className="review-back-link" href="/admin"><ArrowLeft size={14} />All transitions</a><div className="review-title-row"><div><div className="eyebrow"><span className="eyebrow-line" />HUMAN REVIEW · {transition.projectCode}</div><h1>{transition.project}</h1><p className="review-subtitle">Review each proposed claim against its source records before the handover is shared.</p></div><div className="review-version-button-group"><button className="versions-open-button" type="button" onClick={() => setDrawerOpen(true)}><History size={14} />Version history<span>{versions.length}</span></button><a className="review-version-link" href={`/admin/transitions/${transition.id}/versions`} aria-label="Open version history page"><ArrowUpRight size={14} /></a></div></div></div></div>
      <div className="review-participants"><div className="review-participant"><span className="person-avatar avatar-indigo">{transition.departing.initials}</span><span><small>HANDING OVER</small><strong>{transition.departing.name}</strong></span></div><ArrowRight size={15} className="review-transfer-arrow" /><div className="review-participant"><span className="person-avatar avatar-mint">{transition.incoming.initials}</span><span><small>HANDOVER FOR</small><strong>{transition.incoming.name} · {transition.incomingRole}</strong></span></div><div className="review-data-badge"><LockKeyhole size={12} /> Access tagged per claim</div></div>
      <div className="review-proposal-banner"><span className="proposal-banner-icon">✦</span><span><strong>AI findings are proposals.</strong> Every claim below must be checked by a person. Only reviewed, approved claims can appear in the published handover.</span><button type="button" className="proposal-banner-link" onClick={() => setDrawerOpen(true)}>Review versions <ArrowRight size={13} /></button></div>
      <div className="review-toolbar"><div className="review-count-label"><SlidersHorizontal size={15} /><strong>{filteredClaims.length}</strong><span>of {claims.length} claims</span><span className="toolbar-dot">·</span><span>Sorted by risk</span></div><div className="review-toolbar-actions"><button type="button" className="bulk-approve-button" disabled={busy || eligibleSelected.length === 0} onClick={approveSelected}><CheckCheck size={14} />Bulk approve{eligibleSelected.length ? ` (${eligibleSelected.length})` : ""}</button></div></div>
      <div className="review-filter-row"><label className="review-search"><Search size={15} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search claims or evidence…" aria-label="Search claims or evidence" /></label><label><span className="sr-only">Filter by trust label</span><select value={trustFilter} onChange={(event) => setTrustFilter(event.target.value)}><option>All trust labels</option>{trustOptions.map((trust) => <option key={trust}>{trust}</option>)}</select></label><label><span className="sr-only">Filter by claim type</span><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option>All claim types</option>{typeOptions.map((type) => <option key={type}>{type}</option>)}</select></label><label><span className="sr-only">Filter by origin</span><select value={originFilter} onChange={(event) => setOriginFilter(event.target.value)}><option>All origins</option>{originOptions.map((origin) => <option key={origin}>{origin}</option>)}</select></label><button type="button" className="clear-filters-button" onClick={() => { setTrustFilter("All trust labels"); setTypeFilter("All claim types"); setOriginFilter("All origins"); setQuery(""); }}>Clear</button></div>
      {success && <div className="review-feedback feedback-success" role="status"><ShieldCheck size={14} />{success}<button type="button" aria-label="Dismiss message" onClick={() => setSuccess("")}><X size={13} /></button></div>}{error && <div className="review-feedback feedback-error" role="alert"><ShieldAlert size={14} />{error}<button type="button" aria-label="Dismiss message" onClick={() => setError("")}><X size={13} /></button></div>}
      <div className="review-legend"><span><span className="legend-sort-mark">1</span>Risk first</span><span><span className="legend-proposal-mark">✦</span>AI proposal</span><span><span className="legend-source-mark"><LockKeyhole size={10} /></span>Access level shown per claim</span><span className="bulk-rule-note">Bulk approval is limited to Verified and Partially supported claims.</span></div>
      <div className="review-claims-list">{filteredClaims.map((claim) => { const disabledSelection = claim.trust === "Conflicting" ? "Conflicting claims can’t be bulk approved. Resolve one individually." : claim.trust === "Missing evidence" ? "Missing-evidence claims can’t be bulk approved. Resolve one individually." : claim.status === "Approved" ? "This claim is already approved." : claim.status === "Rejected" ? "Rejected claims cannot be bulk approved." : claim.trust !== "Verified" && claim.trust !== "Partially supported" ? "Only Verified and Partially supported claims can be bulk approved." : undefined; return <ReviewClaimCard key={claim.id} claim={claim} evidence={evidence} selected={selectedIds.includes(claim.id)} disabledSelection={disabledSelection} busy={busy} onSelect={(id, checked) => setSelectedIds((current) => checked ? [...new Set([...current, id])] : current.filter((item) => item !== id))} onAction={handleCardAction} onEdit={(item) => { setModal({ kind: "edit", claim: item }); setModalError(""); }} />; })}{filteredClaims.length === 0 && <div className="review-empty-state"><Search size={19} /><strong>No claims match these filters</strong><span>Try clearing one of the filters or using a broader search.</span></div>}</div>
      <div className="review-source-footer"><span><Download size={13} />{transition.projectCode} source records</span><span>Imported content is rendered as plain text · secrets are redacted</span></div>
    </div>
      <div className="review-sticky-footer"><div className="review-progress"><div className="review-progress-copy"><span><strong>{reviewedCount}</strong> of {claims.length} reviewed</span><span className={blockingClaims.length ? "blocking-text" : "resolved-text"}>{blockingClaims.length ? `${blockingClaims.length} blocking claim${blockingClaims.length === 1 ? "" : "s"}` : alreadyPublished ? "Already published" : "No publish blockers"}</span></div><div className="review-progress-track"><span style={{ width: `${claims.length ? Math.round(reviewedCount / claims.length * 100) : 0}%` }} /></div></div><div className="publish-gate-copy">{blockingClaims.length ? <><ShieldAlert size={14} />Resolve conflicts and missing evidence first</> : <><ShieldCheck size={14} />Only approved claims are shared</>}</div><button className="publish-button" type="button" disabled={busy || alreadyPublished || blockingClaims.length > 0} title={alreadyPublished ? "This handover has already been published." : blockingClaims.length ? "Resolve all Conflicting and Missing evidence claims before publishing." : "Publish the reviewed handover."} onClick={() => { setModal({ kind: "publish" }); setModalError(""); setNoteValue(transition.reviewerRemarks ?? ""); }}>Publish handover <ArrowRight size={15} /></button></div>
    {drawerOpen && <VersionsDrawer versions={versions} onClose={() => setDrawerOpen(false)} />}
    {editModal && <EditModal claim={editModal.claim} evidence={evidence} onClose={() => setModal(null)} onSave={(edit) => void saveClaimEdit(editModal.claim, edit)} busy={busyClaimId === editModal.claim.id} error={modalError} />}
    {askModal && <NoteModal title="Ask for more context" description="This request will be added to the claim history and prepared for the departing person." value={noteValue} setValue={setNoteValue} onClose={() => setModal(null)} onSubmit={() => { if (!noteValue.trim()) { setModalError("Enter a short, specific question."); return; } void applyReviewAction(askModal.claim, "request-clarification", noteValue); }} busy={busyClaimId === askModal.claim.id} error={modalError} submitLabel="Save question" />}
    {publishModal && <NoteModal title="Publish handover?" description={`This creates a versioned handover visible to ${transition.incoming.name} in the ${transition.incomingRole} role view. Only approved claims will be included.`} value={noteValue} setValue={setNoteValue} onClose={() => setModal(null)} onSubmit={() => void publish()} busy={busy} error={modalError} submitLabel="Publish version" />}
  </div>;
}
