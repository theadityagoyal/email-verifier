# Architecture Decision Records (ADR)

## ADR-001: Replace Celery + Redis with ThreadPoolExecutor + FastAPI BackgroundTasks
**Status**: Accepted  
**Date**: 2024-06-20  
**Context**: The original design used Celery workers backed by Redis for asynchronous email verification jobs. This added operational complexity (separate worker containers, Redis instance, Flower monitoring) and increased resource usage for a moderate workload.  
**Decision**: Replace the Celery‑based task queue with an in‑process thread pool (`ThreadPoolExecutor`) managed via FastAPI’s `BackgroundTasks`.  
**Consequences**:  
- **Pros** – Simpler deployment (only MySQL, backend, frontend containers), reduced latency (no message broker hop), easier debugging (single process logs). **Cons** – Limited horizontal scalability (max workers fixed per instance), no built‑in retry or delay mechanisms, loss of centralized monitoring UI (mitigated by custom endpoints and logs).  
**Mitigations**: Configurable `max_workers` (default 20) – can be increased for higher throughput; retry logic can be added inside the task function if needed; monitoring via `/dashboard/stats` and application logs.

## ADR-002: Use External Managed RDS for MySQL in Development & Production
**Status**: Accepted  
**Date**: 2024-06-20  
**Context**: Initially the project relied on a local MySQL container via Docker Compose. For closer parity with production and to avoid managing DB backups/patches locally, an externally hosted Amazon RDS MySQL instance is used.  
**Decision**: Set `DATABASE_URL` in `backend/.env` to point to the RDS instance. Keep the MySQL service in `docker-compose.yml` only for users who want a fully local stack (commented out by default).  
**Consequences**: **Pros** – Consistent schema, backup strategy, and connection handling across environments; developers can test against a real managed DB. **Cons** – Requires network access to AWS and valid credentials; local-only workflow slightly slower due to remote DB latency.  
**Mitigations**: Provide a `docker-compose.local.yml` (or comment) that spins up a local MySQL for isolated offline work.

## ADR-003: Adopt Pydantic Settings (`BaseSettings`) for Configuration Management
**Status**: Accepted  
**Date**: 2024-06-20  
**Context**: Configuration was previously scattered across environment variables read manually via `os.getenv`.  
**Decision**: Use `pydantic_settings.BaseSettings` (via `pydantic-settings` package) in `backend/utils/config.py` to load, validate, and provide typed settings.  
**Consequences**: **Pros** – Centralized validation, auto‑casting (e.g., bool, int), .env file support, ease of testing via overriding values. **Cons** – Introduces a lightweight dependency (`pydantic-settings`).  
**Impact**: Simplifies adding new config values and ensures fail‑fast on missing/invalid variables.

## ADR-004: Keep Database Migrations with Alembic, Auto‑generate on Model Change
**Status**: Accepted  
**Date**: 2024-06-20  
**Context**: The project uses SQLAlchemy 2.0 ORM. Schema changes need to be versioned and applicable across environments.  
**Decision**: Continue using Alembic; migrations are auto‑generated via `alembic revision --autogenerate` and applied automatically at startup (`alembic upgrade head`) within the FastAPI lifespan event.  
**Consequences**: **Pros** – Guarantees DB schema matches code; enables rollback/downgrade if needed. **Cons** – Requires discipline to keep model changes migration‑friendly (no destructive drops without care).  
**Mitigations**: Review generated migration scripts before applying; test migrations on a copy of production data in staging.

## ADR-005: Frontend Stack: React 18 + Vite + Tailwind CSS + Recharts + TanStack Query
**Status**: Accepted  
**Date**: 2024-06-20  
**Context**: Needed a modern, fast‑reactive dashboard with charting and data‑fetching capabilities.  
**Decision**: Use Vite for blazing‑fast HMR and build, React 18 for concurrent features, Tailwind for utility‑first styling, Recharts for chart components, and TanStack Query (React Query) for server state management.  
**Consequences**: **Pros** – Excellent developer experience, small bundle size, strong community support. **Cons** – Requires familiarity with the ecosystem; CSS utility‑first approach may need adjustment for teams used to CSS‑in‑JS.  
**Mitigations**: Provide component library documentation (`src/components/`) and clear styling guidelines.

## ADR-006: API Versioning via URL Prefix (`/api/v1/`)
**Status**: Accepted  
**Date**: 2024-06-20  
**Context**: To allow future backward‑incompatible changes without breaking existing clients.  
**Decision**: Prefix all API routes with `/api/v1/` using an `APIRouter`.  
**Complications**: None significant; clients must update their base URL when a new version is introduced.  
**Policy**: Increment version only when breaking changes are made; maintain backward compatibility within a version via additive endpoints or optional fields.

## ADR-007: Docker‑Compose Production Profile (Minimal Services)
**Status**: Accepted  
**Date**: 2024-06-20  
**Context**: The original compose file included Redis, Celery worker, and Flower services, which are unnecessary after switching to thread‑pool execution.  
**Decision**: Strip `redis`, `worker`, and `flower` services from `docker-compose.yml`. Keep `mysql`, `backend`, and `frontend`. Optionally keep commented‑out service blocks for reference.  
**Consequences**: **Pros** – Lower resource footprint, faster start‑up, simpler monitoring. **Cons** – Lose built‑in Flower UI; replaced by internal endpoints and logs.  
**Mitigations**: Provide admin endpoints for queue depth inspection if needed later.

## ADR-008: Use Self‑Signed / Local Certificates for Development HTTPS (Optional)
**Status**: Proposed  
**Date**: 2024-06-20  
**Context**: Some features (e.g., Service Workers, certain browser APIs) require HTTPS even locally.  
**Decision**: For local dev, rely on HTTP; if HTTPS needed, use `mkcert` or Docker‑compose overrides to add Traefik/Caddy termination. Not enforced in baseline.  
**Consequence**: Keeps setup simple; teams needing HTTPS can add a reverse‑proxy layer without changing app code.

--- 
*These ADRs capture the key architectural choices made during the project’s evolution. Re‑ever a significant change is proposed.*