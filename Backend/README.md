# ContextFinder backend

FastAPI backend for the ContextFinder knowledge handover demo.

## Local setup

1. Copy `.env.example` to `.env` and add secrets only locally.
2. Start the API and PostgreSQL with Docker Compose; migrations and deterministic seed data run automatically. PostgreSQL is exposed on host port `5433` by default to avoid colliding with a local PostgreSQL installation; set `POSTGRES_HOST_PORT` to change it.
3. For a host-run API, apply migrations, load the seed, and run Uvicorn manually.

API documentation is available at `/docs`; the OpenAPI contract is exported to `docs/openapi.json` after the API is running.

## Demo accounts

The seeded demo accounts all use the password `contextfinder-demo`:

- `admin@cloudcart.demo`
- `alex@cloudcart.demo`
- `ryan@cloudcart.demo`

The seed creates the CloudCart and Empty Team Demo projects, with Morgan as the CloudCart/Empty Team supervisor, Alex as its departing member, and Ryan as its incoming member. It does not create a transition automatically: sign in as admin and create one for CloudCart before running ingestion and review. There is no separate reviewer account; review actions are performed by the project admin.

The demo switch endpoint is available only when `DEMO_MODE=true`. The intended Round 2 deployment uses `ORCHESTRATOR=inline`; n8n remains optional. Docker startup applies migrations and loads synthetic seed data automatically. Enable the optional `n8n` Compose profile when needed.

## Phase status

Phase 1 provides the foundation, authentication, clearance helper, health/readiness endpoints, migrations, core project/transition endpoints, and CloudCart fixtures. Phase 2 adds fixture-backed GitHub ingestion, Slack/Drive/meeting-note parsing, secure uploads, secret redaction, duplicate skipping, and pipeline progress tracking. Phase 3 adds claim extraction, evidence validation, trust labels, conflict detection, access inheritance, Gemini support, and claim inspection endpoints. Phase 4 adds exit questions, reviewer actions, claim versioning, bulk-approval protection, and publish gates. Phase 5 adds permission-filtered role views, hidden-item counts, evidence access, access requests, and acknowledgements. Phase 6 adds protected n8n endpoints/workflows, structured errors, security headers, Docker startup automation, and the generated test report.

See `docs/ROUND3_COMMITMENTS.md` for the three planned improvements and `docs/TEST_REPORT.md` for the generated QA summary.

## Gemini configuration

Keep the replacement key only in a local `.env` file, never in `.env.example` or source code:

`GEMINI_API_KEY=...`

Use `LLM_MODEL=gemini-2.5-flash` and `LLM_MODE=auto`. With no key, the cached/fake path keeps the synthetic demo running.

## Source data and limits

GitHub reads a configured repository when available and otherwise falls back to the bundled synthetic fixture dataset. Slack, Drive, and meeting-note sources can be imported as supported file uploads. When uploaded records exist for one of those source types, the pipeline does not mix in that type's synthetic fixture records. With no upload for a configured source, its bundled synthetic fixture supports the demo. Uploading a source enforces a 10 MB limit, parses supported formats, redacts recognized secrets, and stores records with the configured access label. After uploading, start the transition pipeline to extract claims for review. An existing source connection cannot silently change its access label on a later upload.

Project, user, transition, upload, claim-review, publish, and recipient-view endpoints are API-backed. LocalStorage/browser state is not the persistence layer for these operations. Frontend screens must call the API with the bearer token and use the returned project/member/transition identifiers; synthetic seed data is provided for the demo.
