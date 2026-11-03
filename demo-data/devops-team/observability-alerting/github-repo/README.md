# Observability and Alerting (fictional demo)

> Synthetic training data for ContextFinder. No real monitoring endpoint or on-call schedule is included.

This repository represents `signal-watch`, a fictional Prometheus alert rules pack. The README says a page fires when checkout p95 latency exceeds 500 ms for 5 minutes. A service owner is expected to acknowledge the page and attach a dashboard link.

## Ownership and escalation

- Alex maintained the initial alert rules; Ryan is the incoming maintainer.
- Priya is the assigned team lead reviewer.
- The README implies Platform owns the first response. Slack suggests the SRE rotation owns paging and Platform handles only infrastructure failures.
- The escalation runbook and authoritative on-call mapping are missing.

The rule examples are deliberately non-deployable and use fictional service names.
