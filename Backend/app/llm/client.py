from typing import Protocol

from app.llm.schemas import CandidateClaim, ChunkInput, ClaimLite, RoleViewDraft


class LLMClient(Protocol):
    async def extract_claims(self, chunk: ChunkInput) -> list[CandidateClaim]: ...

    async def write_exit_question(self, claim: ClaimLite) -> str: ...

    async def write_role_view(self, claims: list[ClaimLite], role: str) -> RoleViewDraft: ...
