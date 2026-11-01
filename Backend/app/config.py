from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://contextfinder:contextfinder@localhost:5432/contextfinder"
    jwt_secret: str = Field("development-only-secret", min_length=16)
    jwt_expire_minutes: int = 30
    demo_mode: bool = True
    admin_signup_code: str | None = None
    orchestrator: str = "inline"
    llm_mode: str = "cached"
    llm_model: str = "claude-3-5-haiku-latest"
    anthropic_api_key: str | None = None
    gemini_api_key: str | None = None
    github_token: str | None = None
    github_repo: str | None = None
    n8n_service_token: str = "development-only-service-token"
    enable_vector_search: bool = False
    frontend_origins: str = "http://localhost:3000"

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.frontend_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
