import hashlib
import json
from pathlib import Path

from app.llm.fake_client import FakeClient
from app.llm.schemas import CandidateClaim, ChunkInput, ClaimLite, RoleViewDraft


class CachedClient:
    def __init__(self, root: Path):
        self.root = root
        self.fallback = FakeClient()

    def _path(self, chunk: ChunkInput) -> Path:
        digest = hashlib.sha256(chunk.model_dump_json().encode()).hexdigest()
        return self.root / f"{digest}.json"

    async def extract_claims(self, chunk: ChunkInput) -> list[CandidateClaim]:
        path = self._path(chunk)
        if not path.exists():
            return await self.fallback.extract_claims(chunk)
        payload = json.loads(path.read_text(encoding="utf-8"))
        return [CandidateClaim.model_validate(item) for item in payload]

    async def write_exit_question(self, claim: ClaimLite) -> str:
        return await self.fallback.write_exit_question(claim)

    async def write_role_view(self, claims: list[ClaimLite], role: str) -> RoleViewDraft:
        return await self.fallback.write_role_view(claims, role)
