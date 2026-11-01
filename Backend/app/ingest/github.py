import json
from datetime import datetime
from pathlib import Path

import httpx

from app.config import get_settings
from app.ingest.common import IngestedRecord


class GitHubConnector:
    def __init__(self, fixture_root: Path):
        self.fixture_root = fixture_root

    def fixture_records(self) -> list[IngestedRecord]:
        records: list[IngestedRecord] = []
        terraform = self.fixture_root / "cloudcart.tf"
        if terraform.exists():
            records.append(IngestedRecord("github:file:cloudcart.tf", "doc", terraform.read_text(encoding="utf-8"), metadata={"path": "cloudcart.tf"}))
        prs = self.fixture_root / "pull_requests.json"
        for item in json.loads(prs.read_text(encoding="utf-8")) if prs.exists() else []:
            records.append(
                IngestedRecord(
                    external_id=f"github:pr:{item['id']}",
                    kind="pr",
                    author=item.get("author", ""),
                    text=f"{item.get('title', '')}\n{item.get('body', '')}".strip(),
                    url=f"https://github.synthetic/cloudcart/pull/{item['id']}",
                    metadata={"merged": item.get("merged", False)},
                )
            )
        for filename, kind in (("commits.json", "commit"), ("issues.json", "issue")):
            records_path = self.fixture_root / filename
            for item in json.loads(records_path.read_text(encoding="utf-8")) if records_path.exists() else []:
                records.append(
                    IngestedRecord(
                        external_id=f"github:{kind}:{item['id']}",
                        kind=kind,
                        author=item.get("author", ""),
                        text=f"{item.get('title', '')}\n{item.get('body', '')}".strip(),
                        url=item.get("url"),
                        metadata={"status": item.get("status")},
                    )
                )
        return records

    async def live_records(self) -> list[IngestedRecord]:
        settings = get_settings()
        if not settings.github_repo:
            raise RuntimeError("GITHUB_REPO is not configured")
        headers = {"Accept": "application/vnd.github+json"}
        if settings.github_token:
            headers["Authorization"] = f"Bearer {settings.github_token}"
        async with httpx.AsyncClient(timeout=10, headers=headers) as client:
            response = await client.get(f"https://api.github.com/repos/{settings.github_repo}/pulls", params={"state": "all", "per_page": 100})
            response.raise_for_status()
            return [
                IngestedRecord(
                    external_id=f"github:pr:{item['id']}",
                    kind="pr",
                    author=item.get("user", {}).get("login", ""),
                    occurred_at=datetime.fromisoformat(item["created_at"]),
                    url=item.get("html_url"),
                    text=f"{item.get('title', '')}\n{item.get('body') or ''}".strip(),
                    metadata={"state": item.get("state"), "merged": item.get("merged_at") is not None},
                )
                for item in response.json()
            ]

    async def records(self) -> tuple[list[IngestedRecord], str]:
        try:
            return await self.live_records(), "live"
        except (httpx.HTTPError, RuntimeError, KeyError, ValueError):
            return self.fixture_records(), "fixture"
