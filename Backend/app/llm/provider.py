from app.config import get_settings
from app.llm.client import LLMClient
from app.llm.gemini_client import GeminiClient


def get_llm_client() -> LLMClient:
    settings = get_settings()
    if settings.llm_mode == "live":
        return GeminiClient()
    if settings.llm_mode == "auto":
        if settings.gemini_api_key:
            return GeminiClient()
        raise RuntimeError("Gemini is not configured. Add GEMINI_API_KEY or set LLM_MODE=live.")
    raise RuntimeError(f"Unsupported LLM_MODE: {settings.llm_mode}")
