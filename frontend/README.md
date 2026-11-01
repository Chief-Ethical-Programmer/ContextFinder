# ContextFinder

ContextFinder is a frontend demo for project handovers. It keeps decisions, owners, risks and open questions connected to their source records, while making review status and access limits visible. All scenario data is synthetic.

## Run locally

Use Node.js 20 or newer. From this project directory, install dependencies and start Next.js:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Keep the terminal running while you use the app. The mock service layer lives in `lib/api`; it is the boundary to replace when connecting a backend. Demo actions are saved locally in the ignored `.contextfinder/demo-state.json` file, so transitions, reviews, versions, exit answers, publish state, acknowledgements and audit events survive page refreshes and local dev-server restarts. The last selected project is remembered in this browser. Delete `.contextfinder/demo-state.json` to restore the original synthetic seed data.

## Demo walkthrough

1. Open `/login`, choose **Admin**, **Departing member** or **New joinee**, and continue with any email and password.
2. On `/admin`, open the CloudCart item marked **Review**. In the reviewer workspace, search for Terraform and compare the Slack and repository evidence. The claim is marked **Conflicting** and cannot be bulk approved.
3. Open the rollback claim. It is marked **Missing evidence** because the referenced runbook is unavailable; no replacement citation is invented. Use **Ask for more** or leave it unresolved to see the publish gate.
4. Use the claim filters to review other trust labels and origins. Approve or reject a safe claim, edit a claim, and check the version history. Publishing becomes available only after blocking conflicts and missing-evidence claims are resolved.
5. Visit `/exit/cf-cloudcart-01` and save or submit an answer. Submitted answers appear as **Stated by leaver** claims and remain unverified until a reviewer checks them.
6. Publish the handover, then open `/onboarding/cf-cloudcart-01`. Switch among Technical successor, Project lead and New volunteer. Request access from a restricted view, open a claim’s evidence panel, and acknowledge the published version.
7. Open `/onboarding/cf-cloudcart-01/plan` for the recipient’s continuation plan and `/admin/audit` for the locally saved activity log.

## Routes

- `/login` — demo role selection and sign-in
- `/admin` — transition board
- `/admin/transitions/new` — configure a handover
- `/admin/transitions/[id]/review` — review, edit and publish claims
- `/admin/transitions/[id]/approved` — published handover and acknowledgement status
- `/admin/transitions/[id]/versions` — version history
- `/admin/audit` — mock activity log
- `/exit/[transitionId]` — departing member questions
- `/onboarding/[transitionId]` — role-filtered handover
- `/onboarding/[transitionId]/plan` — 30/60/90-day continuation plan

## Scope

Authentication, source integrations, AI extraction and orchestration are mocked. The local JSON store is intended for this demo only; it is not multi-user or suitable for production. This project does not connect to real GitHub, Slack, Drive, FastAPI, PostgreSQL or n8n services.
