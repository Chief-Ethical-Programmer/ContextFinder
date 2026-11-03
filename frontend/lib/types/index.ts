export type Role = "admin" | "reviewer" | "departing" | "incoming";
export type RecipientRole = "Technical successor" | "Project lead" | "New volunteer";

export type TrustLabel =
  | "Verified"
  | "Partially supported"
  | "Conflicting"
  | "Unverified"
  | "Missing evidence";

export type Origin = "System extracted" | "Stated by leaver" | "Entered by reviewer";

export type AccessLevel = "Public to team" | "Technical only" | "Leads only";

export type ClaimType =
  | "Decision"
  | "Owner"
  | "Task"
  | "Dependency"
  | "Risk"
  | "Open question"
  | "Next action";

export type SourceKind = "GitHub" | "Slack" | "Drive" | "Meeting notes";

export interface Evidence {
  id: string;
  claimId?: string;
  source: SourceKind;
  author: string;
  fileName?: string;
  happenedAt: string;
  excerpt: string;
  href?: string;
}

export interface ClaimHistoryEntry {
  actor: string;
  action: "Created" | "Approved" | "Edited" | "Rejected" | "Requested clarification";
  at: string;
  version: number;
  note?: string;
}

export interface TransitionVersion {
  transitionId: string;
  version: number;
  createdAt: string;
  actor: string;
  summary: string;
  remark?: string;
  published: boolean;
}

export interface ClaimEditInput {
  statement: string;
  trust: TrustLabel;
  access: AccessLevel;
  origin: Origin;
  evidenceIds: string[];
  reviewerNote: string;
}

export interface Claim {
  id: string;
  transitionId: string;
  statement: string;
  type: ClaimType;
  trust: TrustLabel;
  access: AccessLevel;
  origin: Origin;
  evidenceIds: string[];
  history: ClaimHistoryEntry[];
  reviewerNote?: string;
  responseNote?: string;
  followUps?: ClaimFollowUp[];
  proposal: boolean;
  status: "Pending review" | "Approved" | "Rejected";
}

export interface ClaimFollowUp {
  source: "Gemini" | "Reviewer";
  question: string;
  answer?: string;
  status: "Answered" | "Awaiting answer" | "Draft saved" | "Skipped";
}

export interface SourceConnection {
  id: string;
  transitionId: string;
  kind: SourceKind;
  name: string;
  href?: string;
  files: SourceFile[];
  access: AccessLevel;
  linkedClaimCount: number;
  connected: boolean;
}

export interface SourceFile {
  recordId: string;
  name: string;
  href?: string;
  claimIds: string[];
}

export interface Person {
  id: string;
  name: string;
  email: string;
  title: string;
  initials: string;
}

export interface ProjectMember {
  id: string;
  name: string;
  title: string;
  initials: string;
  involvement: "Current member" | "Departing" | "Incoming" | "Reviewer";
}

export interface Project {
  id: string;
  code: string;
  name: string;
  team?: string;
  supervisor: string;
  members: ProjectMember[];
}

export interface Transition {
  id: string;
  project: string;
  projectCode: string;
  team: string;
  status: "Review" | "Approved" | "In progress" | "Awaiting project approval" | "Waiting for leaver answers" | "Awaiting reviewer assignment" | "Awaiting admin approval";
  departing: Person;
  incoming: Person;
  incomingRole: string;
  accessDaysRemaining: number;
  accessExpiresAt?: string;
  accessReady: boolean;
  teamAssigned: boolean;
  claimCount: number;
  reviewedCount: number;
  blockingCount: number;
  version: number;
  publishedAt?: string;
  reviewer?: { id: string; name: string; email: string };
  reviewerCandidates?: Array<{ id: string; name: string; email: string; role: string; teams: string[] }>;
  reviewerRemarks?: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  acknowledgedVersion?: number;
}

export type ExitAnswerStatus = "draft" | "submitted" | "dont-know" | "skipped";

export interface ExitQuestion {
  id: string;
  transitionId: string;
  relatedClaimId: string;
  prompt: string;
  systemFound: string;
  trust: TrustLabel;
  evidenceIds: string[];
  answer?: string;
  answerStatus?: ExitAnswerStatus;
  answerSubmitted?: boolean;
}

export interface ExitAnswer {
  transitionId: string;
  questionId: string;
  answer: string;
  status: ExitAnswerStatus;
  savedAt: string;
  submittedAt?: string;
}

export interface OnboardingView {
  transition: Transition;
  role: RecipientRole;
  claims: Claim[];
  evidence: Evidence[];
  sources: SourceConnection[];
  hiddenItemCount: number;
  reviewerRemarks?: string;
  canPreviewRoles?: boolean;
}

export interface AuditEvent {
  id: string;
  transitionId: string;
  actor: string;
  action: string;
  target: string;
  at: string;
}
