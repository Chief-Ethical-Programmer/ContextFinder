"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, CalendarClock, CircleHelp, LockKeyhole, Plus, UsersRound, UserRoundCheck, Users } from "lucide-react";
import type { Project, Transition } from "@/lib/types";
import { getPersistedTransitions } from "@/lib/api/browser";

function Initials({ value, incoming = false }: { value: string; incoming?: boolean }) {
  return <span className={`person-avatar ${incoming ? "avatar-mint" : "avatar-indigo"}`}>{value}</span>;
}

function OnboardingCard({ transition }: { transition: Transition }) {
  const isEmptyTeam = !transition.teamAssigned;
  return <article className="transition-card onboarding-transition-card">
    <div className="transition-card-top"><span className="project-code">{transition.projectCode}</span><span className={`timeline-chip ${transition.daysRemaining <= 7 ? "timeline-soon" : ""}`}><CalendarClock size={13} />{transition.daysRemaining} days</span></div>
    <h3>{transition.project}</h3>
    <div className="transition-person"><Initials value={transition.incoming.initials} incoming /><div><strong>{transition.incoming.name}</strong><span>{transition.incomingRole}</span></div></div>
    <div className="transition-card-bottom"><span className={`access-ready ${transition.accessReady ? "" : "access-pending"}`}><LockKeyhole size={12} />{transition.accessReady ? "Access ready" : "Access pending"}</span><span className="transition-stage">{transition.status === "Approved" ? "Published" : "Preparing"}</span></div>
    {isEmptyTeam && <div className="team-empty-state"><div className="empty-state-icon"><UsersRound size={16} /></div><div><strong>No transition team assigned yet</strong><span>Choose the project teammates who should support this handover.</span></div><Link href={`/admin/transitions/new?existing=${transition.id}`} className="empty-state-action">Assign team <ArrowRight size={13} /></Link></div>}
    {!isEmptyTeam && <Link className="transition-card-link" href={`/onboarding/${transition.id}`}>View onboarding handover <ArrowUpRight size={14} /></Link>}
  </article>;
}

function DepartingCard({ transition }: { transition: Transition }) {
  const approved = transition.status === "Approved";
  return <Link className="transition-card departing-transition-card" href={approved ? `/admin/transitions/${transition.id}/approved` : `/admin/transitions/${transition.id}/review`}>
    <div className="transition-card-top"><span className="project-code">{transition.projectCode}</span><span className={`review-status ${approved ? "review-status-approved" : "review-status-pending"}`}><span className="status-dot" />{approved ? "Approved" : "Review"}</span></div>
    <h3>{transition.project}</h3>
    <div className="transition-person"><Initials value={transition.departing.initials} /><div><strong>{transition.departing.name}</strong><span>{transition.departing.title}</span></div></div>
    <div className="departing-card-stats"><span><strong>{transition.claimCount}</strong> claims</span><span><strong>{transition.blockingCount}</strong> need attention</span><span><CalendarClock size={12} />{transition.daysRemaining} days</span></div>
    <div className="transition-card-link">{approved ? "Open approved handover" : "Review and edit claims"}<ArrowRight size={14} /></div>
  </Link>;
}

export function AdminDashboard({ projects, transitions }: { projects: Project[]; transitions: Transition[] }) {
  const preferenceKey = "contextfinder:last-supervised-project:v1";
  const [selectedProjectId, setSelectedProjectId] = useState(projects[0]?.id ?? "");
  const [dashboardTransitions, setDashboardTransitions] = useState(transitions);
  useEffect(() => {
    const persisted = getPersistedTransitions();
    if (!persisted.length) return;
    setDashboardTransitions((current) => {
      const handoverKey = (transition: Transition) => `${transition.projectCode}:${transition.incoming.name.trim().toLowerCase()}`;
      const quality = (transition: Transition) => (transition.departing.name !== "Not assigned" ? 100 : 0) + (transition.status === "Approved" ? 20 : transition.status === "Review" ? 10 : 0) + transition.version / 100;
      const merged = new Map<string, Transition>();
      for (const transition of [...persisted].reverse().concat(current)) {
        const key = handoverKey(transition);
        const previous = merged.get(key);
        if (!previous || quality(transition) >= quality(previous)) merged.set(key, transition);
      }
      return Array.from(merged.values());
    });
  }, [transitions]);
  useEffect(() => {
    try {
      const savedProjectId = window.localStorage.getItem(preferenceKey);
      if (savedProjectId && projects.some((project) => project.id === savedProjectId)) {
        setSelectedProjectId(savedProjectId);
      }
    } catch {
      // Keep the first project selected when browser storage is unavailable.
    }
  }, [projects]);
  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? projects[0];
  const projectTransitions = useMemo(() => selectedProject ? dashboardTransitions.filter((item) => item.projectCode === selectedProject.code) : [], [selectedProject, dashboardTransitions]);
  const incomingTransitions = projectTransitions.filter((item) => item.incoming.name !== "Not assigned");
  const departingTransitions = projectTransitions.filter((item) => item.departing.name !== "Not assigned");
  const reviewCount = projectTransitions.filter((item) => item.status === "Review").length;
  const blockers = projectTransitions.reduce((sum, item) => sum + item.blockingCount, 0);
  const projectMembers = useMemo(() => {
    if (!selectedProject) return [];
    const members = new Map(selectedProject.members.map((member) => [member.name.trim().toLowerCase(), { ...member }]));
    for (const transition of projectTransitions) {
      const departingKey = transition.departing.name.trim().toLowerCase();
      if (departingKey && departingKey !== "not assigned") {
        const previous = members.get(departingKey);
        members.set(departingKey, { id: previous?.id ?? transition.departing.id, name: transition.departing.name, title: transition.departing.title || previous?.title || "Project member", initials: transition.departing.initials || previous?.initials || "?", involvement: "Departing" });
      }
      const incomingKey = transition.incoming.name.trim().toLowerCase();
      if (incomingKey && incomingKey !== "not assigned" && incomingKey !== departingKey) {
        const previous = members.get(incomingKey);
        members.set(incomingKey, { id: previous?.id ?? transition.incoming.id, name: transition.incoming.name, title: transition.incoming.title || previous?.title || transition.incomingRole, initials: transition.incoming.initials || previous?.initials || "?", involvement: "Incoming" });
      }
    }
    return Array.from(members.values());
  }, [selectedProject, projectTransitions]);

  return <div className="page-wrap admin-page">
    <div className="breadcrumb"><span>Workspace</span><span>/</span><span>Projects</span></div>
    <section className="admin-welcome"><div><div className="eyebrow"><span className="eyebrow-line" />TEAM TRANSITIONS</div><h1>Keep every handover moving.</h1><p>Choose a supervised project to view its team and handovers.</p></div><Link href="/admin/transitions/new" className="button button-primary"><Plus size={16} /><span>Start new transition</span></Link></section>
    <section className="project-filter-bar" aria-label="Project selection"><div className="project-filter-copy"><span className="eyebrow">PROJECT SCOPE</span><strong>Supervised projects</strong></div><label htmlFor="admin-project-select" className="sr-only">Select a project you supervise</label><select id="admin-project-select" value={selectedProject?.id ?? ""} onChange={(event) => { const projectId = event.target.value; setSelectedProjectId(projectId); try { window.localStorage.setItem(preferenceKey, projectId); } catch { /* The selected project still works for this session. */ } }} disabled={projects.length === 0}><option value="" disabled>Select a project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.code} · {project.name}</option>)}</select></section>
    <section className="admin-summary-strip" aria-label={`${selectedProject?.name ?? "Selected project"} summary`}><div><span className="summary-number">{reviewCount}</span><span>Needs review</span></div><i /><div><span className="summary-number">{incomingTransitions.length}</span><span>People onboarding</span></div><i /><div><span className="summary-number">{blockers}</span><span>Open blockers</span></div><span className="summary-protection"><LockKeyhole size={13} /> Nothing is shared before publish</span></section>
    {selectedProject && <section className="project-roster" aria-labelledby="project-roster-title"><div className="project-roster-heading"><div className="project-roster-icon"><Users size={17} /></div><div><span className="eyebrow">{selectedProject.code} · {selectedProject.name}</span><h2 id="project-roster-title">Project team members</h2><p>Supervisor: {selectedProject.supervisor} · Includes current and handover participants</p></div><span className="project-member-count">{projectMembers.length} {projectMembers.length === 1 ? "member" : "members"}</span></div>{projectMembers.length ? <ul className="project-member-list">{projectMembers.map((member) => <li className="project-member" key={member.id}><Initials value={member.initials} incoming={member.involvement === "Incoming"} /><span className="project-member-copy"><strong>{member.name}</strong><small>{member.title}</small></span><span className={`member-involvement ${member.involvement === "Departing" ? "member-departing" : member.involvement === "Incoming" ? "member-incoming" : ""}`}>{member.involvement}</span></li>)}</ul> : <div className="project-roster-empty"><CircleHelp size={16} /><span>No current members have been added to this project yet.</span></div>}</section>}
    <section className="transition-board"><div className="board-heading"><div><span className="eyebrow">ACTIVE HANDOVERS · {selectedProject?.code ?? ""}</span><h2>Transition board</h2></div><span className="board-updated">Updated just now <span className="status-dot" /></span></div><div className="board-columns"><div className="board-column"><div className="column-heading"><div className="column-title-icon column-icon-mint"><UserRoundCheck size={16} /></div><div><h3>Onboarding</h3><span>Incoming people & their access</span></div><span className="column-count">{incomingTransitions.length.toString().padStart(2, "0")}</span></div><div className="column-cards">{incomingTransitions.map((transition) => <OnboardingCard key={transition.id} transition={transition} />)}{incomingTransitions.length === 0 && <div className="list-empty"><CircleHelp size={17} /><strong>No one onboarding on this project</strong><span>Start a transition to prepare the next teammate.</span><Link href="/admin/transitions/new">Start a transition</Link></div>}</div></div><div className="board-column"><div className="column-heading"><div className="column-title-icon column-icon-lilac"><ArrowUpRight size={16} /></div><div><h3>Departing</h3><span>Knowledge captured for review</span></div><span className="column-count">{departingTransitions.length.toString().padStart(2, "0")}</span></div><div className="column-cards">{departingTransitions.map((transition) => <DepartingCard key={transition.id} transition={transition} />)}{departingTransitions.length === 0 && <div className="list-empty"><CircleHelp size={17} /><strong>No departing handovers on this project</strong><span>Start one when a teammate is leaving a project.</span><Link href="/admin/transitions/new">Start a transition</Link></div>}</div></div></div></section>
    <div className="admin-note"><LockKeyhole size={14} /><span>Connecting a source does not make it visible to every recipient. Access stays attached to each source and claim.</span></div>
    <div className="admin-audit-link"><span>Need to review recorded actions?</span><Link href="/admin/audit">Open the audit log <ArrowRight size={13} /></Link></div>
  </div>;
}
