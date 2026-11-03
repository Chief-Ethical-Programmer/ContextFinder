import "server-only";
import { backendGet } from "@/lib/api/server-backend";
import { mapHandoverView } from "@/lib/api/handover-mapper";
import type { AccessLevel, AuditEvent, Claim, Evidence, ExitQuestion, OnboardingView, Project, RecipientRole, SourceConnection, SourceKind, Transition, TransitionVersion, TrustLabel } from "@/lib/types";

const sourceKinds: Record<string, SourceKind> = {
  github: "GitHub", slack_export: "Slack", slack_leads_export: "Slack", drive_export: "Drive", meeting_notes: "Meeting notes",
  GitHub: "GitHub", Slack: "Slack", Drive: "Drive", "Meeting notes": "Meeting notes",
};
const accessLevels: Record<string, AccessLevel> = { public_team: "Public to team", technical_only: "Technical only", leads_only: "Leads only" };
const trustLabels: Record<string, TrustLabel> = { verified: "Verified", partially_supported: "Partially supported", conflicting: "Conflicting", unverified: "Unverified", missing_evidence: "Missing evidence", system_rejected: "Unverified" };
const claimTypes: Record<string, Claim["type"]> = { decision: "Decision", owner: "Owner", task: "Task", dependency: "Dependency", risk: "Risk", open_question: "Open question", next_action: "Next action" };
const claimOrigins: Record<string, Claim["origin"]> = { system: "System extracted", leaver: "Stated by leaver", reviewer: "Entered by reviewer" };

function mapTransition(item: Record<string, unknown>): Transition {
  const departing = item.departing as Record<string, unknown>;
  const incoming = item.incoming as Record<string, unknown>;
  const reviewer = item.reviewer as Record<string, unknown> | null;
  return {
    id: String(item.id), project: String(item.project), projectCode: String(item.projectCode), team: String(item.team ?? ""),
    status: item.status === "Approved" ? "Approved" : item.status === "Awaiting project approval" ? "Awaiting project approval" : item.status === "Waiting for leaver answers" ? "Waiting for leaver answers" : item.status === "Awaiting reviewer assignment" ? "Awaiting reviewer assignment" : item.status === "Review" || item.status === "Awaiting admin approval" ? "Review" : "In progress",
    departing: { id: String(departing.id ?? ""), name: String(departing.name ?? "Not assigned"), email: String(departing.email ?? ""), title: String(departing.title ?? ""), initials: String(departing.initials ?? "?") },
    incoming: { id: String(incoming.id ?? ""), name: String(incoming.name ?? "Not assigned"), email: String(incoming.email ?? ""), title: String(incoming.title ?? ""), initials: String(incoming.initials ?? "?") },
    incomingRole: String(item.incomingRole ?? ""), accessDaysRemaining: Number(item.accessDaysRemaining ?? 0), accessExpiresAt: item.accessExpiresAt ? String(item.accessExpiresAt) : undefined, accessReady: Boolean(item.accessReady), teamAssigned: Boolean(item.teamAssigned),
    claimCount: Number(item.claimCount ?? 0), reviewedCount: Number(item.reviewedCount ?? 0), blockingCount: Number(item.blockingCount ?? 0), version: Number(item.version ?? 1),
    publishedAt: item.publishedAt ? String(item.publishedAt) : undefined,
    reviewer: reviewer ? { id: String(reviewer.id), name: String(reviewer.name), email: String(reviewer.email) } : undefined,
    reviewerCandidates: ((item.reviewerCandidates ?? []) as Record<string, unknown>[]).map((candidate) => ({
      id: String(candidate.id), name: String(candidate.name), email: String(candidate.email), role: String(candidate.role),
      teams: Array.isArray(candidate.teams) ? candidate.teams.map(String) : [],
    })),
  };
}

function mapClaim(item: Record<string, unknown>): Claim {
  const reviewState = String(item.review_state ?? "proposed");
  return {
    id: String(item.id), transitionId: String(item.transition_id ?? item.transitionId), statement: String(item.statement ?? ""),
    type: claimTypes[String(item.type)] ?? "Open question", trust: trustLabels[String(item.trust_label)] ?? "Unverified",
    access: accessLevels[String(item.access_level)] ?? "Technical only", origin: claimOrigins[String(item.origin)] ?? "System extracted",
    evidenceIds: (Array.isArray(item.evidenceIds) ? item.evidenceIds : []).map(String), history: [],
    reviewerNote: String(item.trust_reason ?? "") || undefined, proposal: !["approved", "edited", "rejected"].includes(reviewState),
    responseNote: String(((item.flags ?? {}) as Record<string, unknown>).departingResponse ?? "") || undefined,
    status: reviewState === "approved" || reviewState === "edited" ? "Approved" : reviewState === "rejected" ? "Rejected" : "Pending review",
  };
}

export async function getTransitions(): Promise<Transition[]> {
  const dashboard = await backendGet("/admin/dashboard") as { transitions: Record<string, unknown>[] };
  return dashboard.transitions.map(mapTransition);
}

export async function getSupervisedProjects(): Promise<Project[]> {
  const dashboard = await backendGet("/admin/dashboard") as { projects: Record<string, unknown>[] };
  return dashboard.projects.map((item) => ({
    id: String(item.id), code: String(item.code), name: String(item.name), team: String(item.team ?? ""), supervisor: String(item.supervisor ?? ""),
    members: ((item.members ?? []) as Record<string, unknown>[]).map((member) => ({
      id: String(member.id), name: String(member.name), title: String(member.title ?? "Project member"), initials: String(member.initials ?? "?"),
      involvement: member.involvement === "Departing" ? "Departing" : member.involvement === "Incoming" ? "Incoming" : member.involvement === "Reviewer" ? "Reviewer" : "Current member",
    })),
  }));
}

export async function getIncomingCandidates(): Promise<Array<{ id: string; name: string; email: string; team: string }>> {
  const candidates = await backendGet("/admin/incoming-candidates") as Record<string, unknown>[];
  return candidates.map((candidate) => ({ id: String(candidate.id), name: String(candidate.name), email: String(candidate.email), team: String(candidate.team ?? "") }));
}

export async function getTransition(transitionId: string): Promise<Transition | undefined> {
  try {
    return mapTransition(await backendGet(`/transitions/${encodeURIComponent(transitionId)}/summary`) as Record<string, unknown>);
  } catch (error) {
    if (error instanceof Error && (error.message.includes("404") || error.message.includes("Transition not found"))) return undefined;
    throw error;
  }
}

export async function getClaims(transitionId: string): Promise<Claim[]> {
  const result = await backendGet(`/transitions/${encodeURIComponent(transitionId)}/claims`) as { items: Record<string, unknown>[] };
  return result.items.map(mapClaim);
}

export async function getEvidence(transitionId: string): Promise<Evidence[]> {
  const result = await backendGet(`/transitions/${encodeURIComponent(transitionId)}/review-evidence`) as Record<string, unknown>[];
  return result.map((item) => ({ id: String(item.id), source: sourceKinds[String(item.source)] ?? "Drive", author: String(item.author ?? ""), happenedAt: item.happenedAt ? new Date(String(item.happenedAt)).toLocaleString() : "Date unavailable", excerpt: String(item.excerpt ?? ""), href: item.href ? String(item.href) : undefined }));
}

export async function getExitEvidence(transitionId: string): Promise<Evidence[]> {
  const result = await backendGet(`/exit/${encodeURIComponent(transitionId)}/evidence`) as Record<string, unknown>[];
  return result.map((item) => ({ id: String(item.id), source: sourceKinds[String(item.source)] ?? "Drive", author: String(item.author ?? ""), happenedAt: item.happenedAt ? new Date(String(item.happenedAt)).toLocaleString() : "Date unavailable", excerpt: String(item.excerpt ?? ""), href: item.href ? String(item.href) : undefined }));
}

export async function getOnboardingView(transitionId: string, role?: RecipientRole): Promise<OnboardingView> {
  const roleKey = role === "Project lead" ? "project_lead" : role === "New volunteer" ? "new_volunteer" : role === "Technical successor" ? "technical_successor" : "";
  const result = await backendGet(`/handover/${encodeURIComponent(transitionId)}${roleKey ? `?role=${roleKey}` : ""}`) as Record<string, unknown>;
  return mapHandoverView(result);
}

export async function getSources(transitionId: string): Promise<SourceConnection[]> {
  const result = await backendGet(`/transitions/${encodeURIComponent(transitionId)}/sources`) as { items: Record<string, unknown>[] };
  return result.items.map((item) => ({
    id: String(item.id), transitionId, kind: sourceKinds[String(item.kind)] ?? "Drive",
    name: String(item.name ?? sourceKinds[String(item.kind)] ?? item.kind), access: accessLevels[String(item.access)] ?? "Technical only",
    files: [], linkedClaimCount: Number(item.linkedClaimCount ?? 0), connected: ["ready", "completed", "configured"].includes(String(item.status)),
  }));
}

export async function getAuditEvents(transitionId: string): Promise<AuditEvent[]> {
  const items = await backendGet(`/transitions/${encodeURIComponent(transitionId)}/audit`) as Record<string, unknown>[];
  return items.map((item) => ({ id: String(item.id), transitionId, actor: String(item.actor ?? "System"), action: String(item.action ?? ""), target: String(item.target ?? ""), at: item.at ? new Date(String(item.at)).toLocaleString() : "Time unavailable" }));
}

export async function getVersions(transitionId: string): Promise<TransitionVersion[]> {
  const items = await backendGet(`/transitions/${encodeURIComponent(transitionId)}/versions`) as Record<string, unknown>[];
  return items.map((item) => ({ transitionId, version: Number(item.version ?? 1), createdAt: String(item.published_at ?? item.publishedAt ?? ""), actor: "Reviewer", summary: `Published handover v${item.version ?? 1}`, remark: String(item.remarks ?? "") || undefined, published: true }));
}

export async function getExitQuestions(transitionId: string): Promise<ExitQuestion[]> {
  const items = await backendGet(`/exit/${encodeURIComponent(transitionId)}/questions`) as Record<string, unknown>[];
  return items.map((item) => ({
    id: String(item.id), transitionId: String(item.transition_id ?? transitionId), relatedClaimId: String(item.claim_id), prompt: String(item.prompt ?? ""),
    systemFound: String(item.system_finding ?? ""), trust: trustLabels[String(item.trust_label)] ?? "Unverified",
    evidenceIds: (Array.isArray(item.evidenceIds) ? item.evidenceIds : []).map(String), answer: item.answer ? String(item.answer) : undefined,
    answerStatus: item.answerStatus as ExitQuestion["answerStatus"], answerSubmitted: Boolean(item.answerSubmitted),
  }));
}
