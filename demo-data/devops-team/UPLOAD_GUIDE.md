# Publish and upload the demo packs

## 1. Create three public GitHub repositories

Create one empty public repository per `github-repo` folder using the matching project slug as its name. Upload that folder's contents to the repository root. For example, the README in `platform-infrastructure/github-repo` should become the public repository's root `README.md`.

The GitHub connector only accepts public repositories. In ContextFinder, enter `your-github-name/platform-infrastructure` (and the equivalent name for each other pack). Do not add a GitHub token for these public demo repositories.

For realistic GitHub evidence, create the issues described in each `issue-drafts.md`, open the pull requests described in `pull-request-drafts.md`, and make a few small commits. Those files are drafts; uploading them does not create GitHub issues or pull requests automatically.

## 2. Upload the project documents

Select the matching `.md`, `.txt`, `.docx`, or `.pdf` files from that project's `documents` directory. Do not mix packs between transitions; each pack is internally labeled with its project name. Slack sample JSON files are retained as reference material only and are not accepted by the app.

## 3. Run a separate handover for each project

Create one transition per pack, select that pack's public GitHub repository and local documents, then run ingestion. Repeat for all three projects. A reviewer should compare each AI proposal with the attached source evidence, resolve conflicts, ask the leaver for missing context when useful, and publish only after the review is complete.

The app currently requires the project, departing member, and incoming member to already exist in its database before a transition can be created. This folder is source material; it does not create app users or project memberships.

## Safe publishing checklist

- Keep the files exactly fictional; do not add real credentials, internal hostnames, real Slack exports, or private repository links.
- Read the public repository README and issue/PR text before publishing.
- Keep all GitHub repositories public only if you are comfortable with these synthetic contents being public.
- Gemini receives the selected source text when you run the app's extraction flow. The demo packs contain only invented information.
