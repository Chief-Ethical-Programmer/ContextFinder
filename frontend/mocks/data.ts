import type { AuditEvent, Claim, Evidence, ExitAnswer, ExitQuestion, Project, SourceConnection, Transition, TransitionVersion } from "@/lib/types";

export const projects: Project[] = [
  { id: "project-cloudcart", code: "P1", name: "CloudCart Platform", supervisor: "J. Rivera", members: [
    { id: "alex", name: "Alex Morgan", title: "Senior DevOps Engineer", initials: "AM", involvement: "Departing" },
    { id: "priya", name: "Priya Nair", title: "Platform Engineer", initials: "PN", involvement: "Current member" },
    { id: "jordan", name: "Jordan Kim", title: "Site Reliability Engineer", initials: "JK", involvement: "Current member" },
  ] },
  { id: "project-atlas", code: "P2", name: "Atlas Community Portal", supervisor: "J. Rivera", members: [
    { id: "sofia", name: "Sofia Das", title: "Product Owner", initials: "SD", involvement: "Current member" },
    { id: "daniel", name: "Daniel Roy", title: "Frontend Maintainer", initials: "DR", involvement: "Current member" },
  ] },
  { id: "project-northstar", code: "P3", name: "Northstar Analytics", supervisor: "J. Rivera", members: [
    { id: "sam", name: "Sam Lee", title: "Data Platform Lead", initials: "SL", involvement: "Current member" },
    { id: "aisha", name: "Aisha Khan", title: "Analytics Engineer", initials: "AK", involvement: "Current member" },
  ] },
];

export const transitions: Transition[] = [
  {
    id: "cf-cloudcart-01",
    project: "CloudCart Platform",
    projectCode: "P1",
    status: "Review",
    departing: { id: "alex", name: "Alex Morgan", email: "alex@cloudcart.demo", title: "Senior DevOps Engineer", initials: "AM" },
    incoming: { id: "ryan", name: "Ryan Chen", email: "ryan@cloudcart.demo", title: "Technical Successor", initials: "RC" },
    incomingRole: "Technical successor",
    daysRemaining: 7,
    accessReady: true,
    teamAssigned: true,
    claimCount: 24,
    reviewedCount: 5,
    blockingCount: 3,
    version: 3,
    reviewerRemarks: "Confirm the Terraform migration status with Alex before publishing the final handover.",
  },
  {
    id: "cf-atlas-02",
    project: "Atlas Community Portal",
    projectCode: "P2",
    status: "In progress",
    departing: { id: "", name: "Not assigned", email: "", title: "", initials: "—" },
    incoming: { id: "mira", name: "Mira Patel", email: "mira@atlas.demo", title: "New Volunteer", initials: "MP" },
    incomingRole: "New volunteer",
    daysRemaining: 12,
    accessReady: false,
    teamAssigned: false,
    claimCount: 0,
    reviewedCount: 0,
    blockingCount: 0,
    version: 0,
  },
];

export const evidence: Evidence[] = [
  { id: "ev-slack-terraform", source: "Slack", author: "Alex Morgan", happenedAt: "Oct 28, 2026 · 2:14 PM", excerpt: "Terraform is mostly done now — just cleaning up a couple of modules before the handoff.", href: "https://demo.contextfinder.local/slack/terraform" },
  { id: "ev-github-modules", source: "GitHub", author: "Ryan Chen", happenedAt: "Oct 30, 2026 · 9:42 AM", excerpt: "Merged modules: networking, iam, and observability. 8 modules remain open in the migration branch.", href: "https://demo.contextfinder.local/github/pull/184" },
  { id: "ev-github-pipeline", source: "GitHub", author: "Alex Morgan", happenedAt: "Oct 29, 2026 · 4:06 PM", excerpt: "Build → unit tests → image scan → push to ECR → deploy to staging. Production requires an approved release.", href: "https://demo.contextfinder.local/github/workflows/deploy" },
  { id: "ev-drive-autoscale", source: "Drive", author: "Platform team", happenedAt: "Oct 22, 2026 · 11:30 AM", excerpt: "HPA target CPU utilization: 65%. Minimum 3 replicas; maximum 12 replicas for checkout-api.", href: "https://demo.contextfinder.local/drive/runbook" },
  { id: "ev-slack-threshold", source: "Slack", author: "Alex Morgan", happenedAt: "Oct 24, 2026 · 10:18 AM", excerpt: "Bumped checkout CPU target to 70% to reduce scaling noise during peak traffic.", href: "https://demo.contextfinder.local/slack/autoscale" },
  { id: "ev-github-alerts", source: "GitHub", author: "Priya Nair", happenedAt: "Oct 27, 2026 · 1:50 PM", excerpt: "Alert rules cover sustained 5xx rate, elevated checkout latency, and low node disk space.", href: "https://demo.contextfinder.local/github/monitoring/rules" },
  { id: "ev-drive-workaround", source: "Drive", author: "Alex Morgan", happenedAt: "Oct 20, 2026 · 3:05 PM", excerpt: "If the staging image pull stalls, recycle the registry cache pod before retrying the rollout.", href: "https://demo.contextfinder.local/drive/staging-notes" },
  { id: "ev-github-rollback-ref", source: "GitHub", author: "Alex Morgan", happenedAt: "Oct 18, 2026 · 8:33 AM", excerpt: "Revert using the procedure in the rollback runbook; see the linked release PR for the latest steps.", href: "https://demo.contextfinder.local/github/pull/176" },
  { id: "ev-slack-db-owner", source: "Slack", author: "Alex Morgan", happenedAt: "Oct 26, 2026 · 12:10 PM", excerpt: "The data platform group owns the RDS maintenance window; ping them before major schema changes.", href: "https://demo.contextfinder.local/slack/data-platform" },
  { id: "ev-meeting-credentials", source: "Meeting notes", author: "Leads sync", happenedAt: "Oct 21, 2026 · 9:00 AM", excerpt: "Production credential rotation is coordinated by the platform leads. Secret value: [redacted].", href: "https://demo.contextfinder.local/drive/leads-sync" },
  { id: "ev-github-runtime", source: "GitHub", author: "Alex Morgan", happenedAt: "Oct 25, 2026 · 2:42 PM", excerpt: "Platform node pool uses containerd; workloads are deployed from signed images in ECR." },
  { id: "ev-drive-prometheus", source: "Drive", author: "Platform team", happenedAt: "Oct 23, 2026 · 10:15 AM", excerpt: "Prometheus scrapes application and node metrics every 30 seconds." },
  { id: "ev-grafana-dashboard", source: "Drive", author: "Priya Nair", happenedAt: "Oct 23, 2026 · 11:20 AM", excerpt: "The CloudCart overview dashboard tracks p95 latency, checkout errors, and pod saturation." },
  { id: "ev-slack-prod-approval", source: "Slack", author: "J. Rivera", happenedAt: "Oct 29, 2026 · 4:25 PM", excerpt: "Production deploys still require an approved release; staging can run on the normal merge workflow." },
  { id: "ev-drive-rds-window", source: "Drive", author: "Platform team", happenedAt: "Oct 19, 2026 · 3:40 PM", excerpt: "RDS maintenance windows are announced in #platform-ops at least 24 hours ahead." },
  { id: "ev-slack-networking", source: "Slack", author: "Alex Morgan", happenedAt: "Oct 28, 2026 · 1:08 PM", excerpt: "Waiting for the networking group to confirm the final security group rules for the remaining modules." },
  { id: "ev-slack-registry", source: "Slack", author: "Alex Morgan", happenedAt: "Oct 27, 2026 · 3:52 PM", excerpt: "I can rotate the staging registry credentials before I leave; production rotation stays with the platform leads." },
  { id: "ev-github-release-rollback", source: "GitHub", author: "Ryan Chen", happenedAt: "Oct 17, 2026 · 9:22 AM", excerpt: "Release PR references the old rollback checklist. The runbook link currently returns not found." },
  { id: "ev-drive-hpa-min", source: "Drive", author: "Platform team", happenedAt: "Oct 22, 2026 · 11:30 AM", excerpt: "checkout-api HPA minimum is 3 replicas, with a maximum of 12." },
  { id: "ev-meeting-security", source: "Meeting notes", author: "Leads sync", happenedAt: "Oct 21, 2026 · 9:00 AM", excerpt: "Production credentials stay within the leads group. Example secret: [redacted]." },
  { id: "ev-slack-customer-impact", source: "Slack", author: "Support rotation", happenedAt: "Oct 30, 2026 · 7:12 AM", excerpt: "Checkout latency was elevated during the morning traffic spike; impact duration is still being checked." },
  { id: "ev-github-next-step", source: "GitHub", author: "Ryan Chen", happenedAt: "Oct 30, 2026 · 10:02 AM", excerpt: "Next: ask networking to review the eight open Terraform module changes before scheduling the migration window." },
];

const baseHistory = [{ actor: "ContextFinder", action: "Created" as const, at: "Oct 30, 2026 · 10:00 AM", version: 3 }];

export const claims: Claim[] = [
  { id: "cl-terraform", transitionId: "cf-cloudcart-01", statement: "The Terraform migration is mostly complete.", type: "Task", trust: "Conflicting", access: "Technical only", origin: "System extracted", evidenceIds: ["ev-slack-terraform", "ev-github-modules"], history: [...baseHistory, { actor: "J. Rivera", action: "Requested clarification", at: "Oct 30, 2026 · 2:16 PM", version: 3, note: "Slack and repository progress disagree." }], proposal: true, status: "Pending review" },
  { id: "cl-rollback", transitionId: "cf-cloudcart-01", statement: "Production rollback follows the procedure in the release runbook.", type: "Risk", trust: "Missing evidence", access: "Technical only", origin: "System extracted", evidenceIds: ["ev-github-rollback-ref", "ev-missing-runbook"], history: baseHistory, proposal: true, status: "Pending review" },
  { id: "cl-autoscale-reason", transitionId: "cf-cloudcart-01", statement: "The checkout CPU autoscaling threshold was raised to 70%; the reason needs confirmation.", type: "Open question", trust: "Unverified", access: "Technical only", origin: "System extracted", evidenceIds: ["ev-slack-threshold"], history: baseHistory, proposal: true, status: "Pending review" },
  { id: "cl-pipeline", transitionId: "cf-cloudcart-01", statement: "The deployment pipeline runs tests and an image scan before pushing to ECR and deploying to staging.", type: "Decision", trust: "Verified", access: "Technical only", origin: "System extracted", evidenceIds: ["ev-github-pipeline"], history: [...baseHistory, { actor: "J. Rivera", action: "Approved", at: "Oct 31, 2026 · 9:12 AM", version: 3 }], proposal: false, status: "Approved" },
  { id: "cl-autoscale", transitionId: "cf-cloudcart-01", statement: "checkout-api scales between 3 and 12 replicas with a 65% CPU target in the recorded runbook.", type: "Decision", trust: "Partially supported", access: "Technical only", origin: "System extracted", evidenceIds: ["ev-drive-autoscale", "ev-slack-threshold"], history: baseHistory, proposal: true, status: "Pending review" },
  { id: "cl-alerts", transitionId: "cf-cloudcart-01", statement: "Recurring alerts cover elevated 5xx rate, checkout latency, and low node disk space.", type: "Risk", trust: "Verified", access: "Public to team", origin: "System extracted", evidenceIds: ["ev-github-alerts"], history: baseHistory, proposal: false, status: "Approved" },
  { id: "cl-staging", transitionId: "cf-cloudcart-01", statement: "When staging image pulls stall, recycle the registry cache pod before retrying the rollout.", type: "Next action", trust: "Partially supported", access: "Technical only", origin: "Stated by leaver", evidenceIds: ["ev-drive-workaround"], history: baseHistory, proposal: true, status: "Pending review" },
  { id: "cl-data-owner", transitionId: "cf-cloudcart-01", statement: "The data platform group owns RDS maintenance windows and should be consulted before schema changes.", type: "Owner", trust: "Verified", access: "Public to team", origin: "System extracted", evidenceIds: ["ev-slack-db-owner"], history: baseHistory, proposal: false, status: "Approved" },
  { id: "cl-credential-rotation", transitionId: "cf-cloudcart-01", statement: "Production credential rotation is coordinated by platform leads.", type: "Owner", trust: "Verified", access: "Leads only", origin: "Entered by reviewer", evidenceIds: ["ev-meeting-credentials"], history: baseHistory, proposal: true, status: "Pending review" },
  { id: "cl-dependency", transitionId: "cf-cloudcart-01", statement: "Checkout production releases depend on an approved release and a healthy ECR image scan.", type: "Dependency", trust: "Verified", access: "Technical only", origin: "System extracted", evidenceIds: ["ev-github-pipeline"], history: baseHistory, proposal: false, status: "Approved" },
  { id: "cl-open-question", transitionId: "cf-cloudcart-01", statement: "Confirm which Terraform modules are still waiting on the networking team.", type: "Open question", trust: "Unverified", access: "Public to team", origin: "Stated by leaver", evidenceIds: [], history: baseHistory, proposal: true, status: "Pending review" },
  { id: "cl-secret", transitionId: "cf-cloudcart-01", statement: "A sample token in an imported excerpt is always shown as [redacted].", type: "Decision", trust: "Verified", access: "Leads only", origin: "Entered by reviewer", evidenceIds: ["ev-meeting-credentials"], history: baseHistory, proposal: false, status: "Approved" },
  { id: "cl-runtime", transitionId: "cf-cloudcart-01", statement: "CloudCart production workloads run on Kubernetes nodes using containerd and signed images from ECR.", type: "Decision", trust: "Verified", access: "Technical only", origin: "System extracted", evidenceIds: ["ev-github-runtime"], history: baseHistory, proposal: true, status: "Pending review" },
  { id: "cl-prometheus", transitionId: "cf-cloudcart-01", statement: "Prometheus scrapes application and node metrics every 30 seconds.", type: "Decision", trust: "Verified", access: "Technical only", origin: "System extracted", evidenceIds: ["ev-drive-prometheus"], history: baseHistory, proposal: true, status: "Pending review" },
  { id: "cl-grafana", transitionId: "cf-cloudcart-01", statement: "The CloudCart overview dashboard tracks p95 latency, checkout errors, and pod saturation.", type: "Task", trust: "Partially supported", access: "Public to team", origin: "System extracted", evidenceIds: ["ev-grafana-dashboard"], history: baseHistory, proposal: true, status: "Pending review" },
  { id: "cl-prod-approval", transitionId: "cf-cloudcart-01", statement: "Production deployments require an approved release; staging follows the merge workflow.", type: "Decision", trust: "Verified", access: "Public to team", origin: "System extracted", evidenceIds: ["ev-slack-prod-approval", "ev-github-pipeline"], history: baseHistory, proposal: true, status: "Pending review" },
  { id: "cl-rds-window", transitionId: "cf-cloudcart-01", statement: "RDS maintenance windows are announced in the platform channel at least 24 hours ahead.", type: "Dependency", trust: "Verified", access: "Public to team", origin: "System extracted", evidenceIds: ["ev-drive-rds-window", "ev-slack-db-owner"], history: baseHistory, proposal: true, status: "Pending review" },
  { id: "cl-networking", transitionId: "cf-cloudcart-01", statement: "Eight Terraform modules are waiting on networking to confirm security group rules.", type: "Dependency", trust: "Partially supported", access: "Technical only", origin: "System extracted", evidenceIds: ["ev-slack-networking", "ev-github-modules"], history: baseHistory, proposal: true, status: "Pending review" },
  { id: "cl-staging-rotation", transitionId: "cf-cloudcart-01", statement: "Alex offered to rotate staging registry credentials before departure; production credential rotation remains with platform leads.", type: "Owner", trust: "Partially supported", access: "Technical only", origin: "Stated by leaver", evidenceIds: ["ev-slack-registry", "ev-meeting-credentials"], history: baseHistory, proposal: true, status: "Pending review" },
  { id: "cl-old-rollback", transitionId: "cf-cloudcart-01", statement: "The release PR points to an older rollback checklist whose runbook link is unavailable.", type: "Risk", trust: "Missing evidence", access: "Technical only", origin: "System extracted", evidenceIds: ["ev-github-release-rollback", "ev-rollback-checklist-v1"], history: baseHistory, proposal: true, status: "Pending review" },
  { id: "cl-hpa-min", transitionId: "cf-cloudcart-01", statement: "checkout-api runs with a minimum of 3 and maximum of 12 replicas.", type: "Decision", trust: "Partially supported", access: "Technical only", origin: "System extracted", evidenceIds: ["ev-drive-hpa-min"], history: baseHistory, proposal: true, status: "Pending review" },
  { id: "cl-prod-secrets", transitionId: "cf-cloudcart-01", statement: "Production credential values must remain within the leads group and are redacted in excerpts.", type: "Risk", trust: "Verified", access: "Leads only", origin: "Entered by reviewer", evidenceIds: ["ev-meeting-security"], history: baseHistory, proposal: true, status: "Pending review" },
  { id: "cl-customer-impact", transitionId: "cf-cloudcart-01", statement: "The duration and customer impact of the latest checkout latency spike have not yet been confirmed.", type: "Risk", trust: "Unverified", access: "Technical only", origin: "System extracted", evidenceIds: ["ev-slack-customer-impact"], history: baseHistory, proposal: true, status: "Pending review" },
  { id: "cl-next-step", transitionId: "cf-cloudcart-01", statement: "Ask networking to review the remaining Terraform changes before scheduling the migration window.", type: "Next action", trust: "Verified", access: "Public to team", origin: "Entered by reviewer", evidenceIds: ["ev-github-next-step"], history: baseHistory, proposal: true, status: "Pending review" },
];

export const versions: TransitionVersion[] = [
  { transitionId: "cf-cloudcart-01", version: 1, createdAt: "Oct 29, 2026 · 9:14 AM", actor: "ContextFinder", summary: "Initial source scan completed", published: false },
  { transitionId: "cf-cloudcart-01", version: 2, createdAt: "Oct 30, 2026 · 10:03 AM", actor: "ContextFinder", summary: "Added 24 proposed claims and evidence links", published: false },
  { transitionId: "cf-cloudcart-01", version: 3, createdAt: "Oct 31, 2026 · 9:12 AM", actor: "J. Rivera", summary: "Approved deployment pipeline claim; flagged Terraform conflict", remark: "Confirm the Terraform migration status with Alex before publishing.", published: false },
];

export const exitQuestions: ExitQuestion[] = [
  { id: "exit-terraform-status", transitionId: "cf-cloudcart-01", relatedClaimId: "cl-terraform", prompt: "Slack describes the Terraform migration as mostly done, while the repository shows 3 of 11 modules merged. Which is current, and what remains before the migration is complete?", systemFound: "Slack says the migration is mostly done; the repository records 3 of 11 modules merged.", trust: "Conflicting", evidenceIds: ["ev-slack-terraform", "ev-github-modules"] },
  { id: "exit-rollback-runbook", transitionId: "cf-cloudcart-01", relatedClaimId: "cl-rollback", prompt: "The release pull request refers to a rollback runbook, but the document wasn’t found. What steps should Ryan follow to safely roll back production?", systemFound: "A release PR points to a rollback runbook, but no matching runbook document was found.", trust: "Missing evidence", evidenceIds: ["ev-github-rollback-ref"] },
  { id: "exit-autoscaling-change", transitionId: "cf-cloudcart-01", relatedClaimId: "cl-autoscale-reason", prompt: "The runbook records a 65% CPU target, while Slack says checkout was raised to 70%. What prompted the change, and should the runbook be updated?", systemFound: "The runbook says 65%; a Slack message says the checkout target changed to 70% but gives no recorded reason.", trust: "Unverified", evidenceIds: ["ev-drive-autoscale", "ev-slack-threshold"] },
  { id: "exit-networking-modules", transitionId: "cf-cloudcart-01", relatedClaimId: "cl-networking", prompt: "Which of the remaining Terraform modules are waiting on networking, and who should Ryan contact to get the security group review moving?", systemFound: "The repository shows eight modules remain open; Slack says networking confirmation is pending for the final security group rules.", trust: "Partially supported", evidenceIds: ["ev-github-modules", "ev-slack-networking"] },
];

export const exitAnswers: ExitAnswer[] = [];

export const sources: SourceConnection[] = [
  { id: "src-github", transitionId: "cf-cloudcart-01", kind: "GitHub", name: "cloudcart/platform-infra", access: "Technical only", linkedClaimCount: 9, connected: true },
  { id: "src-slack", transitionId: "cf-cloudcart-01", kind: "Slack", name: "CloudCart · platform export", access: "Public to team", linkedClaimCount: 7, connected: true },
  { id: "src-drive", transitionId: "cf-cloudcart-01", kind: "Drive", name: "Platform runbooks export", access: "Technical only", linkedClaimCount: 6, connected: true },
  { id: "src-meetings", transitionId: "cf-cloudcart-01", kind: "Meeting notes", name: "Leads sync notes", access: "Leads only", linkedClaimCount: 2, connected: true },
];

export const auditEvents: AuditEvent[] = [
  { id: "au-1", transitionId: "cf-cloudcart-01", actor: "J. Rivera", action: "Approved claim", target: "cl-pipeline", at: "Oct 31, 2026 · 9:12 AM" },
  { id: "au-2", transitionId: "cf-cloudcart-01", actor: "ContextFinder", action: "Flagged conflicting evidence", target: "cl-terraform", at: "Oct 30, 2026 · 10:03 AM" },
];
