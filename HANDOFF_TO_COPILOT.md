# ContextFinder real-source ingestion handoff

## Goal

Continue the ContextFinder Round 2 implementation so judges can provide real project information and complete the existing workflow:

**authorised sources → parsing and ingestion → Gemini 2.5 Flash extraction → evidence-backed claims → human review → publish / recipient view**

The user wants real GitHub, Slack, and document content instead of synthetic fixture output. Keep the current handover/review workflow and make file, parser, GitHub, and Gemini limits/errors understandable to users.

## Work in the correct project

The active project the user runs is:

```text
Repository root (`./`).
```

It has `backend` and `frontend` directories. Do not accidentally continue in the older `Codex implamentation` code copy. The handoff file itself is saved in that older workspace because that is the currently writable Codex workspace.

The project folder does not appear to be a Git repository. Read the current files before making changes; some work was interrupted and may be incomplete or inconsistent.

## Changes already saved in the active project

### Backend

The following files have edits related to real ingestion, limits, and errors:

- `backend/app/config.py` — defaults to `gemini-2.5-flash` / live mode; adds upload, expanded archive, source-record, total-character, and per-request chunk settings.
- `backend/.env.example` — documents live Gemini settings and processing limits; do not copy over the user's actual `.env`.
- `backend/app/schemas.py` and `backend/app/api/v1/foundation.py` — transition source configuration can store a GitHub repository identifier (not a user token).
- `backend/app/ingest/github.py` — replaced fixture fallback with bounded GitHub REST API ingestion for up to 100 PRs, issues, commits, and the README. Private repositories use the server-side `GITHUB_TOKEN`.
- `backend/app/services/ingestion.py` — removed automatic source fixture fallback; requires real selected/available source records and checks source count and text-size limits.
- `backend/app/ingest/slack_export.py` — accepts channel JSON and message arrays, and no longer invents synthetic Slack URLs.
- `backend/app/api/v1/ingestion.py` — handles file uploads, safe Slack ZIP extraction, size/file-count limits, parse errors, and failed pipeline status. It also attempts to roll back partial extraction results on failure.
- `backend/app/ingest/file_import.py` — adds a 500-page PDF limit.
- `backend/app/llm/gemini_client.py`, `backend/app/llm/provider.py`, `backend/app/services/extraction.py` — return clearer Gemini setup/quota/context/parsing errors, do not silently fall back to cached output in auto/live mode, and split source text into bounded requests.
- `backend/README.md` — describes real source ingestion and limits.

The database already has a JSONB source-connection config field, so these changes were intended not to require a migration.

### Frontend

- `frontend/lib/api/browser.ts` — adds multipart upload support and removes the fake “ingestion completed” localStorage fallback.
- `frontend/lib/api/client.ts` — passes the GitHub repository as source configuration.
- `frontend/app/api/transitions/[transitionId]/sources/upload/route.ts` — authenticated Next.js proxy for file uploads.
- `frontend/components/admin/transition-setup.tsx` — adds GitHub repository and Slack/document file input state, validation, upload calls, and actual pipeline start calls.
- `frontend/app/phase2.css` — styling for the new upload controls and errors.

## Known unfinished work

1. **Finish and inspect the UI source step.** The setup component was changed while the turn was interrupted. Confirm JSX syntax/format, the upload inputs, error presentation, file-selection behavior, and both light/dark/mobile styling.
2. **Fix retry behavior.** The UI stores a `createdTransitionId` so an upload/ingestion retry reuses the transition, but a failed GitHub repository value cannot currently be changed on that already-created transition. Add an authenticated backend + Next.js route to update GitHub repository config, or provide another safe retry design.
3. **Remove stale demo dashboard overlays.** `frontend/components/admin/admin-dashboard.tsx` merges localStorage transitions into backend dashboard data. Remove this merge so synthetic/stale browser records cannot appear beside real backend data.
4. **Return real transition names/details from the backend.** The transition API currently returns IDs but the frontend mapper falls back to “Departing member” / “Incoming member” and a default project name. Add project and member names (and useful claim counts/status) to dashboard/detail responses, then map those fields in `frontend/lib/api/client.ts`.
5. **Audit the frontend API boundary.** The frontend README says several service paths/screens still use mock state. Confirm the new source workflow, review page, evidence panel, audit, and recipient view load claims/evidence from the backend and do not silently show seeded/localStorage claims.
6. **Check parser and source behavior.** Confirm uploaded Slack ZIPs preserve channel paths and handle Slack export JSON files (including non-message metadata JSON) safely. Confirm malformed PDFs/DOCX produce a useful 4xx response and scanned PDFs are clearly identified.
7. **Check credential and access handling.** Never ask judges to paste GitHub tokens in the browser or persist them in source connection JSON. Public repositories should work without a token; private ones need a server-side read-only token. Confirm only authorized users can upload/start ingestion for the transition.
8. **Check failed pipeline retry/transaction behavior.** If Gemini fails after several chunks, partial claims must not remain and a retry must be possible. Keep uploaded records available when an extraction request fails.
9. **Rebuild/restart and verify.** The active Docker containers have not yet been rebuilt with the saved edits. After the code is complete, rebuild from the active `New codex\ContextFinder\backend` folder and restart the Next.js frontend from `New codex\ContextFinder\frontend`. Then verify API health, login, upload, start, claims, evidence links, and user-readable failure messages.

## Limits currently planned/implemented

- 10 MB maximum uploaded file.
- Slack ZIP: 50 MB expanded and 250 files.
- PDF: 500 pages.
- Document text: 200,000 extracted characters per document.
- Per handover: 2,000 source records and 500,000 extracted characters (roughly 125,000 tokens).
- Gemini request chunks: 12,000 characters with overlap.

Explain these as application safety/processing limits. Gemini 2.5 Flash's published input limit is 1,048,576 tokens; the app uses a smaller aggregate budget and bounded requests. Reference: [Gemini 2.5 Flash model documentation](https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash).

## Environment and operations

- Keep actual credentials in `backend/.env`; do not print, copy into this handoff, commit, or overwrite them.
- Gemini model: `gemini-2.5-flash`, using the Gemini REST API.
- Private GitHub access: backend-only read token in `GITHUB_TOKEN`.
- The user reported Docker Desktop is running and started Compose from `New codex\ContextFinder\backend`.
- The running containers still need rebuilding after implementation is complete. Provide the user the exact PowerShell commands and URLs afterward.

## Acceptance checklist

- [ ] A judge can create a handover and provide a public GitHub `owner/repo`.
- [ ] A judge can upload Slack JSON/ZIP and PDF/DOCX/TXT/MD documents.
- [ ] The application uses the uploaded/retrieved real content; it does not silently insert bundled source fixtures or cached claims.
- [ ] Secret redaction, source access labels, exact evidence excerpts, and human review remain in the workflow.
- [ ] Source links in claims use real URLs when supplied and never fabricated `*.synthetic` URLs.
- [ ] Oversized/unsupported/corrupt uploads, GitHub authorization/rate-limit failures, missing Gemini key, Gemini quota errors, and parsing/context failures show actionable explanations.
- [ ] Failed extraction leaves no partial claims and allows retry.
- [ ] Dashboard/review show backend names and records rather than stale local demo data.
- [ ] Backend and frontend builds complete, and the central workflow is demonstrated locally with Docker.
