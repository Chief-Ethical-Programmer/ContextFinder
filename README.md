# ContextFinder

**Evidence-led project handovers for teams in transition.** ContextFinder gathers knowledge from departing members, uses Gemini to propose evidence-backed claims and follow-up questions, and gives reviewers and administrators control over approval and onboarding assignments.

> The project packs in this repository are fictional. Use synthetic or organization-approved data only. The demo login below is for the current local database, not a hosted deployment.

## Features

- Departing members request a project, identify its owning team, add a brief, and submit project sources.
- The backend parses uploaded documents and selected public GitHub text files, then sends the extracted text and project brief to the configured Gemini model after the user confirms processing.
- Departing members answer generated questions. Administrators assign team lead reviewers; reviewers check evidence, can ask for more detail, and make the final review decision.
- After reviewer approval, administrators can assign a handover to an incoming member on the matching team.
- PostgreSQL stores accounts, projects, source records, claims, answers, reviews, and published handovers.

AI findings are proposals. Human review is required before a handover is published.

## Repository layout

| Path | Purpose |
| --- | --- |
| `frontend/` | Next.js web application |
| `Backend/` | FastAPI API, PostgreSQL schema and migrations, ingestion, and Gemini integration |
| `demo-data/devops-team/` | Three fictional project packs for manual upload |
| `render.yaml` | Render API and PostgreSQL deployment blueprint |

## Run the site locally

### Requirements

- Docker Desktop with Docker Compose
- Node.js and npm
- A Gemini API key for live analysis

### Start the API and database

1. Copy `Backend/.env.example` to `Backend/.env`.
2. Set `GEMINI_API_KEY` and a local `ADMIN_SIGNUP_CODE` in `Backend/.env`. Keep this file private; Git ignores it.
3. From the repository root, run:

   ```powershell
   docker compose -f Backend/docker-compose.yml up -d --build api
   ```

The API health check is at [http://localhost:8000/api/v1/health](http://localhost:8000/api/v1/health).

### Start the frontend

In another terminal:

```powershell
cd frontend
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). This is the local demo site; no hosted judge site has been deployed yet.

### Local demo administrator

The current local database has this demo account:

| Email | Password | Scope |
| --- | --- | --- |
| `admin@contextfinder.demo` | `admin123` | Current local demo database only |

The account is not created by a fresh checkout or hosted database. On a new database, set `ADMIN_SIGNUP_CODE`, open `/signup`, create an admin account, and then sign in. Never use the demo password on a hosted site.

## Demo projects and source links

Use one fictional source pack per project request. Each row lists the public GitHub source and documents to select from that pack's `documents/` directory.

| Project pack | Public GitHub source | Documents |
| --- | --- | --- |
| `platform-infrastructure` | [platform-infrastructure-demo](https://github.com/Chief-Ethical-Programmer/platform-infrastructure-demo) | `architecture.md`, `evidence-gap-register.pdf`, `handover-brief.docx`, `migration-checklist.txt` |
| `delivery-pipeline` | [delivery-pipeline-demo](https://github.com/Chief-Ethical-Programmer/delivery-pipeline-demo) | `evidence-gap-register.pdf`, `handover-brief.docx`, `release-handoff.txt`, `release-runbook.md` |
| `observability-alerting` | [observability-alerting-demo](https://github.com/Chief-Ethical-Programmer/observability-alerting-demo) | `alert-ownership.md`, `evidence-gap-register.pdf`, `handover-brief.docx`, `on-call-notes.txt` |

### Upload and review

1. Register or sign in as a departing member.
2. Request the project with its name, team, and short description.
3. Add the matching public GitHub URL and select files from that project's `documents/` folder. Confirm the source-processing notice and submit for analysis.
4. Answer the generated questions. An administrator assigns a registered team lead reviewer; the reviewer checks claims and evidence, requests more detail when needed, and approves the handover.
5. After reviewer approval, the administrator can assign the handover to an incoming member of the project team.

GitHub ingestion reads up to 10 supported text files from the repository's default branch, with a 64 KB per-file limit and 150 KB total limit. It does not read issue, pull-request, or commit history. Slack ingestion is not supported: the `slack-export/` JSON files in the demo packs are reference examples and are not uploaded or analyzed.

## Deploy a judge/demo site

### Render backend and database

1. Create a Render Blueprint from this GitHub repository at its root. Render uses `render.yaml` to create the API and PostgreSQL database.
2. Supply `GEMINI_API_KEY`, `ADMIN_SIGNUP_CODE`, and `FRONTEND_ORIGINS` when prompted. After Vercel creates the site URL, set `FRONTEND_ORIGINS` to that exact origin.
3. Use the configured admin signup code to create the first hosted administrator. The local demo account is not copied to Render.

### Vercel frontend

1. Import this repository and set the Vercel project Root Directory to `frontend`.
2. Set the server-side environment variable `BACKEND_API_URL` to the Render API URL ending in `/api/v1`, for example `https://your-api.onrender.com/api/v1`. Do not use a `NEXT_PUBLIC_` prefix.
3. Deploy the frontend, then update `FRONTEND_ORIGINS` in Render to the Vercel site origin.

The current document upload limit is 10 MB per file, but Vercel Functions have a smaller request-body limit; larger uploads can fail through the current proxy. Free hosting plans also have sleep, storage, and database-retention limits, so use this setup for a demo rather than production.

## Security

- Never commit `.env` files or put API keys in frontend environment variables.
- Rotate any Gemini key that has been shared in a chat, screenshot, issue, or other shared location before deployment.
- Do not use the demo admin password on a hosted service.
- The source packs are fictional; do not add real employee, customer, or confidential operational data to public repositories or send such data to Gemini without organizational approval.
