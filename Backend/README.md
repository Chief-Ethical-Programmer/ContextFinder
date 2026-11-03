# ContextFinder backend

FastAPI backend for the authenticated ContextFinder handover workflow. Migrations run at container startup. The API does not seed sample projects, transitions, claims, or source records; uploaded source data is stored in PostgreSQL.

## Local setup

1. Copy `.env.example` to `.env` and provide a strong `JWT_SECRET`, `GEMINI_API_KEY`, and an `ADMIN_SIGNUP_CODE` if registering a new admin.
2. Keep `DEMO_MODE=false` and `LLM_MODE=live` to disable demo login and use Gemini for source extraction.
3. Start PostgreSQL and the API with Docker Compose. PostgreSQL is exposed on host port `5433` by default.
4. Start the frontend in `../frontend` with `npm install` and `npm run dev`.

API documentation is available at `/docs`; readiness is available at `/api/v1/ready`.

## Accounts and access

Create accounts through the signup page and sign in through the login page. Admin registration requires `ADMIN_SIGNUP_CODE`. The demo-switch endpoint is disabled by default. Admins manage projects and assign reviewers; assigned reviewers can access only the transitions assigned to them.

## Source data and Gemini

Uploaded `.md`, `.txt`, `.docx`, or `.pdf` files are parsed into PostgreSQL. GitHub ingestion reads up to 10 supported text files from a public repository's default branch, with a 64 KB per-file limit and a 150 KB total limit. It does not ingest issues, pull requests, or commit history. Slack ingestion is not supported. When `LLM_MODE=live`, selected source text is sent to the configured Gemini model during extraction. Use only synthetic or approved material for the demo.

The fictional packs under `../demo-data/devops-team` are uploaded manually. They are not read or imported by API startup. Parser tests create temporary documents and do not depend on bundled seed projects.
