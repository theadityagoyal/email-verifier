# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]
### Added
- Detailed contributing guidelines (CONTRIBUTING.md)
- Architecture Decision Records (ADRs) documenting key technical choices
- Data models documentation (DATA_MODELS.md)
- API reference documentation (API.md)
- Development guide (DEVELOPMENT_GUIDE.md)
- Troubleshooting guide (TROUBLESHOOTING.md)
- Security policy (SECURITY.md)
- License file (LICENSE)

### Changed
- Updated README.md to reflect current architecture (ThreadPoolExecutor + BackgroundTasks, removed Celery/Redis)
- Refactored executor utility into `backend/utils/executor.py`
- Added `backend/utils/email_utils.py` for helper functions
- Streamlined Docker Compose to only MySQL, backend, frontend services

### Fixed
- Fixed circular import by moving executor to separate utils module
- Corrected DATABASE_URL formatting issue with special characters in password
- Ensured Alembic migrations run on application startup via lifespan event
- Fixed widget Typos in frontend chart components

## [0.2.0] - 2024-06-20
### Added
- Background task processing using FastAPI BackgroundTasks + ThreadPoolExecutor (replacing Celery/Redis)
- External RDS MySQL integration for production-like testing
- API key authentication placeholder (to be implemented)
- Rate limiting middleware skeleton
- Structured logging via `backend/utils/logging.py`
- Comprehensive test suite for validators and email service
- Docker healthcheck for frontend (multi‑stage build)

### Changed
- Updated project structure docs in README
- Moved Celery related files to archive (`/archive/celery_*`) for reference
- Adjusted scoring thresholds documentation

### Fixed
- Fixed MySQL connection timeout under heavy load (increased pool_recycle)
- Fixed race condition in job status updates (added DB transaction isolation)
- Fixed frontend proxy misconfiguration causing 404 on API calls

## [0.1.0] - 2024-01-15
### Added
- Initial release with the following features:
  - Single email verification endpoint (`/verify-email`)
  - Bulk CSV upload with job tracking (`/bulk-upload`, `/jobs/{id}`)
  - Email list and domain analytics endpoints
  - Real‑time dashboard with charts
  - Docker Compose orchestration (MySQL, Redis, Celery, Flower, backend, frontend)
  - Core verification pipeline: syntax → DNS → MX → SMTP → disposable → role → catch‑all → score
  - Alembic migrations for schema management
  - Basic test suite for validators
  - README with Quick Start and API reference