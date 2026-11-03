from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://contextfinder:contextfinder@localhost:5432/contextfinder"
    jwt_secret: str = Field("development-only-secret", min_length=16)
    jwt_expire_minutes: int = 30
    demo_mode: bool = False
    admin_signup_code: str | None = None
    llm_mode: str = "live"
    llm_model: str = "gemini-3.5-flash-lite"
    anthropic_api_key: str | None = None
    gemini_api_key: str | None = None
    github_token: str | None = None
    github_repo: str | None = None
    enable_vector_search: bool = False
    frontend_origins: str = "http://localhost:3000"

    @property
    def async_database_url(self) -> str:
        if self.database_url.startswith("postgres://"):
            return "postgresql+asyncpg://" + self.database_url.removeprefix("postgres://")
        if self.database_url.startswith("postgresql://"):
            return "postgresql+asyncpg://" + self.database_url.removeprefix("postgresql://")
        return self.database_url

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.frontend_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
