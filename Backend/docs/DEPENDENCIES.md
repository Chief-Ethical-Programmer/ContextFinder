# Dependencies

- FastAPI, Pydantic, Uvicorn: HTTP API and validation
- SQLAlchemy async, asyncpg, Alembic: PostgreSQL persistence and migrations
- python-jose, pwdlib: JWT and password hashing
- pypdf, python-docx: authorised PDF and DOCX text extraction
- google-genai: optional Gemini provider integration for Phase 3
- PostgreSQL 16: relational storage

Gemini is optional; `LLM_MODE=auto` falls back to cached/fake extraction when no key is configured or the provider is unavailable.

Phase 4 review and publishing does not require a live LLM.
