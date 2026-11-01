# ContextFinder test report

Generated: 2026-11-01T12:08:00.785551+00:00

## Automated checks

- Pytest result: `14 passed, 1 warning in 1.87s`
- Exit code: `0`
- Planted fixture cases: `6`
- Secret-redaction planted cases: `1`
- Offline fallback: covered by FakeClient and cached-mode tests

## Scope

The suite covers clearance inheritance, source parsing, secret redaction, prompt-injection handling, evidence/trust rules, review blocking, role filtering, and unpublished handover behavior.

## Limitations

This report does not claim a live PostgreSQL run unless the generated pytest result includes database integration tests. Live Gemini and n8n are optional and are not required for the deterministic demo path.
