# Delivery Pipeline (fictional demo)

> Synthetic training data for ContextFinder. No production deployment system is described here.

This repository represents `beacon-release`, the fictional CI/CD setup for the Atlas demo service. Pull requests run unit checks and build a container image. The README says a GitHub Actions workflow deploys to a 10% canary, observes it for 15 minutes, and automatically promotes it when the latency check stays green.

## Release ownership

- Alex maintains the workflow and is handing it over to Ryan.
- The deployment uses a fictional Kubernetes namespace called `demo-release`.
- A reviewed rollback procedure and explicit production approval evidence are missing from this pack.
- Slack and the runbook disagree with the canary size, soak time, promotion behavior, and rollback owner.

## Safe demo scope

The names, workloads, and commands are invented. `ci-workflow-draft.md` describes the proposed flow; it is not an executable deployment workflow.
