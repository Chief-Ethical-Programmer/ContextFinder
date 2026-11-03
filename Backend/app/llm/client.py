from typing import Protocol

from app.llm.schemas import CandidateClaim, ChunkInput


class LLMClient(Protocol):
    async def extract_claims(self, chunk: ChunkInput) -> list[CandidateClaim]: ...

    async def write_exit_questions(self, cases: list[dict]) -> dict[str, str]: ...
