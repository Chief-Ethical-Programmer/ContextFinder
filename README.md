# ContextFinder

**Evidence-led project handovers for teams in transition.** ContextFinder collects project knowledge from departing team members, uses Gemini to organize source evidence into proposed claims and questions, and gives human reviewers and administrators control over approval and handover.

> This repository's demo source packs contain fictional data. The local demo login below is intentionally simple; never reuse it for a hosted deployment or real organization.

## What it does

- Lets a departing member request a project, name its team, add a brief, and submit source material.
- Reads public GitHub repository activity and uploaded project documents, then asks Gemini to propose claims and follow-up questions.
- Lets a team lead or reviewer check claims, request more detail, and approve the handover.
- Lets an administrator assign reviewers and match approved handovers with incoming members by team.
- Stores application users, projects, source records, claims, reviews, and handovers in PostgreSQL.

AI results are proposals. A human reviewer makes the review decisions.

## Repository map

| Path | Contents |
| --- | --- |
| `frontend/` | Next.js web application |
| `Backend/` | FastAPI API, database models and migrations, GitHub/document ingestion, and Gemini processing |
| `demo-data/devops-team/` | Three fictional project packs for manual demo uploads |
| `render.yaml` | Render API and PostgreSQL deployment blueprint |
| `MVP_ROUND2_ALIGNMENT_REPORT.md` | MVP and requirements alignment report |
| `PROJECT_STATUS_REPORT.md` | Project status and known limitations |

## Run the demo locally

### Requirements

- Docker Desktop with Docker Compose
- Node.js and npm
- A Gemini API key for live analysis

### Start the backend

1. Copy `Backend/.env.example` to `Backend/.env`.
2. Set `GEMINI_API_KEY` to your key and set a local `ADMIN_SIGNUP_CODE` if creating an admin in a fresh database. Keep this `.env` file private; it is ignored by Git.
3. From the repository root, start PostgreSQL and the API:

   ```powershell
   docker compose -f Backend/docker-compose.yml up -d --build api
   ```

   The API health check is available at [http://localhost:8000/api/v1/health](http://localhost:8000/api/v1/health).

### Start the frontend

In a second terminal:

```powershell
cd frontend
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Demo administrator login

The reset local workspace currently has this administrator account:

| Email | Password | Use |
| --- | --- | --- |
| `admin@contextfinder.demo` | `admin123` | Local demo only |

A fresh database created from this repository does **not** automatically contain this account. For a fresh local setup, configure `ADMIN_SIGNUP_CODE` in `Backend/.env`, open `/signup`, create the administrator account, then sign in. The credentials above are not production credentials and are not provisioned by Render.

## Demo project packs

Each folder is a separate fictional DevOps project. It includes a `github-repo/` source pack, upload-ready files under `documents/`, and (for illustration only) a `slack-export/` JSON sample.

| Project folder | Public GitHub source | Demo topic | Documents to select |
| --- | --- | --- | --- |
| `demo-data/devops-team/platform-infrastructure/` | [platform-infrastructure-demo](https://github.com/Chief-Ethical-Programmer/platform-infrastructure-demo) | Terraform module migration, state ownership, and incomplete rollback evidence | `architecture.md`, `evidence-gap-register.pdf`, `handover-brief.docx`, `migration-checklist.txt` |
| `demo-data/devops-team/delivery-pipeline/` | [delivery-pipeline-demo](https://github.com/Chief-Ethical-Programmer/delivery-pipeline-demo) | CI/CD, canary rollout, and rollback behavior | `evidence-gap-register.pdf`, `handover-brief.docx`, `release-handoff.txt`, `release-runbook.md` |
| `demo-data/devops-team/observability-alerting/` | [observability-alerting-demo](https://github.com/Chief-Ethical-Programmer/observability-alerting-demo) | Alert thresholds, escalation, and service ownership | `alert-ownership.md`, `evidence-gap-register.pdf`, `handover-brief.docx`, `on-call-notes.txt` |

### Add the demo sources

1. Use the linked public GitHub repository for the selected pack and paste its URL or `owner/repository` in the project's source form. If you make your own copy, create a public repository and copy the contents of that pack's `github-repo/` directory into the repository root. The connector reads repository data such as its README, issues, pull requests, and commits; draft issue and pull-request descriptions in the pack do not create those GitHub records automatically.
2. In the departing-member workflow, create the project request with its project name, team, and brief. Select only the matching pack's files from its `documents/` directory. Do not mix project packs.
3. Submit the sources for analysis. Reviewers can examine the AI proposals and request more information from the departing member. The reviewer gives final review approval; the administrator handles assignment to an incoming member.
4. Follow [the demo upload guide](demo-data/devops-team/UPLOAD_GUIDE.md) for the full source-pack workflow.

**Slack ingestion is not currently supported.** The `slack-export/` JSON files are examples for reference only; do not select them as documents. All project pack contents are synthetic. Keep real Slack exports, private repositories, personal data, credentials, and confidential documents out of this public demo.

## Deploy a judge/demo site

### Render API and database

1. In Render, create a Blueprint using this GitHub repository and its root `render.yaml`.
2. Provide `GEMINI_API_KEY`, `ADMIN_SIGNUP_CODE`, and `FRONTEND_ORIGINS` when prompted. After Vercel creates the frontend URL, set `FRONTEND_ORIGINS` to that exact site origin.
3. Wait for the API health check to pass. Use the admin signup code to register the first hosted administrator; the local demo account above is not copied to the hosted database.

### Vercel frontend

1. Import this GitHub repository in Vercel and set **Root Directory** to `frontend`.
2. Add `BACKEND_API_URL` as a server-side environment variable with the Render API URL ending in `/api/v1`, for example `https://your-api.onrender.com/api/v1`. Do not prefix this variable with `NEXT_PUBLIC_`.
3. Deploy, then set the resulting Vercel origin in Render's `FRONTEND_ORIGINS` environment variable and redeploy the API.

Render free services can sleep when idle, and its free PostgreSQL databases expire after 30 days. Vercel Functions limit request bodies to 4.5 MB, while this app currently permits documents up to 10 MB; a file over Vercel's limit can fail during upload. These free tiers are for demos, not reliable production hosting. Vercel Hobby is for personal, non-commercial projects.

## Security before deployment

- Never commit `.env` files. Use the platform's secret environment settings for Gemini keys, signup codes, and database URLs.
- Rotate any Gemini API key that has been shared in a chat, issue, screenshot, or other public location before using it for deployment.
- Do not use `admin@contextfinder.demo` / `admin123` on any hosted instance.
- Upload only synthetic demo sources to a public GitHub repository or send them to Gemini. Do not use confidential company data in this demo.
