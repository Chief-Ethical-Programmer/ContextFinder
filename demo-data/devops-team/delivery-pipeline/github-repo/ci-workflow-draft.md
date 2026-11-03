# Fictional CI/CD workflow description

This document describes a proposed demo flow. It is not an executable GitHub Actions workflow and cannot deploy anything.

1. Run unit checks and build a synthetic container image.
2. Deploy a 10% canary according to the README claim.
3. Observe a 15-minute latency window.
4. Promote automatically if green, according to the README claim.

The Slack export and operations runbook disagree with steps 2–4. Use this only as a synthetic claim source for review.
