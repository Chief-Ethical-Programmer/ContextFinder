"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight, BellRing, BookOpenCheck, CalendarDays, Check, CheckCircle2, CircleHelp, Clock3, FileQuestion, GitBranch, LockKeyhole, MessageSquareText, ShieldAlert, ShieldCheck, UsersRound, X } from "lucide-react";
import { AccessBadge, OriginBadge, TrustBadge, TypeBadge } from "@/components/shared/badges";
import { acknowledgeTransition, getOnboardingView, requestHandoverAccess } from "@/lib/api/browser";
import type { Claim, Evidence, OnboardingView, RecipientRole, SourceConnection, TrustLabel } from "@/lib/types";

type WorkTab = "Overview" | "Owners" | "Risks" | "Open questions";
const sourceIcon = { GitHub: GitBranch, Slack: MessageSquareText, Drive: BookOpenCheck, "Meeting notes": FileQuestion };
const roleOptions: RecipientRole[] = ["Technical successor", "Project lead", "New volunteer"];

function EvidencePanel({ claim, evidence, onClose }: { claim: Claim; evidence: Evidence[]; onClose: () => void }) {
  const byId = new Map(evidence.map((item) => [item.id, item]));
  return <div className="evidence-panel-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><aside className="evidence-panel" role="dialog" aria-modal="true" aria-labelledby="evidence-panel-title"><div className="evidence-panel-head"><div><span className="eyebrow">CLAIM EVIDENCE</span><h2 id="evidence-panel-title">Why this is in your handover</h2></div><button type="button" className="icon-close-button" aria-label="Close evidence panel" onClick={onClose}><X size={17} /></button></div><div className="evidence-panel-claim"><div className="evidence-panel-badges"><TrustBadge label={claim.trust} /><TypeBadge>{claim.type}</TypeBadge><AccessBadge level={claim.access} /></div><p>{claim.statement}</p><OriginBadge origin={claim.origin} /></div><div className="evidence-panel-section"><div className="evidence-panel-section-title">SUPPORTING RECORDS <span>{claim.evidenceIds.length}</span></div>{claim.evidenceIds.map((id) => { const item = byId.get(id); if (!item) return <div className="evidence-panel-missing" key={id}><CircleHelp size={15} /><span>Evidence record unavailable · {id}</span></div>; const Icon = sourceIcon[item.source]; return <article className="evidence-panel-record" key={item.id}><div className="evidence-panel-record-head"><span><Icon size={14} />{item.source}</span><strong>{item.author}</strong><time>{item.happenedAt}</time></div><p>{item.excerpt}</p><small>Synthetic demo excerpt · imported content shown as plain text</small></article>; })}{claim.evidenceIds.length === 0 && <div className="evidence-panel-missing"><FileQuestion size={15} /><span>No source evidence is attached to this claim.</span></div>}</div><div className="evidence-panel-foot"><ShieldCheck size={14} />This view contains only human-approved claims for your role.</div></aside></div>;
}

function StatementButton({ claim, onOpen }: { claim: Claim; onOpen: (claim: Claim) => void }) {
  return <button type="button" className="handover-statement" onClick={() => onOpen(claim)}>{claim.statement}<ArrowUpRight size={13} aria-hidden="true" /></button>;
}

function ClaimMiniCard({ claim, onOpen }: { claim: Claim; onOpen: (claim: Claim) => void }) {
  return <article className="handover-claim-mini"><div className="handover-mini-top"><TrustBadge label={claim.trust} small /><TypeBadge>{claim.type}</TypeBadge></div><StatementButton claim={claim} onOpen={onOpen} /><div className="handover-mini-bottom"><OriginBadge origin={claim.origin} /><AccessBadge level={claim.access} /></div></article>;
}

function HiddenItemsNotice({ count, onRequest, requesting, requested }: { count: number; onRequest: () => void; requesting: boolean; requested: boolean }) {
  if (count < 1) return null;
  return <div className="hidden-items-notice"><span className="hidden-count-mark"><LockKeyhole size={14} /></span><strong>{count} {count === 1 ? "item" : "items"} hidden</strong><button type="button" onClick={onRequest} disabled={requesting || requested}>{requested ? <><Check size={13} />Request recorded</> : requesting ? "Sending…" : <>Request access <ArrowRight size={13} /></>}</button></div>;
}

export function OnboardingDashboard({ initialView }: { initialView: OnboardingView }) {
  const [view, setView] = useState<OnboardingView | null>(initialView);
  const [role, setRole] = useState<RecipientRole>(initialView.role);
  const [activeTab, setActiveTab] = useState<WorkTab>("Overview");
  const [selectedClaim, setSelectedClaim] = useState<Claim | null>(null);
  const [loadingRole, setLoadingRole] = useState(false);
  const [busy, setBusy] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [requested, setRequested] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function changeRole(nextRole: RecipientRole) {
    const previousView = view;
    setRole(nextRole); setView(null); setLoadingRole(true); setError(""); setNotice(""); setSelectedClaim(null);
    try { setView(await getOnboardingView(initialView.transition.id, nextRole)); setRequested(false); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not switch role view."); setView(previousView); setRole(previousView?.role ?? initialView.role); }
    finally { setLoadingRole(false); }
  }

  async function requestAccess() {
    if (!view || view.hiddenItemCount < 1) return;
    setRequesting(true); setError("");
    try { await requestHandoverAccess(view.transition.id, view.role, view.hiddenItemCount); setRequested(true); setNotice("Your request for access has been recorded for the project lead."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not record the access request."); }
    finally { setRequesting(false); }
  }

  async function acknowledge() {
    if (!view) return;
    setBusy(true); setError("");
    try { const updated = await acknowledgeTransition(view.transition.id, view.transition.incoming.name); setView({ ...view, transition: updated }); setNotice(`You acknowledged version ${updated.acknowledgedVersion ?? updated.version}. The receipt is now recorded.`); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not record acknowledgement."); }
    finally { setBusy(false); }
  }

  if (loadingRole || !view) return <div className="page-wrap onboarding-loading"><div className="loading-panel">Updating the role-filtered handover…</div></div>;

  const { transition, claims, evidence, sources: visibleSources, hiddenItemCount } = view;
  const owners = claims.filter((claim) => claim.type === "Owner");
  const risks = claims.filter((claim) => claim.type === "Risk");
  const openQuestions = claims.filter((claim) => claim.type === "Open question");
  const dependencies = claims.filter((claim) => claim.type === "Dependency");
  const missingItems = claims.filter((claim) => claim.trust === "Missing evidence");
  const unfinishedItems = claims.filter((claim) => claim.trust === "Unverified" || claim.trust === "Partially supported");
  const timeline = [...claims].sort((a, b) => Date.parse(a.history.at(-1)?.at ?? "") - Date.parse(b.history.at(-1)?.at ?? ""));
  const tabClaims = activeTab === "Owners" ? owners : activeTab === "Risks" ? risks : activeTab === "Open questions" ? openQuestions : claims.filter((claim) => ["Task", "Decision", "Next action", "Dependency"].includes(claim.type));
  const summary = role === "Project lead" ? "CloudCart has a reviewed project history with owners, dependencies, and operational decisions linked to their source records. Use the evidence panels to check context before planning changes." : role === "Technical successor" ? "CloudCart’s published handover focuses on platform operations, deployment and monitoring. The open work is visible with its trust label and supporting records." : "You’re joining a live project. Start with the shared team goals, the approved next steps, and the people listed in this handover.";
  const summaryName = role === "New volunteer" ? "Project overview" : "Summary";
  const getLinkedCount = (source: SourceConnection) => {
    const sourceEvidenceIds = new Set(evidence.filter((item) => item.source === source.kind).map((item) => item.id));
    return claims.filter((claim) => claim.evidenceIds.some((id) => sourceEvidenceIds.has(id))).length;
  };

  return <div className="page-wrap onboarding-page"><div className="breadcrumb"><span>Onboarding</span><span>/</span><span>{transition.project}</span></div>
    <div className="onboarding-header"><div><div className="eyebrow"><span className="eyebrow-line" />PUBLISHED HANDOVER · VERSION {transition.version}</div><h1>Welcome to {transition.project}.</h1><p>A role-filtered project guide, with the source behind every approved claim.</p></div><div className="onboarding-role-picker"><label htmlFor="recipient-role">YOUR DEMO ROLE</label><select id="recipient-role" value={role} onChange={(event) => void changeRole(event.target.value as RecipientRole)}>{roleOptions.map((option) => <option key={option}>{option}</option>)}</select></div></div>
    {error && <div className="onboarding-feedback onboarding-error" role="alert">{error}<button type="button" onClick={() => setError("")} aria-label="Dismiss error"><X size={13} /></button></div>}{notice && <div className="onboarding-feedback onboarding-success" role="status"><CheckCircle2 size={14} />{notice}<button type="button" onClick={() => setNotice("")} aria-label="Dismiss message"><X size={13} /></button></div>}
    <div className="onboarding-layout"><div className="onboarding-left-column"><section className="onboarding-panel onboarding-summary-panel"><div className="onboarding-panel-heading"><span className="onboarding-heading-icon icon-summary"><ShieldCheck size={15} /></span><div><h2>{summaryName}</h2><span>Published project overview</span></div><span className="summary-approved-tag"><CheckCircle2 size={12} />Reviewed</span></div><p className="onboarding-summary-text">{summary}</p><div className="summary-facts"><span><strong>{claims.length}</strong> approved claims in this view</span><span><strong>{transition.daysRemaining}</strong> days in transition window</span></div></section>
        <section className="onboarding-panel dependency-panel"><div className="onboarding-panel-heading"><span className="onboarding-heading-icon icon-dependency"><ArrowDownRight size={15} /></span><div><h2>Dependencies</h2><span>What work relies on another team or system</span></div></div>{dependencies.length ? <div className="dependency-list">{dependencies.map((claim) => <div className="dependency-row" key={claim.id}><span className="dependency-node"><GitBranch size={13} /></span><StatementButton claim={claim} onOpen={setSelectedClaim} /><TrustBadge label={claim.trust} small /></div>)}</div> : <div className="onboarding-empty-line"><CircleHelp size={14} />No approved dependency claims are included in this role view.</div>}</section></div>
      <section className="onboarding-panel onboarding-sources-panel"><div className="onboarding-panel-heading"><span className="onboarding-heading-icon icon-sources"><BookOpenCheck size={15} /></span><div><h2>Sources</h2><span>Connected records behind this handover</span></div><span className="source-panel-count">{visibleSources.length.toString().padStart(2, "0")}</span></div><div className="onboarding-source-list">{visibleSources.map((source) => { const Icon = sourceIcon[source.kind]; return <div className="onboarding-source-row" key={source.id}><span className="onboarding-source-icon"><Icon size={14} /></span><span className="onboarding-source-copy"><strong>{source.name}</strong><small>{getLinkedCount(source)} linked claims</small></span><AccessBadge level={source.access} /></div>; })}{visibleSources.length === 0 && <div className="onboarding-empty-line"><FileQuestion size={14} />No sources are available for this role view.</div>}</div><p className="source-access-footnote"><LockKeyhole size={12} />Source access does not grant access to every claim.</p></section>
      <div className="onboarding-right-column"><section className="onboarding-panel onboarding-remarks-panel"><div className="onboarding-panel-heading"><span className="onboarding-heading-icon icon-remarks"><MessageSquareText size={15} /></span><div><h2>Remarks</h2><span>Notes saved with the published version</span></div></div>{view.reviewerRemarks ? <p className="reviewer-remarks-text">{view.reviewerRemarks}</p> : role === "New volunteer" && transition.reviewerRemarks ? <HiddenItemsNotice count={1} onRequest={requestAccess} requesting={requesting} requested={requested} /> : <div className="onboarding-no-remarks">No reviewer remarks are included in this role view.</div>}
          <div className="remarks-callouts"><div className="remarks-callout-heading"><span>Missing</span><strong>{missingItems.length}</strong></div>{missingItems.length ? missingItems.slice(0, 2).map((claim) => <StatementButton key={claim.id} claim={claim} onOpen={setSelectedClaim} />) : <span className="remarks-empty">No approved claims marked Missing evidence.</span>}</div><div className="remarks-callouts unfinished-callouts"><div className="remarks-callout-heading"><span>Unfinished / uncertain</span><strong>{unfinishedItems.length}</strong></div>{unfinishedItems.length ? unfinishedItems.slice(0, 2).map((claim) => <StatementButton key={claim.id} claim={claim} onOpen={setSelectedClaim} />) : <span className="remarks-empty">No approved claims need follow-up.</span>}</div></section>
        <section className="onboarding-panel role-summary-panel"><div className="onboarding-panel-heading"><span className="onboarding-heading-icon icon-role"><UsersRound size={15} /></span><div><h2>Your role</h2><span>Current handover view</span></div></div><strong>{role}</strong><p>{role === "Project lead" ? "Lead view · includes all approved access levels." : role === "Technical successor" ? "Technical view · shows material cleared for your role." : "Volunteer view · shows material cleared for your role."}</p></section>
      </div>
    </div>
    <section className="onboarding-work-section"><div className="onboarding-work-heading"><div><span className="eyebrow">PICK UP THE WORK</span><h2>Owners, risks and next steps</h2><p>Select any claim to open its evidence, trust label and origin.</p></div><Link href={`/onboarding/${transition.id}/plan?role=${encodeURIComponent(role)}`} className="continuation-plan-link"><CalendarDays size={15} /><span>30-60-90 day plan</span><ArrowUpRight size={13} /></Link></div><div className="handover-tabs" role="tablist" aria-label="Filter approved work by type">{(["Overview", "Owners", "Risks", "Open questions"] as WorkTab[]).map((tab) => <button type="button" role="tab" aria-selected={activeTab === tab} className={activeTab === tab ? "active" : ""} key={tab} onClick={() => setActiveTab(tab)}>{tab}<span>{tab === "Owners" ? owners.length : tab === "Risks" ? risks.length : tab === "Open questions" ? openQuestions.length : tabClaims.length}</span></button>)}</div><div className="handover-claim-grid">{tabClaims.length ? tabClaims.map((claim) => <ClaimMiniCard key={claim.id} claim={claim} onOpen={setSelectedClaim} />) : <div className="onboarding-empty-work"><CircleHelp size={17} /><strong>No approved claims in this section</strong><span>Review and publish additional claims to add them to this handover.</span></div>}</div></section>
    <section className="onboarding-timeline-panel"><div className="onboarding-work-heading timeline-heading"><div><span className="eyebrow">PROJECT HISTORY</span><h2>Timeline</h2><p>Approved decisions, changes and unresolved questions in order.</p></div><span className="timeline-version-chip"><Clock3 size={13} />Version {transition.version}</span></div><div className="handover-timeline">{timeline.length ? timeline.map((claim, index) => { const history = claim.history.at(-1); return <article className="handover-timeline-entry" key={claim.id}><span className={`timeline-node ${index === 0 ? "timeline-node-current" : ""}`}><span /></span><div className="timeline-entry-content"><div className="timeline-entry-meta"><span>{history?.at ?? "Included in published handover"}</span><span>{history?.action ?? "Approved"}</span><span>v{history?.version ?? transition.version}</span></div><StatementButton claim={claim} onOpen={setSelectedClaim} /><div className="timeline-entry-badges"><TrustBadge label={claim.trust} small /><OriginBadge origin={claim.origin} /></div></div></article>; }) : <div className="onboarding-empty-line"><Clock3 size={14} />No approved timeline entries are included in this role view.</div>}</div></section>
    <HiddenItemsNotice count={hiddenItemCount} onRequest={requestAccess} requesting={requesting} requested={requested} />
    <section className="acknowledgement-panel">{transition.acknowledgedAt ? <div className="acknowledgement-confirmation"><span className="acknowledged-check"><Check size={16} /></span><div><strong>Receipt acknowledged</strong><span>{transition.acknowledgedBy} acknowledged version {transition.acknowledgedVersion ?? transition.version} on {transition.acknowledgedAt}.</span></div><span className="acknowledged-version">v{transition.acknowledgedVersion ?? transition.version}</span></div> : <><div className="acknowledgement-copy"><span className="acknowledgement-icon"><BellRing size={16} /></span><span><strong>Confirm you’ve received this handover</strong><small>This records your name, the published version, and the time you acknowledged it.</small></span></div><button type="button" className="acknowledge-button" disabled={busy} onClick={() => void acknowledge()}>{busy ? "Recording…" : "Acknowledge receipt"}<Check size={14} /></button></>}</section>
    <footer className="onboarding-footer"><span><ShieldCheck size={13} />Only approved claims are shown in this handover.</span><span>Version {transition.version} · {transition.projectCode}</span></footer>
    {selectedClaim && <EvidencePanel claim={selectedClaim} evidence={evidence} onClose={() => setSelectedClaim(null)} />}
  </div>;
}
