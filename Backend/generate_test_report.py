import json
import subprocess
from datetime import UTC, datetime
from pathlib import Path

root = Path(__file__).parent
result = subprocess.run(["python", "-m", "pytest", "-q", "-p", "no:cacheprovider"], cwd=root, capture_output=True, text=True, check=False)
summary = result.stdout.splitlines()[-1] if result.stdout else "No pytest output"
planted = json.loads((root / "seed" / "planted.json").read_text(encoding="utf-8"))["cases"]
redaction_cases = sum(1 for case in planted if case["kind"] == "secret")
report = f"""# ContextFinder test report

Generated: {datetime.now(UTC).isoformat()}

## Automated checks

- Pytest result: `{summary}`
- Exit code: `{result.returncode}`
- Planted fixture cases: `{len(planted)}`
- Secret-redaction planted cases: `{redaction_cases}`
- Offline fallback: covered by FakeClient and cached-mode tests

## Scope

The suite covers clearance inheritance, source parsing, secret redaction, prompt-injection handling, evidence/trust rules, review blocking, role filtering, and unpublished handover behavior.

## Limitations

This report does not claim a live PostgreSQL run unless the generated pytest result includes database integration tests. Live Gemini and n8n are optional and are not required for the deterministic demo path.
"""
(root / "docs" / "TEST_REPORT.md").write_text(report, encoding="utf-8")
print(report)
raise SystemExit(result.returncode)
