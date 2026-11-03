# Beacon Release — synthetic runbook

**Project:** Delivery Pipeline  
**Maintainer:** Alex  
**Successor:** Ryan  
**Team lead reviewer:** Priya

The demo release job builds an image, deploys a canary, checks request latency, and then waits for a release decision. The README says the canary is 10% for 15 minutes and promotion is automatic. The operations chat says the tested deployment was 5% for 30 minutes and promotion was manual. No workflow run is included to settle the disagreement.

Rollback is described here as a manual Helm rollback started by the release owner. Slack says automatic rollback is not wired. Another draft PR proposes automatic promotion. Treat each as a proposal until the project has a reviewed deployment record.

No production approval record, approval owner, or successful rollback test is included. Those are missing evidence, not proof that approval or rollback does not exist.
