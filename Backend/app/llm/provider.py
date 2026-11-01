from pathlib import Path

from app.config import get_settings
from app.llm.cached_client import CachedClient
from app.llm.client import LLMClient
from app.llm.fake_client import FakeClient
from app.llm.gemini_client import GeminiClient


def get_llm_client() -> LLMClient:
    settings = get_settings()
    if settings.llm_mode == "live":
        return GeminiClient()
    if settings.llm_mode == "cached":
        return CachedClient(Path(__file__).resolve().parents[2] / "seed" / "cached_llm")
    if settings.llm_mode == "auto":
        return GeminiClient() if settings.gemini_api_key else CachedClient(Path(__file__).resolve().parents[2] / "seed" / "cached_llm")
    return FakeClient()
