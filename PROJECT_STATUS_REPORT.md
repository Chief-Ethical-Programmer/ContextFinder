# ContextFinder QA and Project Status Report

**Review date:** 3 November 2026  
**Scope:** Current working tree, application code and documentation, fictional demo packs, non-secret environment flags, automated checks, and local HTTP routes.  
**Overall assessment:** Core handover workflow is implemented for a demo MVP. A frontend build/dev-output collision and three backend runtime defects were found and fixed in this QA pass. The API, database readiness, frontend routes, backend tests, and production build now pass the checks listed below. A full signed-in workflow and live Gemini request remain unverified.

## 1. Executive summary

ContextFinder is an evidence-backed project handover application. A departing member starts a project request with its name, team, and brief; uploads documents and provides a public GitHub repository; and confirms that the material can be sent to Gemini. The application imports source text, proposes claims and questions, and lets the departing member add context. An administrator assigns a team lead reviewer. The reviewer resolves claims and questions and gives final approval. The administrator can then assign an incoming member registered for the project’s team. That person receives a role-filtered handover with a 30-day access window.

This matches the main product goal described in the conversation: reduce knowledge loss when a person leaves while keeping a human responsible for approving the handover. The implementation has authentication, PostgreSQL-backed records, AI-assisted extraction and questioning, deterministic evidence checks, reviewer actions, team-aware assignment, versioned publication, audit events, and incoming access expiry.

**Current QA result:**

- The frontend was returning HTTP 500 because a production build and a running development server shared Next.js’s `.next` output. Development now uses `.next-dev`; production builds use `.next`. The old server was restarted, and the main routes return HTTP 200 on port 3000.
- Two backend defects found during static QA were fixed and covered by regression tests: incorrect local `HTTPException` imports in reviewer guards and a missing access-check import in pipeline status. The unused role-view plan helper and its regression test have since been removed with the 30-60-90 feature.
- The API image was rebuilt and restarted without recreating PostgreSQL or deleting its volume.
- **18 backend tests pass**, Ruff passes for `app` and `tests`, the frontend TypeScript check passes, and `next build` completes successfully.
- `npm run lint` is not usable yet: it opens Next.js’s interactive ESLint setup because ESLint and its configuration are absent. No lint configuration was generated.
- No test accounts were used, no authenticated end-to-end workflow was run, and no Gemini request was sent. The current database’s account and project contents are therefore unknown.

## 2. QA environment and verification snapshot

| Check | Result | Notes |
|---|---|---|
| Next.js dev server | **Running on `http://localhost:3000`** | Restarted after clearing the stale generated output. Development output is isolated from production builds. |
| `/login`, `/signup`, `/admin`, `/project-request`, `/reviewer` | **HTTP 200** | Route responses verified after restart. The protected routes may redirect signed-out users to sign-in; this is not an authenticated workflow check. |
| FastAPI `/api/v1/health` | **HTTP 200** | API reports healthy. |
| FastAPI `/api/v1/ready` | **HTTP 200** | PostgreSQL connection reports `ok`. |
| Unauthenticated `/api/v1/admin/dashboard` | **HTTP 401** | Confirms the API rejects an unauthenticated dashboard request. |
| Docker API container | **Rebuilt and restarted** | PostgreSQL remained running; no database volume removal was performed. |
| Backend tests | **18 passed, 1 dependency warning** | Warning comes from the installed AnyIO pytest plugin using an alias deprecated for pytest 10. |
| Ruff (`app` and `tests`) | **Pass** | `python -m ruff check app tests`. |
| Frontend TypeScript | **Pass** | `npx.cmd tsc --noEmit`. |
| Frontend production build | **Pass** | `npm.cmd run build`; Next.js compiled, checked types, and generated routes. |
| Frontend lint script | **Not configured** | `npm.cmd run lint` launches an interactive ESLint setup and exits without a config. |
| Live Gemini request | **Not tested** | Key presence was checked without printing its value. Model/key validity, quota, and provider response were not verified. |
| Authenticated end-to-end flow | **Not tested** | No known test-account credentials were used; admin signup code is not configured. |
| Database contents | **Not inspected** | Readiness confirms connectivity, but this review did not query stored users, projects, or uploaded sources. |

The working tree is on `main` and has many uncommitted changes. At the time of the final repository check, `git status` reported 125 changed, deleted, or untracked paths. The report describes the current working tree; it is not a clean release or a committed snapshot.

## 3. Defects found and fixed during this QA pass

### Frontend generated-file collision

**Symptom:** Multiple frontend routes returned HTTP 500 with `Cannot find module './611.js'`. The running development server referenced a webpack chunk that had been replaced or removed by a production build in the shared `.next` directory.

**Fix:** `frontend/next.config.ts` now uses `.next-dev` in development and `.next` for production. The stale dev server was stopped, generated dev output was cleared, and the server was restarted on port 3000. A production build was then run while the dev server remained available; both route checks and build completed successfully.

### Reviewer error responses could become 500s

**Defect:** Inner `from fastapi import HTTPException` statements made `HTTPException` a local variable inside reviewer helper functions. For an existing transition with a reviewer mismatch or a closed review, execution could reference that local variable before it was assigned, producing `UnboundLocalError` instead of the intended 404 or 409.

**Fix:** Removed the redundant local imports. Regression tests now exercise the mismatched-reviewer and closed-review cases and verify proper HTTP errors.

### Pipeline status endpoint had an undefined name

**Defect:** The pipeline status handler called `require_transition_access` without importing it. An authenticated request to that endpoint could produce `NameError`.

**Fix:** Added the import and a regression test for an assigned reviewer’s pipeline status request.

### Avoidable database reads

Removed unused reviewer membership and project membership queries from the admin/reviewer listing paths. They did not contribute to the response and added database work.

### Multiple project-draft submissions could target the wrong request

**Defect:** Each draft upload form shared a callback that submitted the first draft found in the request list. If older or imported data contained multiple drafts, adding sources to a later draft could submit the wrong request.

**Fix:** The form now passes the specific request being uploaded to the submit handler, so the analysis request uses that draft’s own ID. The frontend production build and type check pass with this change.

## 4. Current product workflow

1. **Accounts:** Users sign up and sign in with role-based accounts: admin, team lead reviewer, departing member, and incoming member. Reviewer and incoming accounts can register a team name.
2. **Project request draft:** A departing member supplies a project name, owning team, and short description. The request and project records are stored in PostgreSQL. This is not an initial admin approval gate.
3. **Source submission:** The departing member uploads local documents and configures a public GitHub repository. They explicitly confirm that the saved material may be processed by Gemini free tier. The project request cannot be submitted until at least one source exists and the attestation has been recorded.
4. **Automatic analysis:** Submitting schedules an in-process FastAPI background task. It imports GitHub files, extracts and redacts document content, persists source records, asks Gemini for candidate claims, checks evidence and trust labels, and drafts questions for unresolved claims. The questions are tied to claims; proposed-solution documents can be included as context.
5. **Departing member responses:** The departing member answers AI-generated questions, can save drafts or indicate they do not know, and can answer clarification requests returned by the reviewer.
6. **Reviewer assignment and decision:** An admin assigns a registered reviewer, with project/team matching checks. The assigned reviewer can inspect evidence and history, approve/edit/reject claims, request more information, and publish a version only when every reviewable claim has a final review state. Claims flagged as conflicting or missing evidence require a note for approval.
7. **Incoming assignment:** After reviewer publication, the admin can assign a registered incoming user whose team matches the project. Incoming access expires after 30 days. Request-time access checks enforce expiry, and an in-process worker clears expired assignments.
8. **Published handover:** The incoming member sees the published claims, evidence, and sources allowed for their recipient role and can acknowledge receipt. Handover versions and audit events are persisted.

The background processing and expiry sweep run inside the API process. They are not durable jobs: a container restart can interrupt an active task, and multiple API replicas would need a shared queue/worker design for reliable scheduling.

## 5. Alignment with the proposed solution

No standalone product problem statement or proposed-solution PDF was found in the repository. The project PDFs are synthetic evidence-gap registers for the demo packs. This comparison therefore uses the workflow requirements the user described in the conversation; it is not a line-by-line review against an approved proposal document.

| Intended requirement | Current implementation | Assessment |
|---|---|---|
| Retain project context through a departure | Stores brief, uploaded/fetched source text, claims, evidence, responses, reviewer decisions, versions, and audit events. | **Aligned.** |
| Let the departing person submit a project, team, brief, and source material | Draft request UI and API support the fields, document upload, and public GitHub URL. | **Aligned.** |
| Use Gemini to correlate source material and propose claims/questions | Gemini is the configured live provider; selected text and project brief context are sent to it. Deterministic checks and human review remain separate. | **Mostly aligned.** Live provider behavior was not checked in this QA run. AI proposals are not proof. |
| Ask focused questions about conflicts, gaps, and proposed solution material | Question generation considers claim trust reasons, competing claims, missing artifacts, evidence, project brief, and selected uploaded solution/design documents. | **Aligned in code.** Limited to 12 unresolved claims/questions per handover. |
| Have a human team lead reviewer decide final claim/handover approval | Assigned reviewer controls claim decisions and final publication; audit and version records are created. | **Aligned.** Regression coverage now guards several reviewer error paths. |
| Let admin assign the handover to a matching new joiner | Admin assignment checks the incoming user’s registered team against the project team. | **Aligned.** Requires a registered incoming account. |
| Revoke onboarding access after a fixed period | 30-day expiry, background sweep, and access guards. | **Aligned in code.** Not time-advanced or multi-replica tested. |
| Ingest Slack exports | Slack support was removed. Example JSON remains in the packs but is not accepted by the API. | **Not aligned with the earlier three-source concept, by scope decision.** |
| Analyze all GitHub files, issues, PRs, and commits | Current connector fetches a bounded selection of supported text files from the default branch. | **Partially aligned.** It does not clone the full repository or call the Issues/PR/commit APIs. |
| Produce a project-specific 30-60-90 plan | The plan page and API have been removed from the current app. | **Not included in the current MVP.** |

## 6. MVP versus additional features

### MVP capabilities present

- Role-based account creation, sign-in, JWT sessions, and API authorization.
- Admin project dashboard, team tags/filters, reviewer assignment, and incoming assignment.
- Departing-member project request with team and description.
- Manual GitHub repository configuration and local document upload.
- PostgreSQL persistence for projects, transitions, sources, source records, claims, evidence, answers, decisions, versions, and audit events.
- Gemini-backed claim extraction and follow-up question drafting when live configuration works.
- Deterministic evidence checks, trust labels, conflict detection, clearance filtering, and reviewer-only publication.
- Leaver/reviewer clarification loop and answer draft handling.
- 30-day incoming access expiry and receipt acknowledgement.

### Extra or supporting functionality

- Claim search, filters, risk ordering, limited bulk approval, review history, and version history.
- Team-based reviewer and incoming matching.
- Dark/light themes, responsive layouts, and a source evidence side panel.
- Optional n8n workflow exports and internal API endpoints. The configured flow uses inline orchestration.
- Vector-search configuration exists but is disabled; semantic/vector retrieval is not active.

## 7. How the user-created fictional data is used

The three upload packs are stored under `demo-data/devops-team/`. They are **not automatically seeded, cached, or read from disk by the running website**. Backend startup runs migrations and does not create demo projects, users, claims, or sources. A user has to create a project request, upload the supported files, and publish the corresponding GitHub folder as a public repository before entering its repository URL.

| Pack | Sample source material | Example findings the pack is meant to exercise |
|---|---|---|
| `platform-infrastructure` | README, Terraform file, issue/PR drafts; architecture notes, checklist, DOCX brief, PDF gap register; Slack JSON. | Different module counts, production-apply ownership, migration status, and rollback evidence gaps. |
| `delivery-pipeline` | README, CI workflow, issue/PR drafts; runbook, release handoff, DOCX brief, PDF gap register; Slack JSON. | Disagreement about canary percentage, soak duration, promotion/rollback behavior, and approval evidence. |
| `observability-alerting` | README, alert configuration, issue/PR drafts; ownership notes, on-call notes, DOCX brief, PDF gap register; Slack JSON. | Alert-threshold disagreement, unclear first-response ownership, and escalation documentation gaps. |

The pack documentation describes the contents as invented. Keep them fictional if publishing them. The app does not currently associate a local pack folder with a project automatically; each upload is a user action.

### Ingestion behavior and limits

- **Documents:** API accepts `.md`, `.txt`, `.docx`, and text-based `.pdf` files, up to 10 MB each. Extracted text is stored in PostgreSQL. There is no OCR, so scanned PDFs may produce no usable text.
- **GitHub:** Public repositories only. Backend reads the repository’s default-branch file tree, selects at most 10 supported text files, caps each at 64 KB and the fetched total at 150 KB, and saves the extracted text with commit-pinned file links. It does not clone the repository. GitHub Issues, PRs, and commit activity are not fetched by this connector.
- **Slack JSON:** No Slack source kind is accepted. The pack JSON is reference-only; it is not uploaded or sent to Gemini. Any Slack-only contradiction will be absent from the app’s analysis.
- **Draft Markdown:** Issue/PR draft files are ordinary text files. They can be read if selected by the bounded repository-file importer; they do not create GitHub issue or pull-request records.
- **Gemini:** The app sends extracted selected text and the project brief context to the configured Gemini API during processing. It does not send raw PDF/DOCX binary files. Uploaded source text is persisted in PostgreSQL and secret-like content is redacted before storage. The user attestation is a per-request confirmation; it is not the organization’s legal or security approval to send real confidential data to a third party.

### Documentation mismatch to fix

`Backend/README.md` says the connector reads metadata, README, issues, pull requests, and commits. `demo-data/devops-team/README.md` and `UPLOAD_GUIDE.md` similarly describe GitHub API activity retrieval. The current `Backend/app/ingest/github.py` instead fetches a bounded set of text files. Update the docs or implement the missing GitHub API ingestion before describing issue/PR/commit data as supported.

## 8. Configuration and security notes

Only non-secret configuration status was inspected. The active local config reports `DEMO_MODE=false`, `LLM_MODE=live`, `LLM_MODEL=gemini-3.5-flash-lite`, inline orchestration, vector search disabled, a Gemini key present, no GitHub token, no Slack token, and no admin signup code. Credential values are not included in this report. A GitHub token is not required for the current public-only connector.

- Admin registration requires `ADMIN_SIGNUP_CODE`; it is not configured in the current local environment. Existing admin accounts may still work, but the database was not inspected.
- A manual `Backend/app/seed/reset_workspace.py` script exists. It deletes project/workflow data and all non-admin users and has a fallback password of `admin123`. It is not run at startup; do not run it against data you need to keep. Set an explicit password before any intentional demo reset.
- Passwords are hashed with the recommended password-hash library. The current signup rule is 6–8 characters, reflecting the earlier UI requirement. That limit is too weak for a real organization; use longer passphrases and appropriate account protections before production.
- JWT sessions expire after 30 minutes by default. No rate-limit, MFA, or account-recovery flow was verified in the reviewed code.
- Gemini output is untrusted. The backend verifies evidence references/excerpts and applies trust rules, but humans must still assess factual correctness and access level.
- No vector index is active. There is no private GitHub repository support. Slack export ingestion is absent.

## 9. Remaining risks and work

### Before calling this a complete demo MVP

1. **Run a real authenticated workflow with disposable accounts and synthetic data.** Verify departing signup/login, request creation, local file upload, public GitHub import, Gemini processing, leaver answers, reviewer assignment/review/publish, same-team incoming assignment, role-filtered handover, acknowledgement, and access expiry.
2. **Verify the live Gemini model/key and quota path.** Use only synthetic demo material. Confirm a successful extraction and question response, then confirm error/retry behavior without exposing credentials.
3. **Resolve admin bootstrap safely.** Provide a controlled first-admin path or set an invitation code. Do not rely on the destructive reset script for routine setup.
4. **Correct the GitHub README/upload-guide claims.** The current docs lead users to expect Issues/PRs/commits that the connector does not ingest.
5. **Configure a non-interactive frontend lint tool.** `npm run lint` currently prompts for initial ESLint setup rather than checking the code.

### Before production use

6. Replace in-process background tasks and expiry polling with durable job processing and shared scheduling.
7. Improve password strength controls and add appropriate protections such as MFA, throttling, and recovery flows.
8. Define organization approval, retention, deletion, and third-party AI processing policies before uploading non-synthetic material.
9. Decide whether private GitHub and Slack are in scope; both are currently unsupported.
10. Commit and review a clean release snapshot. The current branch has extensive uncommitted work and should not be treated as a release artifact.

## 10. Overall conclusion

**Problem/solution fit:** The implemented sequence substantially aligns with the user-described solution: departing-member source intake, Gemini-proposed claims/questions, human reviewer decisions, admin assignment, and controlled incoming handover. The original proposal PDF is absent, so precise requirement traceability against that document remains unavailable.

**MVP status:** This is a **demo MVP in active development**, not production-ready software. Core workflow pieces exist and the current code passes backend tests, lint, frontend typecheck, build, health/readiness, and primary route checks. The runtime and backend defects found in this QA pass have been corrected. A signed-in end-to-end run and live Gemini call are still needed before claiming that the entire workflow has passed acceptance.

**Demo-data status:** Your three synthetic packs are upload material, not application cache. Documents and selected public GitHub text enter the application only when uploaded/configured by a user. Slack JSON remains unused. The selected extracted text is persisted and sent to Gemini when processing is confirmed; keep real confidential or personal data out until the organization has approved that use.
