# ContextFinder

ContextFinder captures project knowledge during team transitions. Departing members submit project sources and answers; reviewers verify claims; administrators manage reviewer and incoming-member assignments; approved handovers are available to the assigned incoming member.

## Project layout

- `frontend/` — Next.js application. Set `BACKEND_API_URL` on the hosting platform to the backend URL ending in `/api/v1`.
- `Backend/` — FastAPI API, PostgreSQL models and migrations, ingestion, Gemini processing, and review workflow.
- `demo-data/` — synthetic source packs for manual demo uploads. These are not automatically imported into the database.
- `render.yaml` — Render blueprint for the API and a free PostgreSQL database.

## Run locally

1. Copy `Backend/.env.example` to `Backend/.env` and fill in the needed settings. Keep `.env` files out of Git.
2. Start PostgreSQL and the API with Docker Compose from the repository root:

   ```powershell
   docker compose -f Backend/docker-compose.yml up -d --build api
   ```

3. In a second terminal:

   ```powershell
   cd frontend
   npm ci
   npm run dev
   ```

4. Open `http://localhost:3000`.

## Deploy a demo

### Backend and database on Render

1. Push this repository to GitHub without committing any `.env` files.
2. In Render, create a Blueprint from the repository root. Render will read `render.yaml` and provision the API plus PostgreSQL.
3. Supply `GEMINI_API_KEY`, `ADMIN_SIGNUP_CODE`, and `FRONTEND_ORIGINS` when prompted. After Vercel gives you its deployment URL, set `FRONTEND_ORIGINS` to that origin, for example `https://your-app.vercel.app`.
4. After the API is healthy, sign up the first admin account using the configured admin signup code.

The Render API URL will look like `https://contextfinder-api.onrender.com`.

### Frontend on Vercel

1. Import the same GitHub repository as a Vercel project.
2. Set the project Root Directory to `frontend` and keep the Next.js framework preset and default build settings.
3. Add the server-side environment variable `BACKEND_API_URL=https://contextfinder-api.onrender.com/api/v1`, replacing the hostname with the URL Render assigned.
4. Deploy and then update `FRONTEND_ORIGINS` in Render with the Vercel origin.

The frontend proxies authenticated API requests through Next.js, so `BACKEND_API_URL` must be configured on Vercel and must not use a `NEXT_PUBLIC_` prefix.

## Free-tier constraints

This arrangement is suitable for a judge/demo deployment, not dependable production hosting. Render free web services spin down after 15 minutes idle and can take about a minute to wake. Free Render Postgres is limited to 1 GB, has no backups, and expires 30 days after creation. Vercel Hobby is limited to personal, non-commercial use.

Vercel Functions also cap request and response bodies at 4.5 MB. This app currently allows individual document uploads up to 10 MB through a Next.js API proxy, so uploads over Vercel's 4.5 MB limit will fail unless the app's upload flow is changed or those uploads use a direct-to-storage path.

Before deployment, rotate any Gemini API key that has been pasted into a chat, issue, or other shared location, then enter the replacement only in Render's environment settings. Never commit `Backend/.env` or put API keys in frontend environment variables.
