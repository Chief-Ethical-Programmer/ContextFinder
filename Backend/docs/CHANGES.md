# Round 2 changes

- Phase 1 uses `ORCHESTRATOR=inline` as the reliable default so the demo does not depend on n8n.
- Phase 1 models the core foundation tables; workflow-specific tables will be added with their corresponding implementation phases.
- pgvector is optional and disabled by default for the small synthetic demo dataset.
- Phase 2 uses fixture-backed GitHub ingestion when live GitHub is unavailable, plus local document and meeting-note importers. Slack ingestion was removed.
- Secrets are redacted before source records are stored; archive uploads and unsafe filenames are rejected.
- Phase 3 adds provider-agnostic extraction with Gemini 2.5 Flash support, deterministic fallback, evidence validation, trust labels, access inheritance, and conflict pairs.
- Phase 4 adds exit-question answers, reviewer actions, immutable claim history, bulk approval protection, and publish gates.
- Phase 5 adds stored role views, caller-derived clearance filtering, hidden-item counts, evidence access, access requests, and idempotent acknowledgements.
- Phase 6 uses inline orchestration by default and ships optional n8n workflow exports, protected internal endpoints, Docker migration/seed startup, structured errors, security headers, and a generated test report.
