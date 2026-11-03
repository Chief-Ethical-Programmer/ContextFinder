"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowUpRight, CalendarClock, CircleHelp, LockKeyhole, UsersRound, UserRoundCheck, ShieldCheck } from "lucide-react";
import type { Transition } from "@/lib/types";
import { assignTransitionIncoming, assignTransitionReviewer, revokeTransitionReviewer } from "@/lib/api/browser";

function Initials({ value, incoming = false }: { value: string; incoming?: boolean }) {
  return <span className={`person-avatar ${incoming ? "avatar-mint" : "avatar-indigo"}`}>{value}</span>;
}

function TeamTag({ team }: { team: string }) {
  return <span className={`project-team-tag${team ? "" : " project-team-tag-unassigned"}`} title={team ? `Owning team: ${team}` : "No owning team set"}>{team || "Team not set"}</span>;
}

type IncomingCandidate = { id: string; name: string; email: string; team: string };

function OnboardingCard({ transition, incomingCandidates }: { transition: Transition; incomingCandidates: IncomingCandidate[] }) {
  const isEmptyTeam = !transition.teamAssigned;
  const needsIncomingAssignment = transition.status === "Approved" && transition.incoming.name === "Not assigned";
  const eligibleIncoming = transition.team.trim()
    ? incomingCandidates.filter((candidate) => candidate.team.trim().toLowerCase() === transition.team.trim().toLowerCase())
    : incomingCandidates;
  const [incomingEmail, setIncomingEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function assignIncoming() {
    if (!incomingEmail) { setError("Choose an incoming member from the onboarding queue."); return; }
    setSaving(true); setError("");
    try { await assignTransitionIncoming(transition.id, incomingEmail); window.location.reload(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not assign this incoming member."); }
    finally { setSaving(false); }
  }
  return <article className="transition-card onboarding-transition-card">
    <div className="transition-card-top"><TeamTag team={transition.team} />{transition.incoming.name !== "Not assigned" && transition.accessExpiresAt && <span className={`timeline-chip ${transition.accessDaysRemaining <= 7 ? "timeline-soon" : ""}`} title={`Access expires ${new Date(transition.accessExpiresAt).toLocaleString()}`}><CalendarClock size={13} />{transition.accessDaysRemaining} days access</span>}</div>
    <h3>{transition.project}</h3>
    <div className="transition-person"><Initials value={transition.incoming.initials} incoming /><div><strong>{transition.incoming.name}</strong><span>{transition.incomingRole}</span></div></div>
    <div className="transition-card-bottom"><span className={`access-ready ${transition.accessReady ? "" : "access-pending"}`}><LockKeyhole size={12} />{transition.accessReady ? "Access ready" : "Access pending"}</span><span className="transition-stage">{transition.status === "Approved" ? transition.incoming.name === "Not assigned" ? "Awaiting assignment" : "Assigned" : "Preparing"}</span></div>
    {needsIncomingAssignment && <div className="team-empty-state"><div className="empty-state-icon"><UsersRound size={16} /></div><div><strong>Reviewer approved - assign an incoming teammate</strong><span>{eligibleIncoming.length ? `Choose a registered ${transition.team || "team"} member from the onboarding queue.` : transition.team ? `No new joinees have registered for ${transition.team} yet.` : "No incoming accounts are registered yet. Ask the new joinee to sign up first."}</span>{eligibleIncoming.length > 0 && <div className="reviewer-assignment-controls"><select aria-label="Choose incoming member" value={incomingEmail} onChange={(event) => setIncomingEmail(event.target.value)} disabled={saving}><option value="">Select incoming member</option>{eligibleIncoming.map((candidate) => <option key={candidate.id} value={candidate.email}>{candidate.name} | {candidate.team} | {candidate.email}</option>)}</select><button type="button" disabled={saving || !incomingEmail} onClick={() => void assignIncoming()}>{saving ? "Assigning..." : "Assign"}</button></div>}{error && <small role="alert">{error}</small>}</div></div>}
    {isEmptyTeam && !needsIncomingAssignment && <div className="team-empty-state"><div className="empty-state-icon"><UsersRound size={16} /></div><div><strong>No transition team assigned yet</strong><span>Choose the project teammates who should support this handover.</span></div><Link href={`/admin/transitions/new?existing=${transition.id}`} className="empty-state-action">Assign team <ArrowRight size={13} /></Link></div>}
    {!isEmptyTeam && !needsIncomingAssignment && <Link className="transition-card-link" href={`/onboarding/${transition.id}`}>View onboarding handover <ArrowUpRight size={14} /></Link>}
  </article>;
}

function DepartingCard({ transition, team }: { transition: Transition; team: string }) {
  const approved = transition.status === "Approved";
  const needsProjectApproval = transition.status === "Awaiting project approval";
  const waitingForLeaver = transition.status === "Waiting for leaver answers";
  const needsReviewerAssignment = transition.status === "Awaiting reviewer assignment";
  const [reviewer, setReviewer] = useState(transition.reviewer);
  const [reviewerId, setReviewerId] = useState(transition.reviewer?.id ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function updateReviewer() {
    if (!reviewerId) { setError("Select a team lead to assign."); return; }
    setSaving(true); setError("");
    try {
      const result = await assignTransitionReviewer(transition.id, reviewerId);
      setReviewer(result.reviewer);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not assign this reviewer."); }
    finally { setSaving(false); }
  }
  async function removeReviewer() {
    setSaving(true); setError("");
    try { await revokeTransitionReviewer(transition.id); setReviewer(undefined); setReviewerId(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not remove reviewer access."); }
    finally { setSaving(false); }
  }
  const reviewerCandidates = [...(transition.reviewerCandidates ?? [])].sort((left, right) => {
    const leftMatch = team && left.teams.some((item) => item.toLocaleLowerCase() === team.toLocaleLowerCase()) ? 0 : 1;
    const rightMatch = team && right.teams.some((item) => item.toLocaleLowerCase() === team.toLocaleLowerCase()) ? 0 : 1;
    return leftMatch - rightMatch || left.name.localeCompare(right.name);
  });
  const canAssignReviewer = !approved;
  return <article className="transition-card departing-transition-card">
    <div className="transition-card-top"><TeamTag team={team} /><span className={`review-status ${approved ? "review-status-approved" : "review-status-pending"}`}><span className="status-dot" />{approved ? "Reviewer approved" : needsProjectApproval ? "Project setup" : waitingForLeaver ? "Leaver answers" : needsReviewerAssignment ? "Assign reviewer" : "Review"}</span></div>
    <h3>{transition.project}</h3>
    <div className="transition-person"><Initials value={transition.departing.initials} /><div><strong>{transition.departing.name}</strong><span>{transition.departing.title}</span></div></div>
    <div className="departing-card-stats"><span><strong>{transition.claimCount}</strong> claims</span><span><strong>{transition.blockingCount}</strong> need attention</span></div>
    {approved ? <span className="transition-card-link">Final approval by {reviewer?.name ?? "the team lead reviewer"}. Assign an incoming teammate in the onboarding queue.</span> : <div className="transition-card-link" role="status">{needsProjectApproval ? "Waiting for the departing member to submit sources." : waitingForLeaver ? "Analysis is complete. Waiting for the departing member to submit question responses." : reviewer ? `Claim review assigned to ${reviewer.name}: ${transition.reviewedCount}/${transition.claimCount} reviewed` : "Assign a team lead to review this handover."}</div>}
    <div hidden={!canAssignReviewer} className="transition-reviewer-assignment"><label htmlFor={`reviewer-${transition.id}`}><ShieldCheck size={13} /> Assign the team lead</label><div className="reviewer-assignment-controls"><select id={`reviewer-${transition.id}`} value={reviewerId} onChange={(event) => setReviewerId(event.target.value)} aria-label="Select team lead" disabled={saving || reviewerCandidates.length === 0}><option value="">{reviewerCandidates.length ? "Select a team lead" : "No registered team leads"}</option>{reviewerCandidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name} · {candidate.teams.join(", ") || "Team not assigned"} · {candidate.email}</option>)}</select><button type="button" disabled={saving || !reviewerId} onClick={() => void updateReviewer()}>{saving ? "Saving…" : reviewer ? "Update" : "Assign"}</button></div>{reviewer && <><small>Assigned: {reviewer.name} ({reviewer.email})</small><button className="reviewer-unassign-button" type="button" disabled={saving} onClick={() => void removeReviewer()}>Remove reviewer access</button></>}{error && <small role="alert">{error}</small>}</div>
  </article>;
}

export function AdminDashboard({ transitions, incomingCandidates }: { transitions: Transition[]; incomingCandidates: IncomingCandidate[] }) {
  const router = useRouter();
  const [selectedTeam, setSelectedTeam] = useState("all");
  const [selectedIncomingTeam, setSelectedIncomingTeam] = useState("all");
  const [dashboardTransitions, setDashboardTransitions] = useState(transitions);
  useEffect(() => {
    setDashboardTransitions(transitions);
  }, [transitions]);
  useEffect(() => {
    const timer = window.setInterval(() => router.refresh(), 10000);
    return () => window.clearInterval(timer);
  }, [router]);
  const teamOptions = Array.from(new Set(dashboardTransitions.map((item) => item.team.trim() || "__unassigned__"))).sort((left, right) => left.localeCompare(right));
  const incomingTeamOptions = Array.from(new Set(incomingCandidates.map((candidate) => candidate.team.trim()).filter(Boolean))).sort((left, right) => left.localeCompare(right));
  const teamTransitions = selectedTeam === "all" ? dashboardTransitions : dashboardTransitions.filter((item) => (item.team.trim() || "__unassigned__") === selectedTeam);
  const allIncomingTransitions = dashboardTransitions.filter((item) => item.incoming.name !== "Not assigned" || item.status === "Approved");
  const incomingTransitions = teamTransitions.filter((item) => (item.incoming.name !== "Not assigned" || item.status === "Approved") && (selectedIncomingTeam === "all" || item.team.trim().toLowerCase() === selectedIncomingTeam.toLowerCase()));
  const departingTransitions = teamTransitions.filter((item) => item.departing.name !== "Not assigned" && item.status !== "Approved");
  const reviewCount = dashboardTransitions.filter((item) => item.status !== "Approved" && (item.reviewer || item.status === "Review")).length;
  const blockers = dashboardTransitions.reduce((sum, item) => sum + item.blockingCount, 0);
  return <div className="page-wrap admin-page">
    <div className="breadcrumb"><span>Workspace</span><span>/</span><span>Projects</span></div>
    <section className="admin-welcome"><div><div className="eyebrow"><span className="eyebrow-line" />TEAM TRANSITIONS</div><h1>Keep every handover moving.</h1><p>Track analysis, assign the team lead, and choose an incoming teammate after the reviewer approves the handover.</p></div></section>
    <section className="admin-summary-strip" aria-label="All project handovers summary"><div><span className="summary-number">{reviewCount}</span><span>Active reviewer assignments</span></div><i /><div><span className="summary-number">{allIncomingTransitions.length}</span><span>Onboarding queue</span></div><i /><div><span className="summary-number">{blockers}</span><span>Open blockers</span></div></section>
    <section className="transition-board"><div className="board-heading"><div><h2>Transition board</h2></div><div className="board-team-filters"><div className="board-team-filter"><label htmlFor="handover-team-filter">Project team</label><select id="handover-team-filter" value={selectedTeam} onChange={(event) => setSelectedTeam(event.target.value)}><option value="all">All teams</option>{teamOptions.map((team) => <option key={team} value={team}>{team === "__unassigned__" ? "Team not set" : team}</option>)}</select></div><div className="board-team-filter"><label htmlFor="joinee-team-filter">New joinee team</label><select id="joinee-team-filter" value={selectedIncomingTeam} onChange={(event) => setSelectedIncomingTeam(event.target.value)}><option value="all">All matching teams</option>{incomingTeamOptions.map((team) => <option key={team} value={team}>{team}</option>)}</select></div></div></div><div className="board-columns"><div className="board-column"><div className="column-heading"><div className="column-title-icon column-icon-mint"><UserRoundCheck size={16} /></div><div><h3>Onboarding</h3><span>Assign approved handovers to incoming teammates</span></div><span className="column-count">{incomingTransitions.length}</span></div><div className="column-cards">{incomingTransitions.map((transition) => <OnboardingCard key={transition.id} transition={transition} incomingCandidates={incomingCandidates} />)}{incomingTransitions.length === 0 && <div className="list-empty"><CircleHelp size={17} /><strong>No matching handovers</strong><span>Reviewer-approved projects for this team will appear here. Each card shows the owning team and only matching new joinees can be assigned.</span></div>}</div></div><div className="board-column"><div className="column-heading"><div className="column-title-icon column-icon-lilac"><ArrowUpRight size={16} /></div><div><h3>Departing</h3><span>Assign registered team leads to active handovers</span></div><span className="column-count">{departingTransitions.length}</span></div><div className="column-cards">{departingTransitions.map((transition) => <DepartingCard key={transition.id} transition={transition} team={transition.team} />)}{departingTransitions.length === 0 && <div className="list-empty"><CircleHelp size={17} /><strong>No pending departing projects</strong><span>New handover requests will appear here.</span></div>}</div></div></div></section>
    <div className="admin-audit-link"><span>Need to review recorded actions?</span><Link href="/admin/audit">Open the audit log <ArrowRight size={13} /></Link></div>
  </div>;
}
