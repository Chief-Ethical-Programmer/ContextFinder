# ContextFinder MVP and Round 2 Alignment Report

**Review date:** 3 November 2026  
**Purpose:** Describe the MVP currently implemented, trace the end-to-end handover workflow, assess it against the problem described by the product owner and the repository’s Round 2 notes, and explain how the fictional demo packs are used.  
**Assessment:** The core evidence-backed handover workflow is implemented in the working tree and its main code paths have unit-level coverage. The product is suitable for a controlled synthetic-data demo after a successful authenticated acceptance run. It is not yet a fully verified release. Some older Round 2 documentation describes source integrations and behavior that no longer match the current product scope or code.

## 1. Requirement sources and confidence

No standalone formal problem-statement or proposed-solution document was found in the repository. The PDFs in `demo-data/devops-team/` are fictional evidence-gap registers used as project input; they are not the product problem statement. This report therefore compares the implementation against:

1. The problem and workflow requirements described by the product owner in this conversation.
2. The Round 2 source-ingestion and acceptance checklist in [HANDOFF_TO_COPILOT.md](HANDOFF_TO_COPILOT.md).
3. The phase summary in [Backend/docs/CHANGES.md](Backend/docs/CHANGES.md).
4. The explicitly deferred product improvements in [Backend/docs/ROUND3_COMMITMENTS.md](Backend/docs/ROUND3_COMMITMENTS.md).

These documents do not agree in every detail. The handoff note is stale: it describes an older directory layout, active Slack export ingestion, GitHub issue/PR/commit retrieval, cached/fallback behavior, and an old Gemini model target. The current implementation has since changed. The implementation and the product owner’s later decisions are used as the source of truth below; documentation mismatches are called out explicitly.

## 2. Problem ContextFinder is intended to address

When a person leaves a team, operational decisions, ownership, dependencies, unfinished work, and source links can be scattered across repositories and documents. A successor may not know which claims are current or where to verify them. A raw document dump also leaves the team to manually reconstruct conflicts and missing information.

ContextFinder’s intended response is to:

- Let the departing member identify the project, owning team, and project brief.
- Gather selected project sources and preserve links/evidence for later checking.
- Use Gemini to propose structured claims, identify conflicts or gaps, and draft focused questions for the departing member.
- Keep the departing member’s answers attached to the relevant questions/claims.
- Require a human team lead reviewer to resolve the proposals and approve the handover.
- Let the admin coordinate reviewer assignment and later match an incoming member to the project team.
- Give the incoming member a role-cleared, evidence-linked handover for a limited period.

The central design principle is that AI output remains a proposal. The reviewer decides what is suitable to publish, and the recipient view is derived from the published handover and its clearance rules.

## 3. Detailed end-to-end workflow

| Stage | User action and system behavior | Current implementation status |
|---|---|---|
| **0. Workspace and accounts** | Users register/sign in with roles: admin, team lead reviewer, departing member, or incoming member. Reviewers and incoming members can register a team. Accounts, password hashes, role, and team are stored by the backend. | **Implemented.** Admin signup needs a configured invitation code or an existing admin account. The current environment has no admin signup code; account inventory was not inspected. |
| **1. Project details** | The departing member submits a project name, owning team, and short description. The backend creates a project request, project, membership, and transition in PostgreSQL. | **Implemented.** This is a draft intake step; initial admin approval is not the gate before analysis in the current workflow. |
| **2. Source intake** | The departing member provides a public GitHub repository reference and/or uploads project documents. The UI asks for confirmation that sources can be processed by the configured AI model. | **Implemented with scope limits.** Local files and public GitHub repositories are supported. Slack exports are not accepted. |
| **3. Submission and automatic analysis** | After sources and the AI-processing attestation are saved, submitting the request schedules a backend task. The backend imports GitHub files, reads stored document text, redacts detected secrets before saving records, and persists source records in PostgreSQL. | **Implemented.** Processing uses in-process FastAPI background tasks, so it is not durable across an API process/container restart. |
| **4. AI claims and evidence checks** | Gemini receives bounded extracted text plus the project brief as context. It proposes typed claims and evidence excerpts. Deterministic backend rules check source-record references and excerpt matching, derive trust labels, pair conflicting values, and apply access inheritance. | **Implemented.** The project brief is context, not claim evidence. The reviewer must verify correctness; the model does not establish truth. Live Gemini operation was not exercised in the latest QA pass. |
| **5. Questions for the leaver** | For unresolved conflicting, missing-evidence, or unverified claims, Gemini drafts specific questions. Relevant uploaded solution/design documents can be supplied as context. The questions remain linked to the affected claims. | **Implemented.** Generation is limited to 12 unresolved claims/questions per handover. |
| **6. Departing member answers** | The departing member can answer, save drafts, or indicate that they do not know. Reviewer follow-up questions can be returned to the departing member and answered in more detail. Answers are attached to the corresponding question/claim and audited. | **Implemented in code/UI.** The full interaction was not verified using disposable authenticated accounts during this review. |
| **7. Reviewer assignment and review** | The admin assigns a registered team lead reviewer. Team matching is checked against the project team. The reviewer sees claims, source evidence, trust labels, answers, and history, then approves, edits, rejects, or asks for more information. | **Implemented.** Reviewer authorization is checked against the assigned transition. Conflicting and missing-evidence claims require a human note when approved. Regression tests cover reviewer mismatch and closed-review responses. |
| **8. Reviewer final approval** | The reviewer can publish only after each reviewable claim has a final state. Publication creates a versioned snapshot containing only approved/edited claims, role views, and audit events. | **Implemented.** Rejected claims are excluded from the published recipient claim set. Admin final approval is not the final review gate in the current workflow. |
| **9. Admin onboarding assignment** | After reviewer publication, the admin assigns a registered incoming member. The incoming member must be registered to the project’s team; the UI filters candidates by team. | **Implemented.** A new incoming account must exist first. The current flow is not an invitation system. |
| **10. Incoming handover and expiry** | The incoming member sees claims, evidence, and sources allowed for their role. They can acknowledge receipt. Access expires after 30 days; request-time checks deny expired access and an in-process sweep removes expired assignments. | **Implemented in code.** Expiry and role-filter behavior have unit coverage, but expiry was not time-advanced in a live workflow. |

### Processing and access limits

- Documents accepted: Markdown, text, DOCX, and PDF; up to 10 MB per file.
- Scanned PDFs have no OCR path and may yield no usable text.
- GitHub access is public-only. The importer reads the default-branch tree and fetches up to 10 supported text files, no more than 64 KB each and 150 KB total.
- The importer saves selected file text and commit-pinned URLs. It does not clone the repository.
- The code limits a handover to 2,000 source records and 500,000 extracted characters. Gemini extraction splits text into 12,000-character chunks with 600-character overlap and a maximum of 60 chunks.
- Vector search is disabled. The 30-60-90 planning feature has been removed from the current MVP.

## 4. Alignment with the product owner’s problem and solution

| Product requirement | Implementation | Alignment |
|---|---|---|
| Reduce knowledge loss during employee departure | Project brief, source records, claims, answers, evidence, review events, published versions, and audit events are persisted. | **Aligned.** |
| Let the departing member choose the project and owning team | Project name/team/description form creates the request and transition. | **Aligned.** |
| Use source material to extract claims and find missing/conflicting information | Gemini proposes claims from imported source text; backend applies evidence checks and trust rules. | **Mostly aligned.** The model is useful for synthesis but can be wrong; human review remains essential. |
| Generate questions that refer to conflicts, gaps, and proposed solution documents | Question generation selects unresolved claims and may include relevant uploaded solution/design documents as context. | **Aligned in code.** Limited to 12 questions per handover. |
| Let the leaver answer and revisit reviewer-specific questions | Answers and follow-ups are attached to the affected claim/question. | **Aligned in code; end-to-end verification remains outstanding.** |
| Have a team lead reviewer make the final human decision | The assigned reviewer controls claim decisions and final publication; approval history is persisted. | **Aligned.** |
| Let the admin assign reviewers and incoming members by team | Admin dashboard exposes team-aware assignment; backend validates reviewer/incoming role and team. | **Aligned.** Admin assigns the incoming person after reviewer publication. |
| Limit what an incoming person can see | Published snapshot and role clearance filters control claims, sources, and evidence. | **Aligned in design and code.** Needs live account-to-account acceptance testing. |
| Expire incoming access after 30 days | Stored expiry time, route guard, and expiry worker. | **Aligned in code.** Operational reliability of the in-process worker still needs improvement for production. |
| Process GitHub, Slack, and documents | Current app processes public GitHub text files and manually uploaded local documents. Slack was removed. | **Partially aligned.** Slack ingestion is deliberately deferred from the current MVP. |
| Use a more capable model and demonstrate grounded reasoning | Gemini is configured as the live provider; evidence checks and questions are implemented. | **Partially verified.** No live Gemini request or quality evaluation was part of the latest QA run. |

## 5. Round 2 requirement mapping

The repository’s [Round 2 handoff checklist](HANDOFF_TO_COPILOT.md) describes the target as authorized source intake → parsing/ingestion → Gemini extraction → evidence-backed claims → human review → published recipient view. It also calls for source limits and actionable errors, no silent fake data, no partial claims after failed extraction, real backend data in dashboard/review, safe credential handling, and a complete Docker-backed demonstration.

| Round 2 need from the repository | Current state | Assessment / caveat |
|---|---|---|
| Create a handover using actual user-selected source material | Users manually upload documents and configure a public GitHub repo. Backend no longer seeds projects/claims/source records on startup. | **Aligned with no-auto-demo-seed requirement.** The supplied fake packs are not read from disk automatically. |
| Accept public GitHub owner/repo | Repository URL or owner/repo is accepted and canonicalized. | **Implemented.** No GitHub token required for public-only import. |
| Support private GitHub repositories with backend-only token | The current connector explicitly rejects private repositories; local token configuration does not grant support in the connector. | **Not implemented.** Earlier Round 2 handoff text anticipates private repository support but user-facing current scope is public-only. |
| Retrieve GitHub issues, pull requests, commits, and README | Connector fetches bounded public repository text files; it does not call the Issues/PR/commit API. | **Partially implemented.** Draft Markdown files may be read as files; they are not GitHub issue/PR objects. Several READMEs overstate this support. |
| Upload documents and parse common formats | Markdown, text, DOCX, and text-based PDF uploads are parsed and stored. | **Implemented.** No OCR for scanned PDFs. |
| Slack JSON/ZIP intake | Slack upload/ingestion was removed after the product owner decided to remove Slack export support in the current workflow. | **Deferred by later scope decision.** The Round 2 handoff’s Slack acceptance item is not met by this version. A future authorized Slack API integration is planned separately. |
| Use Gemini instead of silently returning fixture/cached claims | Provider configuration selects live Gemini; startup does not seed source fixtures. Failures should leave source records for retry. | **Aligned in direction.** Live model/key behavior and retry on a real quota/provider failure were not validated in this QA pass. |
| Show useful errors and support retry | API returns explicit validation, upload, GitHub, Gemini, and retry errors; a retry-analysis path exists. | **Implemented in code.** User-facing failure states have not all been exercised against real external failures. |
| Prevent partial claims after a failed multi-chunk extraction | Extraction supports replacement/removal of prior claims and pipeline failures are recorded. | **Implemented by code path; needs failure-injection verification.** |
| Use backend data rather than stale browser mock data | Current frontend is wired to backend endpoints; backend startup does not preload the user-created packs. | **Aligned in current implementation.** Database row contents were not inspected in this review. |
| Enforce access boundaries and preserve source evidence | API authorizes access, applies role/access filtering, stores evidence/source references, and records review/publication events. | **Aligned in code; full role-to-role acceptance testing remains.** |
| Demonstrate the central workflow locally with Docker | API and PostgreSQL have run in Compose; frontend runs separately. Health/readiness and the main UI routes pass. | **Partially verified.** Latest recorded checks include 18 passing backend tests, Ruff, frontend type check/build, route HTTP 200, and API readiness. A complete authenticated workflow and live Gemini request were not run. |

## 6. MVP scope versus later features

### MVP capabilities currently implemented

- Authentication and roles for admin, reviewer, departing, and incoming accounts.
- Project/team/brief intake and source upload for departing members.
- Public GitHub text-file import and local document extraction.
- PostgreSQL persistence, source URLs, evidence excerpts, access labels, and audit events.
- Gemini proposal generation, deterministic claim/evidence checks, trust labels, conflict handling, and leaver questions.
- Draft/submit answer behavior and reviewer clarification loop.
- Team-aware reviewer assignment, human review actions, approval notes, publish gates, versions, and role-specific recipient views.
- Admin assignment of incoming team members and 30-day access expiry.
- Recipient acknowledgement, dashboard team filters, and context-aware template onboarding plan.

### Not part of the completed MVP / currently incomplete

- Slack ingestion. It was removed from the current product flow. The owner’s newer roadmap proposes an authorized Slack API integration managed from the admin side.
- Private GitHub repositories and GitHub Issues/PR/commit API data.
- Durable job queue or shared scheduler for Gemini processing and access expiry.
- Continuous source synchronization or a general-purpose, permission-filtered Q&A assistant.
- A benchmarked “better reasoning model”; the model is configured but not quality-evaluated against a measured dataset in this pass.
- A secure per-user administrator invitation system. The current mechanism is a global signup code; the current local environment has no code configured.
- Active n8n reviewer/departing/incoming notification automation. Workflow JSON exports may exist, but current orchestration is inline and notifications are not a demonstrated end-to-end capability.
- Production operations hardening and a complete signed-in acceptance run.

### Product owner’s proposed future plan

These items should be described as planned work, not as delivered MVP features:

1. Use n8n to notify reviewers when a departing member answers a reviewer follow-up or submits answers ready for review, and notify incoming members when a handover is ready.
2. Integrate Slack through an authorized admin-managed connection and extract relevant data for selected teams.
3. Continue improving UI polish and evaluate a stronger reasoning model with representative synthetic cases.
4. Replace the global administrator signup code/manual setup with a secure admin invitation and account-creation flow.

## 7. How the created fake-data packs support the MVP

The user-created packs live in `demo-data/devops-team/` and represent three separate fictional projects:

| Pack | Documents and repository material | Intended test scenarios |
|---|---|---|
| `platform-infrastructure` | Terraform/repository README and drafts, architecture, migration checklist, DOCX handover brief, PDF gap register, reference Slack JSON. | Conflicting module counts, production apply ownership, migration status, rollback evidence. |
| `delivery-pipeline` | README, CI workflow and issue/PR drafts, release runbook/handoff, DOCX brief, PDF gap register, reference Slack JSON. | Canary and soak values, promotion/rollback behavior, approval evidence. |
| `observability-alerting` | README, alert YAML and issue/PR drafts, alert ownership/on-call notes, DOCX brief, PDF gap register, reference Slack JSON. | Alert thresholds, first-response ownership, escalation documentation. |

**They are upload materials, not application cache.** Backend startup runs migrations but does not ingest these folders or create demo accounts/projects/claims. For each demo handover, a user must create a project request, upload that pack’s supported local documents, publish its `github-repo` folder to a public GitHub repository, and enter that repo URL. Do not mix source files from separate packs if you want the resulting claims and evidence to remain coherent.

The local Slack JSON files remain for reference and future integration planning; current code will not ingest them. The `issue-drafts.md` and `pull-request-drafts.md` files are ordinary repository documents unless their contents are separately created as real GitHub issues/PRs and the connector is later expanded to call those APIs.

When a user submits the sources, document and GitHub text is stored in PostgreSQL. The selected extracted text—not the raw PDF/DOCX binary—is sent to Gemini with the project brief as non-evidence context. The UI’s attestation is a user confirmation, not a substitute for organization approval before any real or confidential source is sent to a third-party AI service.

## 8. Verification status and release confidence

Latest recorded QA verification in this working session:

- 18 backend tests passed; one warning came from the installed AnyIO pytest plugin using an alias deprecated for pytest 10.
- Ruff passed for backend application code and tests.
- Frontend TypeScript check and optimized production build passed.
- Frontend login/signup/admin/project-request/reviewer routes returned HTTP 200 after fixing separate dev/build output directories.
- API health and readiness returned HTTP 200; readiness confirmed a PostgreSQL connection.
- Reviewer authorization, pipeline status access, fake-client role view, and multi-draft source-submit behavior received fixes. Backend regressions have automated tests; the multi-draft UI path was type/build checked but not browser-automated.
- No test accounts, uploaded demo source pack, real GitHub fetch, live Gemini request, failure-injected retry, or 30-day time-advance scenario was exercised.
- The working tree contains extensive uncommitted changes; the report reflects a development working tree, not a tagged release.

## 9. Remaining actions to claim Round 2 acceptance confidently

1. Create or confirm a safe administrator account, then use disposable accounts for departing, reviewer, and incoming roles.
2. Run one complete handover using only one fictional pack: create request → upload documents/public repo → attest → submit → wait for Gemini → answer questions → assign reviewer → review/publish → assign a same-team incoming user → verify role-filtered view and acknowledgement.
3. Verify the current Gemini model/key with a synthetic-only request and test a recoverable provider/quota failure. Confirm that saved source records remain available and partial claims do not leak into the final publication.
4. Reconcile `Backend/README.md`, `demo-data/devops-team/README.md`, `UPLOAD_GUIDE.md`, `HANDOFF_TO_COPILOT.md`, and `Backend/docs/CHANGES.md` with the implemented public-file-only GitHub behavior and no-Slack current scope.
5. Keep n8n notifications, admin invitation flow, Slack API integration, durable jobs, and stronger model evaluation clearly marked as future work until they are implemented and verified.

## 10. Conclusion

**MVP reached:** The core product workflow exists: project/source intake, AI-proposed claims and questions, departing-member answers, human team-lead review, admin assignment, and role-filtered onboarding handover. The architecture and workflow match the solution described by the product owner and most of the Round 2 goal of evidence-backed human review.

**Round 2 status:** **Substantially implemented, partially acceptance-verified.** The current version meets much of the workflow and evidence/security intent, but it intentionally does not meet older Slack/private-GitHub/GitHub-activity checklist items. It also has not passed a fresh authenticated end-to-end run with live Gemini. The stale docs need reconciliation so judges and users are not promised unsupported sources.

**Demo data:** The three user-created packs make the MVP demonstrable with realistic synthetic conflicts and evidence gaps, but the website only uses them after explicit upload/configuration. They do not populate the database automatically, and Slack JSON is currently ignored.
