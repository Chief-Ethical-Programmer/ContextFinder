# Architecture

The API is the permission boundary. PostgreSQL stores normalized project, source, claim, and audit data. n8n is optional orchestration only; it never owns authorization. AI output will enter the proposed claim state and require deterministic verification plus human review before publication.
