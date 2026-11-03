# ContextFinder frontend

Next.js frontend for the authenticated ContextFinder API. Project, transition, evidence, claims, review actions, and audit activity are read from the backend and PostgreSQL; the frontend does not contain a demo workspace or local mock store.

## Run locally

Start PostgreSQL and the API from `../Backend`, then install frontend dependencies and start Next.js:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Authentication uses the backend account database. Admin registration requires an `ADMIN_SIGNUP_CODE`; set one in the local backend `.env` if you need to register a new admin.

## Upload synthetic source packs

The optional fictional packs are kept separately in `../demo-data/devops-team`. Read that folder's `UPLOAD_GUIDE.md`. They are not preloaded or used as cache. Upload the chosen public GitHub repository and supported project documents through a transition's source setup.

Only document `.md`, `.txt`, `.docx`, or `.pdf` files can be uploaded. GitHub ingestion reads the public repository README and the repository's live issues, pull requests, and commits. Slack ingestion is not supported.
