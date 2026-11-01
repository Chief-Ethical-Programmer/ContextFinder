import type { AccessLevel, Claim, ClaimEditInput, ExitAnswerStatus, ExitQuestion, OnboardingView, RecipientRole, SourceKind, Transition, TransitionVersion } from "@/lib/types";

export interface BrowserCreateTransitionInput {
  project: string;
  projectCode: string;
  departingName: string;
  departingTitle: string;
  incomingName: string;
  incomingRole: string;
  daysRemaining: number;
  sources: Array<{ kind: SourceKind; access: AccessLevel }>;
  existingTransitionId?: string;
}

const TRANSITIONS_STORAGE_KEY = "contextfinder:transitions:v1";

function isTransition(value: unknown): value is Transition {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<Transition>;
  return typeof item.id === "string" && typeof item.projectCode === "string" && typeof item.project === "string" && typeof item.departing?.name === "string" && typeof item.incoming?.name === "string";
}

export function getPersistedTransitions(): Transition[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(TRANSITIONS_STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isTransition) : [];
  } catch {
    return [];
  }
}

function persistTransition(transition: Transition) {
  if (typeof window === "undefined") return;
  const incomingKey = transition.incoming.name.trim().toLowerCase();
  const saved = getPersistedTransitions().filter((item) => item.id !== transition.id && !(item.projectCode === transition.projectCode && item.incoming.name.trim().toLowerCase() === incomingKey));
  saved.unshift(transition);
  try {
    window.localStorage.setItem(TRANSITIONS_STORAGE_KEY, JSON.stringify(saved));
  } catch {
    // Keep the current flow usable if storage is disabled or full.
  }
}

/** POST /api/auth/login */
export async function loginAccount(email: string, password: string): Promise<{ accessToken: string; user: { id: string; name: string; email: string; role: "admin" | "departing" | "incoming" } }> {
  const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Email or password is incorrect.");
  return result;
}

/** POST /api/transitions */
export async function createTransition(input: BrowserCreateTransitionInput): Promise<Transition> {
  const response = await fetch("/api/transitions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Could not start the transition.");
  const transition = result as Transition;
  persistTransition(transition);
  return transition;
}

/** POST /api/transitions/:transitionId/ingestion/complete */
export async function completeIngestion(transitionId: string): Promise<Transition> {
  const response = await fetch(`/api/transitions/${encodeURIComponent(transitionId)}/ingestion/complete`, { method: "POST" });
  const result = await response.json();
  if (!response.ok) {
    const saved = getPersistedTransitions().find((item) => item.id === transitionId);
    if (!saved) throw new Error(result.error ?? "Ingestion could not be completed.");
    const completed = { ...saved, status: "Review" as const };
    persistTransition(completed);
    return completed;
  }
  const transition = result as Transition;
  persistTransition(transition);
  return transition;
}

async function readResponse<T>(response: Response): Promise<T> {
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "The requested action could not be completed.");
  return result as T;
}

/** POST /api/transitions/:transitionId/claims/:claimId/review */
export async function reviewClaim(transitionId: string, claimId: string, action: "approve" | "reject" | "request-clarification", note?: string): Promise<Claim> {
  const response = await fetch(`/api/transitions/${encodeURIComponent(transitionId)}/claims/${encodeURIComponent(claimId)}/review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, note }) });
  return readResponse<Claim>(response);
}

/** PATCH /api/transitions/:transitionId/claims/:claimId */
export async function editClaim(transitionId: string, claimId: string, edit: ClaimEditInput): Promise<Claim> {
  const response = await fetch(`/api/transitions/${encodeURIComponent(transitionId)}/claims/${encodeURIComponent(claimId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(edit) });
  return readResponse<Claim>(response);
}

/** POST /api/transitions/:transitionId/claims/bulk-approve */
export async function bulkApproveClaims(transitionId: string, claimIds: string[]): Promise<Claim[]> {
  const response = await fetch(`/api/transitions/${encodeURIComponent(transitionId)}/claims/bulk-approve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ claimIds }) });
  return readResponse<Claim[]>(response);
}

/** POST /api/transitions/:transitionId/publish */
export async function publishTransition(transitionId: string, reviewerRemarks: string): Promise<Transition> {
  const response = await fetch(`/api/transitions/${encodeURIComponent(transitionId)}/publish`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reviewerRemarks }) });
  return readResponse<Transition>(response);
}

/** GET /api/transitions/:transitionId/versions */
export async function getTransitionVersions(transitionId: string): Promise<TransitionVersion[]> {
  const response = await fetch(`/api/transitions/${encodeURIComponent(transitionId)}/versions`);
  return readResponse<TransitionVersion[]>(response);
}

/** GET /api/transitions/:transitionId/exit-questions */
export async function getExitQuestions(transitionId: string): Promise<ExitQuestion[]> {
  const response = await fetch(`/api/transitions/${encodeURIComponent(transitionId)}/exit-questions`);
  return readResponse<ExitQuestion[]>(response);
}

/** POST /api/transitions/:transitionId/exit-answers */
export async function saveExitAnswer(transitionId: string, questionId: string, answer: string, status: "draft" | "dont-know" | "skipped"): Promise<ExitQuestion> {
  const response = await fetch(`/api/transitions/${encodeURIComponent(transitionId)}/exit-answers`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ questionId, answer, status }) });
  return readResponse<ExitQuestion>(response);
}

/** POST /api/transitions/:transitionId/exit-answers/submit */
export async function submitExitAnswers(transitionId: string, responses: Array<{ questionId: string; answer: string; status: ExitAnswerStatus }>): Promise<{ saved: unknown[]; claims: Claim[] }> {
  const response = await fetch(`/api/transitions/${encodeURIComponent(transitionId)}/exit-answers/submit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ responses }) });
  return readResponse(response);
}

/** POST /api/transitions/:transitionId/acknowledgements */
export async function acknowledgeTransition(transitionId: string, personName: string): Promise<Transition> {
  const response = await fetch(`/api/transitions/${encodeURIComponent(transitionId)}/acknowledgements`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ personName }) });
  return readResponse<Transition>(response);
}

/** POST /api/transitions/:transitionId/access-requests */
export async function requestHandoverAccess(transitionId: string, role: string, hiddenItemCount: number): Promise<void> {
  const response = await fetch(`/api/transitions/${encodeURIComponent(transitionId)}/access-requests`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role, hiddenItemCount }) });
  await readResponse<unknown>(response);
}

/** GET /api/transitions/:transitionId/onboarding?role=:role */
export async function getOnboardingView(transitionId: string, role: RecipientRole): Promise<OnboardingView> {
  const response = await fetch(`/api/transitions/${encodeURIComponent(transitionId)}/onboarding?role=${encodeURIComponent(role)}`);
  return readResponse<OnboardingView>(response);
}
