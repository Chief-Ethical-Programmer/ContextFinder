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

The GitHub connector reads a **public** repository's README, up to 50 pull requests, up to 50 issues, and up to 50 commits. It does not crawl every file in the repository. The `issue-drafts.md` and `pull-request-drafts.md` files are copy-ready descriptions: create those issues and pull requests in the public GitHub repository after you publish it if you want GitHub API records for them. Add a few meaningful commits as well. Do not put credentials in Git history.

## Deliberate demo findings

- Platform infrastructure disagrees about the number of migrated Terraform modules and who may run production applies; rollback evidence is incomplete.
- Delivery pipeline sources disagree about the canary percentage, soak time, and whether promotion/rollback is automatic; approval evidence is missing.
- Observability sources disagree about latency thresholds and the on-call owner; the escalation runbook is missing.

Use the upload guide before publishing or importing the packs.
