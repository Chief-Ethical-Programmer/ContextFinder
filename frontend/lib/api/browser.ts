import type { AccessLevel, Claim, ClaimEditInput, ExitAnswerStatus, ExitQuestion, OnboardingView, RecipientRole, SourceKind, Transition, TransitionVersion } from "@/lib/types";
import { mapHandoverView } from "@/lib/api/handover-mapper";

export interface BrowserCreateTransitionInput {
  projectId: string;
  departingUserId: string;
  incomingUserId: string;
  targetRecipientRole: "project_lead" | "technical_successor" | "new_volunteer";
  sources: Array<{ kind: string; accessLevel: string; config?: Record<string, unknown> }>;
}

const backendPath = (path: string) => `/api/backend/${path.replace(/^\//, "")}`;
const trustLabels: Record<string, Claim["trust"]> = { verified: "Verified", partially_supported: "Partially supported", conflicting: "Conflicting", unverified: "Unverified", missing_evidence: "Missing evidence", system_rejected: "Unverified" };
const claimTypes: Record<string, Claim["type"]> = { decision: "Decision", owner: "Owner", task: "Task", dependency: "Dependency", risk: "Risk", open_question: "Open question", next_action: "Next action" };
const claimOrigins: Record<string, Claim["origin"]> = { system: "System extracted", leaver: "Stated by leaver", reviewer: "Entered by reviewer" };
const accessLevels: Record<string, Claim["access"]> = { public_team: "Public to team", technical_only: "Technical only", leads_only: "Leads only" };

function mapClaim(value: Record<string, unknown>): Claim {
  const state = String(value.review_state ?? "proposed");
  return {
    id: String(value.id),
    transitionId: String(value.transition_id ?? value.transitionId),
    statement: String(value.statement ?? ""),
    type: claimTypes[String(value.type)] ?? "Open question",
    trust: trustLabels[String(value.trust_label ?? value.trust)] ?? "Unverified",
    access: accessLevels[String(value.access_level ?? value.access)] ?? "Technical only",
    origin: claimOrigins[String(value.origin)] ?? "System extracted",
    evidenceIds: (Array.isArray(value.evidenceIds) ? value.evidenceIds : []).map(String),
    history: [],
    reviewerNote: String(value.trust_reason ?? "") || undefined,
    responseNote: String(((value.flags ?? {}) as Record<string, unknown>).departingResponse ?? "") || undefined,
    followUps: Array.isArray(value.followUps) ? value.followUps.map((item) => {
      const followUp = item as Record<string, unknown>;
      return {
        source: followUp.source === "Reviewer" ? "Reviewer" as const : "Gemini" as const,
        question: String(followUp.question ?? ""),
        answer: String(followUp.answer ?? "") || undefined,
        status: ["Answered", "Awaiting answer", "Draft saved", "Skipped"].includes(String(followUp.status)) ? String(followUp.status) as "Answered" | "Awaiting answer" | "Draft saved" | "Skipped" : "Awaiting answer" as const,
      };
    }) : [],
    proposal: !["approved", "edited", "rejected"].includes(state),
    status: state === "approved" || state === "edited" ? "Approved" : state === "rejected" ? "Rejected" : "Pending review",
  };
}

/** POST /api/auth/login */
export async function loginAccount(email: string, password: string): Promise<{ accessToken: string; user: { id: string; name: string; email: string; role: "admin" | "reviewer" | "departing" | "incoming" } }> {
  const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Email or password is incorrect.");
  return result;
}

/** POST /api/transitions */
export async function createTransition(input: BrowserCreateTransitionInput): Promise<Transition> {
  return readResponse<Transition>(await fetch(backendPath("transitions"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }));
}

export async function assignTransitionReviewer(transitionId: string, reviewerId: string): Promise<{ reviewer: { id: string; name: string; email: string } }> {
  return readResponse(await fetch(backendPath(`admin/transitions/${encodeURIComponent(transitionId)}/reviewer`), {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reviewerId }),
  }));
}

export async function revokeTransitionReviewer(transitionId: string): Promise<void> {
  await readResponse(await fetch(backendPath(`admin/transitions/${encodeURIComponent(transitionId)}/reviewer/revoke`), { method: "POST" }));
}

export async function assignTransitionIncoming(transitionId: string, incomingEmail: string): Promise<{ incoming: { id: string; name: string; email: string } }> {
  return readResponse(await fetch(backendPath(`admin/transitions/${encodeURIComponent(transitionId)}/incoming`), {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ incomingEmail }),
  }));
}

export async function uploadSource(transitionId: string, file: File, kind: string, accessLevel: string): Promise<{ recordsImported: number }> {
  const form = new FormData();
  // Directory-selected documents carry a relative path in webkitRelativePath;
  // send only the base filename because the API stores files individually.
  form.set("file", file, file.name);
  form.set("kind", kind);
  form.set("access_level", accessLevel);
  return readResponse(await fetch(backendPath(`transitions/${encodeURIComponent(transitionId)}/sources/upload`), { method: "POST", body: form }));
}

export async function configureSource(transitionId: string, kind: string, accessLevel: string, config: Record<string, unknown> = {}): Promise<void> {
  await readResponse(await fetch(backendPath(`transitions/${encodeURIComponent(transitionId)}/sources/configure`), {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, accessLevel, config }),
  }));
}

export async function completeIngestion(transitionId: string, freeTierDataAttestation: boolean): Promise<{ status: string; extraction: { claims: number } }> {
  return readResponse(await fetch(backendPath(`transitions/${encodeURIComponent(transitionId)}/start`), {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ freeTierDataAttestation }),
  }));
}

export async function retryApprovedAnalysis(transitionId: string): Promise<{ status: string; queued: boolean }> {
  return readResponse(await fetch(backendPath(`transitions/${encodeURIComponent(transitionId)}/retry-analysis`), {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ freeTierDataAttestation: true }),
  }));
}

async function readResponse<T>(response: Response): Promise<T> {
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error ?? result.message ?? result.detail ?? "The requested action could not be completed.");
  return result as T;
}

/** POST /api/transitions/:transitionId/claims/:claimId/review */
export async function reviewClaim(transitionId: string, claimId: string, action: "approve" | "reject" | "request-clarification", note?: string): Promise<Claim> {
  const suffix = action === "approve" ? "approve" : action === "reject" ? "reject" : "ask-more";
  const result = await fetch(backendPath(`claims/${encodeURIComponent(claimId)}/${suffix}`), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note }) });
  if (result.status === 403) throw new Error("This account does not have team lead reviewer access. Sign in as the reviewer assigned to this handover.");
  const response = await readResponse<Record<string, unknown>>(result);
  return mapClaim(response);
}

export async function getTransitionClaims(transitionId: string): Promise<Claim[]> {
  const result = await readResponse<{ items: Record<string, unknown>[] }>(await fetch(backendPath(`transitions/${encodeURIComponent(transitionId)}/claims`), { cache: "no-store" }));
  return result.items.map(mapClaim);
}

/** PATCH /api/transitions/:transitionId/claims/:claimId */
export async function editClaim(transitionId: string, claimId: string, edit: ClaimEditInput): Promise<Claim> {
  const toKey = (value: string) => value.toLowerCase().replaceAll(" ", "_");
  const response = await readResponse<Record<string, unknown>>(await fetch(backendPath(`claims/${encodeURIComponent(claimId)}/edit`), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ statement: edit.statement, trustLabel: toKey(edit.trust), accessLevel: toKey(edit.access), origin: edit.origin === "System extracted" ? "system" : edit.origin === "Stated by leaver" ? "leaver" : "reviewer", evidenceIds: edit.evidenceIds, note: edit.reviewerNote }) }));
  return mapClaim(response);
}

/** POST /api/transitions/:transitionId/claims/bulk-approve */
export async function bulkApproveClaims(transitionId: string, claimIds: string[]): Promise<Claim[]> {
  const response = await readResponse<{ approved: Record<string, unknown>[] }>(await fetch(backendPath(`transitions/${encodeURIComponent(transitionId)}/claims/bulk-approve`), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ claimIds }) }));
  return response.approved.map(mapClaim);
}

/** POST /api/transitions/:transitionId/publish */
export async function publishTransition(transitionId: string, reviewerRemarks: string): Promise<{ id: string; status: string; version: number }> {
  const response = await fetch(backendPath(`transitions/${encodeURIComponent(transitionId)}/publish`), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ remarks: reviewerRemarks, targetRecipientRole: "technical_successor" }) });
  return readResponse<{ id: string; status: string; version: number }>(response);
}

/** GET /api/transitions/:transitionId/versions */
export async function getTransitionVersions(transitionId: string): Promise<TransitionVersion[]> {
  const response = await readResponse<Record<string, unknown>[]>(await fetch(backendPath(`transitions/${encodeURIComponent(transitionId)}/versions`)));
  return response.map((item) => ({ transitionId, version: Number(item.version ?? 1), createdAt: String(item.published_at ?? item.publishedAt ?? ""), actor: "Reviewer", summary: `Published handover v${item.version ?? 1}`, remark: String(item.remarks ?? "") || undefined, published: true }));
}

/** GET /api/transitions/:transitionId/exit-questions */
export async function getExitQuestions(transitionId: string): Promise<ExitQuestion[]> {
  return readExitQuestions(transitionId);
}

/** POST /api/transitions/:transitionId/exit-answers */
export async function saveExitAnswer(transitionId: string, questionId: string, answer: string, status: "draft" | "dont-know" | "skipped"): Promise<ExitQuestion> {
  const kind = status === "dont-know" ? "dont_know" : status;
  await readResponse(await fetch(backendPath(`exit/questions/${encodeURIComponent(questionId)}/answer`), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: answer, kind }) }));
  const refreshed = await readExitQuestions(transitionId);
  const question = refreshed.find((item) => item.id === questionId);
  if (!question) throw new Error("Exit question not found after saving.");
  return question;
}

/** POST /api/transitions/:transitionId/exit-answers/submit */
export async function submitExitAnswers(transitionId: string, responses: Array<{ questionId: string; answer: string; status: ExitAnswerStatus }>): Promise<{ saved: unknown[]; claims: Claim[] }> {
  const saved: unknown[] = [];
  for (const response of responses) {
    const kind = response.status === "dont-know" ? "dont_know" : response.status === "skipped" ? "skipped" : response.status === "draft" || !response.answer.trim() ? "skipped" : "answer";
    saved.push(await readResponse(await fetch(backendPath(`exit/questions/${encodeURIComponent(response.questionId)}/answer`), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: response.answer, kind }) })));
  }
  return { saved, claims: [] };
}

async function readExitQuestions(transitionId: string): Promise<ExitQuestion[]> {
  const items = await readResponse<Record<string, unknown>[]>(await fetch(backendPath(`exit/${encodeURIComponent(transitionId)}/questions`)));
  const trust: Record<string, ExitQuestion["trust"]> = { verified: "Verified", partially_supported: "Partially supported", conflicting: "Conflicting", unverified: "Unverified", missing_evidence: "Missing evidence" };
  return items.map((item) => ({ id: String(item.id), transitionId: String(item.transition_id ?? transitionId), relatedClaimId: String(item.claim_id), prompt: String(item.prompt ?? ""), systemFound: String(item.system_finding ?? ""), trust: trust[String(item.trust_label)] ?? "Unverified", evidenceIds: (item.evidenceIds as string[] ?? []).map(String), answer: item.answer ? String(item.answer) : undefined, answerStatus: item.answerStatus as ExitQuestion["answerStatus"], answerSubmitted: Boolean(item.answerSubmitted) }));
}

/** POST /api/transitions/:transitionId/acknowledgements */
export async function acknowledgeTransition(transitionId: string, personName: string): Promise<Transition> {
  await readResponse(await fetch(backendPath(`handover/${encodeURIComponent(transitionId)}/acknowledge`), { method: "POST" }));
  const refreshed = await readResponse<Record<string, unknown>>(await fetch(backendPath(`handover/${encodeURIComponent(transitionId)}`)));
  return mapHandoverView(refreshed).transition;
}

/** POST /api/transitions/:transitionId/access-requests */
export async function requestHandoverAccess(transitionId: string, role: string, hiddenItemCount: number): Promise<void> {
  const response = await fetch(backendPath(`handover/${encodeURIComponent(transitionId)}/access-requests`), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note: `Access requested for ${role}; ${hiddenItemCount} items are currently hidden.` }) });
  await readResponse<unknown>(response);
}

/** GET /api/transitions/:transitionId/onboarding?role=:role */
export async function getOnboardingView(transitionId: string, role: RecipientRole): Promise<OnboardingView> {
  const roleKey = role === "Project lead" ? "project_lead" : role === "New volunteer" ? "new_volunteer" : "technical_successor";
  const response = await readResponse<Record<string, unknown>>(await fetch(backendPath(`handover/${encodeURIComponent(transitionId)}?role=${roleKey}`)));
  return mapHandoverView(response);
}
