import json
from datetime import datetime
from pathlib import Path

from app.ingest.common import IngestedRecord


def _timestamp(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def parse_slack_export(path: Path) -> list[IngestedRecord]:
    records: list[IngestedRecord] = []
    for file_path in sorted(path.rglob("*.json")):
        channel = file_path.parent.name
        payload = json.loads(file_path.read_text(encoding="utf-8"))
        if not isinstance(payload, list):
            continue
        for index, item in enumerate(payload):
            text = str(item.get("text", "")).strip()
            if not text:
                continue
            timestamp = str(item.get("ts", ""))
            records.append(
                IngestedRecord(
                    external_id=f"slack:{channel}:{timestamp or index}",
                    kind="message",
                    author=str(item.get("user", "")),
                    occurred_at=_timestamp(timestamp),
                    url=f"https://slack.synthetic/{channel}/{timestamp or index}",
                    text=text,
                    metadata={"channel": channel, "thread_ts": item.get("thread_ts")},
                )
            )
    return records
