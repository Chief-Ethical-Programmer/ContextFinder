# Fictional DevOps handover demo data

Everything in this folder is invented for a product demo. It contains no real people, customer data, company infrastructure, credentials, tokens, or private source code. Do not replace the placeholders with real operational details before publishing this folder.

There are three independent project packs:

1. `platform-infrastructure` — Terraform module migration and state ownership.
2. `delivery-pipeline` — CI/CD, canary rollout, and rollback behavior.
3. `observability-alerting` — alert thresholds, escalation, and service ownership.

Each pack contains a `github-repo` directory to publish as its own public repository, a `slack-export` directory containing fake Slack channel JSON for reference only, and a `documents` directory containing upload-ready documents. The packs deliberately include contradictory statements and evidence gaps so a reviewer has meaningful claims to resolve.

## Supported upload formats

The current ContextFinder upload flow supports public GitHub repositories and document files in `.md`, `.txt`, `.docx`, or `.pdf` formats. Slack ingestion has been removed; the fake Slack files in these packs are not uploaded or processed by the app.

## Important GitHub behavior

The GitHub connector reads up to 10 supported text files from the **public** repository's default branch, up to 64 KB per file and 150 KB total. It does not read issue, pull-request, or commit history. Keep the files at the repository root so they are among the files considered for ingestion. Do not put credentials in Git history.

## Deliberate demo findings

- Platform infrastructure disagrees about the number of migrated Terraform modules and who may run production applies; rollback evidence is incomplete.
- Delivery pipeline sources disagree about the canary percentage, soak time, and whether promotion/rollback is automatic; approval evidence is missing.
- Observability sources disagree about latency thresholds and the on-call owner; the escalation runbook is missing.

Use the demo project-pack section in the repository's root `README.md` for upload steps and the public GitHub source links.
