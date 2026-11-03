# Platform Infrastructure (fictional demo)

> Synthetic training data for ContextFinder. No production infrastructure is described here.

This repository owns the fictional `atlas-platform` Terraform stack for a small demo service. Terraform 1.8 is used. The stack has 11 reusable modules, and this handover says 9 have been migrated to the shared module layout. The remaining modules are `edge-cache` and `audit-store`.

## State and applies

- State is stored in a fictional S3 bucket named `demo-atlas-tfstate` in the `us-east-1` example region.
- A DynamoDB table named `demo-atlas-tflock` is described as the state lock.
- The GitHub Actions workflow runs `terraform plan` for pull requests.
- The current README says a platform admin manually runs production `terraform apply` after approval.
- The rollback procedure for a partially completed state migration has not been verified.

These statements intentionally conflict with the fake Slack export and runbooks. Treat them as claims to verify, not as real instructions.

## Repository layout

- `infra/` — harmless illustrative Terraform snippets; no deployable credentials or real account IDs.
- `issue-drafts.md` and `pull-request-drafts.md` — copy-ready fake GitHub activity for the demo. Create the issues and pull requests in GitHub if you want them returned by its API.

## Demo ownership

Alex is the departing infrastructure maintainer. Ryan is the incoming technical successor. Priya is the assigned team lead reviewer.
