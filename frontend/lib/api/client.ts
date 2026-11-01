import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { auditEvents, claims, evidence, exitAnswers, exitQuestions, projects, sources, transitions, versions } from "@/mocks/data";
import type { AuditEvent, Claim, ClaimEditInput, Evidence, ExitAnswer, ExitAnswerStatus, ExitQuestion, OnboardingView, Project, RecipientRole, SourceConnection, Transition, TransitionVersion, TrustLabel } from "@/lib/types";

const DEMO_ACTOR = "J. Rivera (demo reviewer)";
const STATE_FILE = join(process.cwd(), ".contextfinder", "demo-state.json");
let stateLoadQueue: Promise<void> = Promise.resolve();
let stateWriteQueue: Promise<void> = Promise.resolve();

type PersistedMockState = {
  schemaVersion: 1;
  transitions: Transition[];
  claims: Claim[];
  evidence: Evidence[];
  exitAnswers: ExitAnswer[];
  exitQuestions: ExitQuestion[];
  sources: SourceConnection[];
  versions: TransitionVersion[];
  auditEvents: AuditEvent[];
};

function replaceArray<T>(target: T[], values: T[]) {
  target.splice(0, target.length, ...values);
}

function currentState(): PersistedMockState {
  return { schemaVersion: 1, transitions, claims, evidence, exitAnswers, exitQuestions, sources, versions, auditEvents };
}

async function persistMockState() {
  const write = stateWriteQueue.then(async () => {
    await mkdir(join(process.cwd(), ".contextfinder"), { recursive: true });
    await writeFile(STATE_FILE, JSON.stringify(currentState(), null, 2), "utf8");
  });
  stateWriteQueue = write.catch((error) => {
    console.warn("[ContextFinder demo store] Could not persist mock state:", error);
  });
  await stateWriteQueue;
}

async function loadMockState() {
  const load = stateLoadQueue.then(async () => {
    try {
      const parsed = JSON.parse(await readFile(STATE_FILE, "utf8")) as Partial<PersistedMockState>;
      if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.transitions) || !Array.isArray(parsed.claims)) return;
      replaceArray(transitions, parsed.transitions);
      replaceArray(claims, parsed.claims);
      if (Array.isArray(parsed.evidence)) replaceArray(evidence, parsed.evidence);
      if (Array.isArray(parsed.exitAnswers)) replaceArray(exitAnswers, parsed.exitAnswers);
      if (Array.isArray(parsed.exitQuestions)) replaceArray(exitQuestions, parsed.exitQuestions);
      if (Array.isArray(parsed.sources)) replaceArray(sources, parsed.sources);
      if (Array.isArray(parsed.versions)) replaceArray(versions, parsed.versions);
      if (Array.isArray(parsed.auditEvents)) replaceArray(auditEvents, parsed.auditEvents);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") await persistMockState();
      else console.warn("[ContextFinder demo store] Using bundled seed data:", error);
    }
  });
  stateLoadQueue = load.catch((error) => {
    console.warn("[ContextFinder demo store] Could not load saved mock state:", error);
  });
  await stateLoadQueue;
}

const wait = async (ms = 260) => {
  await new Promise((resolve) => setTimeout(resolve, ms));
  await loadMockState();
};

export interface CreateTransitionInput {
  project: string;
  projectCode: string;
  departingName: string;
  departingTitle: string;
  incomingName: string;
  incomingRole: string;
  daysRemaining: number;
  sources: Array<{ kind: SourceConnection["kind"]; access: SourceConnection["access"] }>;
  existingTransitionId?: string;
}

function logAudit(transitionId: string, action: string, target: string): AuditEvent {
  const event = { id: `au-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`, transitionId, actor: DEMO_ACTOR, action, target, at: new Date().toLocaleString() };
  auditEvents.unshift(event);
  console.info("[ContextFinder mock audit]", event);
  return event;
}

function recordVersion(transitionId: string, summary: string, remark?: string, published = false): TransitionVersion {
  const transition = transitions.find((item) => item.id === transitionId);
  if (!transition) throw new Error("Transition not found");
  transition.version += 1;
  const entry: TransitionVersion = { transitionId, version: transition.version, createdAt: new Date().toLocaleString(), actor: DEMO_ACTOR, summary, remark, published };
  versions.unshift(entry);
  return entry;
}

function updateReviewCounts(transitionId: string) {
  const transition = transitions.find((item) => item.id === transitionId);
  if (!transition) return;
  const transitionClaims = claims.filter((item) => item.transitionId === transitionId);
  transition.claimCount = transitionClaims.length;
  transition.reviewedCount = transitionClaims.filter((item) => item.status !== "Pending review").length;
  transition.blockingCount = transitionClaims.filter((item) => (item.trust === "Conflicting" || item.trust === "Missing evidence") && item.status !== "Rejected").length;
}

/** GET /api/transitions */
export async function getTransitions(): Promise<Transition[]> {
  await wait();
  return structuredClone(transitions);
}

/** GET /api/projects?scope=supervised — mock projects and current roster for the admin selector. */
export async function getSupervisedProjects(): Promise<Project[]> {
  await wait();
  return structuredClone(projects);
}

/** GET /api/transitions/:transitionId */
export async function getTransition(transitionId: string): Promise<Transition | undefined> {
  await wait();
  const found = transitions.find((transition) => transition.id === transitionId);
  return found ? structuredClone(found) : undefined;
}

/** GET /api/transitions/:transitionId/claims */
export async function getClaims(transitionId: string): Promise<Claim[]> {
  await wait();
  return structuredClone(claims.filter((claim) => claim.transitionId === transitionId));
}

/** GET /api/transitions/:transitionId/evidence */
export async function getEvidence(transitionId: string): Promise<Evidence[]> {
  await wait();
  const ids = new Set(claims.filter((claim) => claim.transitionId === transitionId).flatMap((claim) => claim.evidenceIds));
  return structuredClone(evidence.filter((item) => ids.has(item.id)));
}

/** GET /api/transitions/:transitionId/onboarding?role=:role */
export async function getOnboardingView(transitionId: string, role: RecipientRole): Promise<OnboardingView> {
  await wait();
  const transition = transitions.find((item) => item.id === transitionId);
  if (!transition) throw new Error("Transition not found.");
  if (transition.status !== "Approved") throw new Error("The handover has not been published yet.");
  const publishedClaims = claims.filter((claim) => claim.transitionId === transitionId && claim.status === "Approved");
  const visibleClaims = publishedClaims.filter((claim) => role === "Project lead" || (role === "Technical successor" ? claim.access !== "Leads only" : claim.access === "Public to team" && claim.type !== "Risk"));
  const transitionSources = sources.filter((source) => source.transitionId === transitionId);
  const visibleSources = transitionSources.filter((source) => role === "Project lead" || (role === "Technical successor" ? source.access !== "Leads only" : source.access === "Public to team"));
  const visibleEvidenceIds = new Set(visibleClaims.flatMap((claim) => claim.evidenceIds));
  const visibleEvidence = evidence.filter((item) => visibleEvidenceIds.has(item.id));
  const remarksHidden = role === "New volunteer" && Boolean(transition.reviewerRemarks);
  const safeTransition = { ...transition, reviewerRemarks: remarksHidden ? undefined : transition.reviewerRemarks };
  return structuredClone({ transition: safeTransition, role, claims: visibleClaims, evidence: visibleEvidence, sources: visibleSources, hiddenItemCount: (publishedClaims.length - visibleClaims.length) + (transitionSources.length - visibleSources.length) + (remarksHidden ? 1 : 0), reviewerRemarks: remarksHidden ? undefined : transition.reviewerRemarks });
}

/** GET /api/transitions/:transitionId/sources */
export async function getSources(transitionId: string): Promise<SourceConnection[]> {
  await wait();
  return structuredClone(sources.filter((source) => source.transitionId === transitionId));
}

/** GET /api/transitions/:transitionId/audit */
export async function getAuditEvents(transitionId: string): Promise<AuditEvent[]> {
  await wait();
  return structuredClone(auditEvents.filter((event) => event.transitionId === transitionId));
}

/** GET /api/transitions/:transitionId/versions */
export async function getVersions(transitionId: string): Promise<TransitionVersion[]> {
  await wait();
  return structuredClone(versions.filter((version) => version.transitionId === transitionId).sort((a, b) => b.version - a.version));
}

/** GET /api/transitions/:transitionId/exit-questions */
export async function getExitQuestions(transitionId: string): Promise<ExitQuestion[]> {
  await wait();
  const generated: ExitQuestion[] = [];
  const relatedClaims = claims.filter((claim) => claim.transitionId === transitionId && ["Conflicting", "Unverified", "Missing evidence"].includes(claim.trust) && claim.status !== "Rejected");
  for (const claim of relatedClaims) {
    if (exitQuestions.some((question) => question.transitionId === transitionId && question.relatedClaimId === claim.id)) continue;
    const prompt = claim.trust === "Conflicting"
      ? "The project records disagree about this point. Which account is current, and what evidence can help the team confirm it?"
      : claim.trust === "Missing evidence"
        ? "The referenced supporting material could not be found. Where should the team look, or what steps should they follow?"
        : "The available records could not verify this statement. What context or source would help the next person understand it?";
    const question: ExitQuestion = { id: `exit-${claim.id}`, transitionId, relatedClaimId: claim.id, prompt, systemFound: claim.statement, trust: claim.trust, evidenceIds: claim.evidenceIds };
    exitQuestions.push(question);
    generated.push(question);
  }
  if (generated.length) await persistMockState();
  const saved = exitAnswers.filter((answer) => answer.transitionId === transitionId);
  return structuredClone(exitQuestions.filter((question) => question.transitionId === transitionId).map((question) => {
    const answer = saved.find((item) => item.questionId === question.id);
    return { ...question, answer: answer?.answer, answerStatus: answer?.status, answerSubmitted: Boolean(answer?.submittedAt) };
  }));
}

/** POST /api/transitions/:transitionId/exit-answers */
export async function saveExitAnswer(transitionId: string, questionId: string, answerText: string, status: "draft" | "dont-know" | "skipped"): Promise<ExitQuestion> {
  await wait();
  if (typeof answerText !== "string") throw new Error("Answer text must be a string.");
  const question = exitQuestions.find((item) => item.transitionId === transitionId && item.id === questionId);
  if (!question) throw new Error("Exit question not found.");
  const existing = exitAnswers.find((item) => item.transitionId === transitionId && item.questionId === questionId);
  if (existing?.submittedAt) throw new Error("This response has already been submitted and can no longer be changed.");
  const answer: ExitAnswer = { transitionId, questionId, answer: answerText, status, savedAt: new Date().toLocaleString(), submittedAt: existing?.submittedAt };
  if (existing) Object.assign(existing, answer); else exitAnswers.push(answer);
  logAudit(transitionId, status === "skipped" ? "Skipped exit question" : status === "dont-know" ? "Marked exit question I don't know" : "Saved exit answer draft", questionId);
  await persistMockState();
  return structuredClone({ ...question, answer: answer.answer, answerStatus: answer.status, answerSubmitted: Boolean(answer.submittedAt) });
}

/** POST /api/transitions/:transitionId/exit-answers/submit */
export async function submitExitAnswers(transitionId: string, responses: Array<{ questionId: string; answer: string; status: ExitAnswerStatus }>): Promise<{ saved: ExitAnswer[]; claims: Claim[] }> {
  await wait();
  const transition = transitions.find((item) => item.id === transitionId);
  if (!transition) throw new Error("Transition not found.");
  const submittedAt = new Date().toLocaleString();
  const createdClaims: Claim[] = [];
  for (const response of responses) {
    if (!response || typeof response.questionId !== "string" || typeof response.answer !== "string" || !["draft", "submitted", "dont-know", "skipped"].includes(response.status)) throw new Error("Each exit response must include a valid answer and status.");
    const question = exitQuestions.find((item) => item.transitionId === transitionId && item.id === response.questionId);
    if (!question) throw new Error("One of the submitted exit questions could not be found.");
    const prior = exitAnswers.find((item) => item.transitionId === transitionId && item.questionId === response.questionId);
    if (prior?.submittedAt) continue;
    const hasAnswer = response.status === "dont-know" || (response.status !== "skipped" && response.answer.trim().length > 0);
    const status: ExitAnswerStatus = response.status === "skipped" ? "skipped" : response.status === "dont-know" ? "dont-know" : hasAnswer ? "submitted" : "skipped";
    const stored: ExitAnswer = { transitionId, questionId: question.id, answer: status === "dont-know" ? "I don't know." : status === "skipped" ? "" : response.answer.trim(), status, savedAt: submittedAt, submittedAt };
    if (prior) Object.assign(prior, stored); else exitAnswers.push(stored);
    if (status === "submitted" || status === "dont-know") {
      const statement = stored.answer;
      const claimId = `cl-exit-${question.id}`;
      const existingClaim = claims.find((item) => item.id === claimId);
      if (existingClaim) {
        existingClaim.statement = statement;
        existingClaim.status = "Pending review";
        existingClaim.trust = "Unverified";
        existingClaim.origin = "Stated by leaver";
        existingClaim.evidenceIds = [];
        existingClaim.reviewerNote = `Leaver response to: ${question.prompt}`;
        existingClaim.proposal = false;
        existingClaim.history.push({ actor: transition.departing.name, action: "Edited", at: submittedAt, version: transition.version + 1, note: "Updated stated-by-leaver response." });
        createdClaims.push(existingClaim);
      } else {
        createdClaims.push({ id: claimId, transitionId, statement, type: "Open question", trust: "Unverified", access: "Technical only", origin: "Stated by leaver", evidenceIds: [], history: [{ actor: transition.departing.name, action: "Created", at: submittedAt, version: transition.version + 1, note: `Response to: ${question.prompt}` }], reviewerNote: `Leaver response to: ${question.prompt}`, proposal: false, status: "Pending review" });
      }
    }
  }
  for (const claim of createdClaims) if (!claims.some((item) => item.id === claim.id)) claims.push(claim);
  if (!createdClaims.length && responses.every((response) => exitAnswers.some((answer) => answer.transitionId === transitionId && answer.questionId === response.questionId && Boolean(answer.submittedAt)))) {
    return { saved: structuredClone(exitAnswers.filter((item) => item.transitionId === transitionId)), claims: [] };
  }
  if (createdClaims.length) recordVersion(transitionId, `${createdClaims.length} stated-by-leaver response${createdClaims.length === 1 ? "" : "s"} submitted`);
  updateReviewCounts(transitionId);
  logAudit(transitionId, "Submitted exit answers", `${createdClaims.length} stated-by-leaver claims`);
  await persistMockState();
  return { saved: structuredClone(exitAnswers.filter((item) => item.transitionId === transitionId)), claims: structuredClone(createdClaims) };
}

/** POST /api/transitions/:transitionId/claims/:claimId/review */
export async function reviewClaim(transitionId: string, claimId: string, action: "approve" | "reject" | "request-clarification", note?: string): Promise<Claim> {
  await wait();
  const claim = claims.find((item) => item.transitionId === transitionId && item.id === claimId);
  if (!claim) throw new Error("Claim not found");
  if (action === "approve" && (claim.trust === "Conflicting" || claim.trust === "Missing evidence")) throw new Error("Edit the trust label with a reviewer note, or reject this blocker before approving it.");
  if (action === "request-clarification" && !note?.trim()) throw new Error("Add a specific question for the departing person.");
  claim.status = action === "approve" ? "Approved" : action === "reject" ? "Rejected" : "Pending review";
  if (action !== "request-clarification") claim.proposal = false;
  claim.reviewerNote = note;
  const historyAction = action === "approve" ? "Approved" : action === "reject" ? "Rejected" : "Requested clarification";
  const version = recordVersion(transitionId, `${historyAction} claim: ${claim.statement}`, note);
  claim.history.push({ actor: DEMO_ACTOR, action: historyAction, at: version.createdAt, version: version.version, note });
  if (action === "request-clarification") {
    const questionId = `exit-followup-${claim.id}`;
    const existingQuestion = exitQuestions.find((question) => question.id === questionId);
    const question: ExitQuestion = { id: questionId, transitionId, relatedClaimId: claim.id, prompt: note!.trim(), systemFound: claim.statement, trust: claim.trust, evidenceIds: [...claim.evidenceIds] };
    if (existingQuestion) Object.assign(existingQuestion, question); else exitQuestions.push(question);
  }
  updateReviewCounts(transitionId);
  logAudit(transitionId, `Claim ${action}`, claimId);
  await persistMockState();
  return structuredClone(claim);
}

/** PATCH /api/transitions/:transitionId/claims/:claimId */
export async function editClaim(transitionId: string, claimId: string, edit: ClaimEditInput): Promise<Claim> {
  await wait();
  const claim = claims.find((item) => item.transitionId === transitionId && item.id === claimId);
  if (!claim) throw new Error("Claim not found");
  if (!edit.statement.trim()) throw new Error("A claim statement is required.");
  if ((edit.trust === "Verified" || edit.trust === "Partially supported") && edit.evidenceIds.length === 0) throw new Error("Add at least one evidence record before selecting this trust label.");
  if ((claim.trust === "Conflicting" || claim.trust === "Missing evidence") && claim.trust !== edit.trust && !edit.reviewerNote.trim()) throw new Error("Add a reviewer note explaining how this conflict or evidence gap was resolved.");
  const invalidEvidence = edit.evidenceIds.find((id) => !evidence.some((item) => item.id === id));
  if (invalidEvidence) throw new Error("Evidence record not found.");
  const previousStatement = claim.statement;
  Object.assign(claim, { statement: edit.statement.trim(), trust: edit.trust, access: edit.access, origin: edit.origin, evidenceIds: [...new Set(edit.evidenceIds)], reviewerNote: edit.reviewerNote.trim() || undefined, status: "Pending review" as const, proposal: true });
  const summary = previousStatement === claim.statement ? `Updated claim details: ${claim.statement}` : `Edited claim: ${claim.statement}`;
  const version = recordVersion(transitionId, summary, edit.reviewerNote.trim() || undefined);
  claim.history.push({ actor: DEMO_ACTOR, action: "Edited", at: version.createdAt, version: version.version, note: edit.reviewerNote.trim() || undefined });
  updateReviewCounts(transitionId);
  logAudit(transitionId, "Edited claim", claimId);
  await persistMockState();
  return structuredClone(claim);
}

/** POST /api/transitions/:transitionId/claims/bulk-approve */
export async function bulkApproveClaims(transitionId: string, claimIds: string[]): Promise<Claim[]> {
  await wait();
  const selected = claimIds.map((id) => claims.find((item) => item.transitionId === transitionId && item.id === id));
  if (selected.some((item) => !item)) throw new Error("One or more claims could not be found.");
  const resolved = selected as Claim[];
  if (resolved.some((claim) => claim.trust !== "Verified" && claim.trust !== "Partially supported")) throw new Error("Bulk approval is limited to Verified and Partially supported claims.");
  if (resolved.some((claim) => claim.status !== "Pending review")) throw new Error("Only claims awaiting review can be bulk approved.");
  const version = recordVersion(transitionId, `Bulk approved ${resolved.length} claims`);
  for (const claim of resolved) {
    claim.status = "Approved";
    claim.proposal = false;
    claim.history.push({ actor: DEMO_ACTOR, action: "Approved", at: version.createdAt, version: version.version, note: "Approved as part of a bulk review." });
  }
  updateReviewCounts(transitionId);
  logAudit(transitionId, "Bulk approved claims", claimIds.join(", "));
  await persistMockState();
  return structuredClone(resolved);
}

/** POST /api/transitions/:transitionId/publish */
export async function publishTransition(transitionId: string, reviewerRemarks?: string): Promise<Transition> {
  await wait();
  const transition = transitions.find((item) => item.id === transitionId);
  if (!transition) throw new Error("Transition not found");
  if (transition.status === "Approved") throw new Error("This handover has already been published.");
  const blockers = claims.filter((claim) => claim.transitionId === transitionId && (claim.trust === "Conflicting" || claim.trust === "Missing evidence") && claim.status !== "Rejected");
  if (blockers.length) throw new Error("Resolve all conflicting and missing-evidence claims before publishing.");
  const version = recordVersion(transitionId, "Published reviewed handover", reviewerRemarks?.trim() || undefined, true);
  transition.status = "Approved";
  transition.publishedAt = new Date().toLocaleString();
  transition.reviewerRemarks = reviewerRemarks?.trim() || transition.reviewerRemarks;
  logAudit(transitionId, "Published handover", `v${version.version}`);
  await persistMockState();
  return structuredClone(transition);
}

/** POST /api/transitions/:transitionId/acknowledgements */
export async function acknowledgeTransition(transitionId: string, personName: string): Promise<Transition> {
  await wait();
  const transition = transitions.find((item) => item.id === transitionId);
  if (!transition) throw new Error("Transition not found");
  if (transition.status !== "Approved") throw new Error("The handover must be published before it can be acknowledged.");
  if (transition.acknowledgedAt) return structuredClone(transition);
  transition.acknowledgedBy = personName;
  transition.acknowledgedAt = new Date().toLocaleString();
  transition.acknowledgedVersion = transition.version;
  logAudit(transitionId, "Acknowledged handover", `v${transition.version}`);
  await persistMockState();
  return structuredClone(transition);
}

/** POST /api/transitions/:transitionId/access-requests */
export async function requestHandoverAccess(transitionId: string, role: string, hiddenItemCount: number): Promise<AuditEvent> {
  await wait();
  if (!transitions.some((item) => item.id === transitionId)) throw new Error("Transition not found.");
  const event = logAudit(transitionId, "Requested access to restricted handover items", `${role} · ${hiddenItemCount} hidden items`);
  await persistMockState();
  return event;
}

/** GET /api/claims/trust-labels */
export async function getTrustLabels(): Promise<TrustLabel[]> {
  await wait(80);
  return ["Verified", "Partially supported", "Conflicting", "Unverified", "Missing evidence"];
}

/** POST /api/auth/mock-session */
export async function mockLogin(role: "admin" | "departing" | "incoming", email: string): Promise<{ role: "admin" | "departing" | "incoming"; email: string }> {
  await wait(220);
  return { role, email };
}

/** POST /api/transitions */
export async function createTransition(input: CreateTransitionInput): Promise<Transition> {
  await wait(300);
  const incomingKey = input.incomingName.trim().toLowerCase();
  const existing = (input.existingTransitionId ? transitions.find((item) => item.id === input.existingTransitionId) : undefined)
    ?? transitions.find((item) => item.projectCode === input.projectCode && item.incoming.name.trim().toLowerCase() === incomingKey && item.status !== "Approved");
  const id = existing?.id ?? `cf-${input.projectCode.toLowerCase()}-${randomUUID().slice(0, 8)}`;
  const [departingFirst = "Team", departingLast = "Member"] = input.departingName.trim().split(/\s+/, 2);
  const [incomingFirst = "New", incomingLast = "Member"] = input.incomingName.trim().split(/\s+/, 2);
  const transition: Transition = {
    ...existing,
    id,
    project: input.project,
    projectCode: input.projectCode,
    status: "In progress",
    departing: { id: `${id}-departing`, name: input.departingName, email: `${departingFirst.toLowerCase()}.${departingLast.toLowerCase()}@demo.contextfinder`, title: input.departingTitle, initials: `${departingFirst[0] ?? "T"}${departingLast[0] ?? "M"}`.toUpperCase() },
    incoming: { id: `${id}-incoming`, name: input.incomingName, email: `${incomingFirst.toLowerCase()}.${incomingLast.toLowerCase()}@demo.contextfinder`, title: input.incomingRole, initials: `${incomingFirst[0] ?? "N"}${incomingLast[0] ?? "M"}`.toUpperCase() },
    incomingRole: input.incomingRole,
    daysRemaining: input.daysRemaining,
    accessReady: input.sources.length > 0,
    teamAssigned: true,
    claimCount: 0,
    reviewedCount: 0,
    blockingCount: 0,
    version: 1,
  };
  if (existing) {
    Object.assign(existing, transition);
    if (!versions.some((version) => version.transitionId === id)) versions.unshift({ transitionId: id, version: 1, createdAt: new Date().toLocaleString(), actor: DEMO_ACTOR, summary: "Team and source access configured", published: false });
  } else {
    transitions.unshift(transition);
    versions.unshift({ transitionId: id, version: 1, createdAt: new Date().toLocaleString(), actor: DEMO_ACTOR, summary: "Transition configured; approved sources selected", published: false });
  }
  const attachedSources = input.sources.map((source, index) => ({ id: `${id}-source-${randomUUID().slice(0, 8)}-${index + 1}`, transitionId: id, kind: source.kind, name: source.kind === "Slack" ? `${input.project} · Slack export` : source.kind === "GitHub" ? `${input.project.toLowerCase().replaceAll(" ", "-")} repository` : source.kind === "Drive" ? `${input.project} · Drive export` : `${input.project} · meeting notes`, access: source.access, linkedClaimCount: 0, connected: true }));
  for (let index = sources.length - 1; index >= 0; index -= 1) if (sources[index].transitionId === id) sources.splice(index, 1);
  sources.push(...attachedSources);
  logAudit(id, existing ? "Configured transition" : "Started transition", input.project);
  await persistMockState();
  return structuredClone(transition);
}

/** POST /api/transitions/:transitionId/ingestion/complete */
export async function completeIngestion(transitionId: string): Promise<Transition> {
  await wait(180);
  const transition = transitions.find((item) => item.id === transitionId);
  if (!transition) throw new Error("Transition not found");
  if (transition.status === "Review" && claims.some((claim) => claim.transitionId === transitionId)) return structuredClone(transition);
  transition.status = "Review";
  const selectedSources = sources.filter((source) => source.transitionId === transitionId);
  if (!claims.some((claim) => claim.transitionId === transitionId)) {
    const demoEvidence = selectedSources.map((source) => {
      const item: Evidence = { id: `${source.id}-demo-record`, source: source.kind, author: "Synthetic import", happenedAt: new Date().toLocaleString(), excerpt: `Synthetic demo record: ${source.name} was selected for this handover.` };
      evidence.push(item);
      return item;
    });
    const history = [{ actor: "ContextFinder", action: "Created" as const, at: new Date().toLocaleString(), version: transition.version }];
    claims.push(
      { id: `${transitionId}-claim-sources`, transitionId, statement: "Selected source files are attached and ready for a reviewer to inspect.", type: "Task", trust: "Partially supported", access: selectedSources[0]?.access ?? "Technical only", origin: "System extracted", evidenceIds: demoEvidence.slice(0, 1).map((item) => item.id), history, proposal: true, status: "Pending review" },
      { id: `${transitionId}-claim-owner`, transitionId, statement: `Confirm who owns the next milestone for ${transition.project}.`, type: "Open question", trust: "Unverified", access: "Public to team", origin: "System extracted", evidenceIds: [], history, proposal: true, status: "Pending review" },
      { id: `${transitionId}-claim-rollback`, transitionId, statement: `No project-specific rollback procedure was found in the selected sources for ${transition.project}.`, type: "Risk", trust: "Missing evidence", access: "Technical only", origin: "System extracted", evidenceIds: [`${transitionId}-missing-rollback`], history, proposal: true, status: "Pending review" },
    );
  }
  updateReviewCounts(transitionId);
  recordVersion(transitionId, `Ingestion completed; ${claims.filter((claim) => claim.transitionId === transitionId).length} claims queued for review`);
  logAudit(transitionId, "Completed mock ingestion", "Ingest · Normalise · Extract · Verify");
  await persistMockState();
  return structuredClone(transition);
}
