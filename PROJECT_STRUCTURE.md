# EmailVerifier Pro — Project Structure Documentation

## Overview

EmailVerifier Pro is a **single-tenant, production-grade email verification SaaS**. It provides:

- Single & bulk email verification pipelines (syntax → DNS → MX → SMTP → disposable/role/catch-all → scoring)
- A developer-facing **external API** with API key authentication + rate limiting
- An internal **dashboard** (analytics, domain reputation, email list, bulk job management)
- **In-app notifications** and **cooperative bulk-job cancellation**
- An **admin panel** for managing external API keys

**Stack:** FastAPI (async SQLAlchemy + sync SQLAlchemy for background workers) · MySQL 8.0.x · Alembic · React/Vite · Tailwind CSS · Framer Motion · TanStack Query · Docker Compose.

**Background processing:** `ThreadPoolExecutor` (NOT Celery/Redis — despite what `aws-deployment.md`'s "Phase 2" architecture describes).

---

## Root Directory

```text
email-verifier/
├── backend/                    # FastAPI application (see below)
├── frontend/                   # React/Vite dashboard (see below)
├── docker-compose.yml          # Orchestrates backend + frontend containers
├── README.md                   # Project overview, setup, API reference
├── PROJECT_STRUCTURE.md        # This file
├── GIT_CLEANUP_SUMMARY.md      # Historical record of a repo hygiene pass
├── aws-deployment.md           # AWS EC2 + Docker Compose + RDS deployment guide
└── .gitignore
```

---

## Backend Structure (`backend/`)

```text
backend/
├── api/
│   ├── v1/                                  # Internal dashboard API — mounted at /api/v1
│   │   ├── router.py                        # Aggregates all v1 routers
│   │   └── endpoints/
│   │       ├── verify.py                    # POST /verify-email — single email verification
│   │       ├── bulk.py                      # Bulk upload, job list/status/cancel/delete/export
│   │       ├── dashboard.py                 # Dashboard stats, trends, /emails, /domains (list+export+delete)
│   │       ├── admin.py                     # Admin login + API key CRUD/usage (requires X-Admin-Token)
│   │       └── notifications.py             # In-app notification list/read/delete endpoints
│   │
│   └── external/v1/                         # External developer API — mounted at /api/external/v1
│       ├── router.py                        # Aggregates external routers
│       ├── dependencies.py                  # get_api_key (X-API-Key auth), rate_limit_verify, rate_limit_bulk
│       └── endpoints/
│           ├── verify.py                    # POST /verify — single email verification (API-key gated)
│           └── bulk.py                      # POST /bulk, GET /jobs/{id}, GET /jobs/{id}/export
│
├── migrations/                               # Alembic migrations (script_location in alembic.ini)
│   ├── env.py                                # Loads DATABASE_URL from Settings, target_metadata = Base.metadata
│   ├── script.py.mako                        # Migration file template
│   └── versions/
│       ├── 0001_initial.py                              # emails, domains, jobs tables
│       ├── 755992d1fcc0_add_columns_for_bulk_upload_redesign.py   # job stages, email.job_id, unique indexes
│       ├── d0739350dd1a_add_columns_for_job_stages_and_email_status.py  # no-op placeholder revision
│       ├── a1e5f9c3b7d2_add_api_keys.py                 # api_keys table (external API auth)
│       ├── b7c3e91f4a2d_add_missing_indexes.py           # indexes declared in models.py but never migrated
│       ├── c2f8a4d91e3b_add_api_key_usage_logs.py        # api_key_usage_logs table (admin usage chart)
│       └── f3a9c1d7e5b2_add_notifications_and_job_cancellation.py  # notifications table + jobs.cancel_requested
│
├── models/
│   ├── database.py                           # Async/sync engines, AsyncSessionLocal/SyncSessionLocal, get_db()
│   └── models.py                              # SQLAlchemy ORM: Email, Domain, Job, ApiKey, ApiKeyUsageLog, Notification
│
├── schemas/
│   └── schemas.py                             # All Pydantic request/response models (verify, jobs, dashboard, admin, notifications)
│
├── services/                                  # Business logic layer
│   ├── email_service.py                       # Core async verification pipeline (verify_email())
│   ├── domain_service.py                      # Atomic upsert (INSERT...ON DUPLICATE KEY UPDATE) for Email/Domain rows — single source of truth for persistence, used by both async (FastAPI) and sync (bulk worker) paths
│   ├── notification_service.py                # Centralized notification creation (async_create_notification / sync_create_notification)
│   └── s3_service.py                          # Optional S3 upload/download/presigned-URL helpers (boto3)
│
├── tasks/
│   └── bulk_processor.py                      # ThreadPoolExecutor-based bulk job runner: per-email verify, job counters/progress/ETA, cooperative cancellation (polls Job.cancel_requested every 10 completions)
│
├── validators/                                 # Pure validation logic, no DB access
│   ├── syntax_validator.py                     # RFC-ish syntax rules + role-based account detection
│   ├── dns_validator.py                        # Domain existence + MX/SPF/DMARC lookups (sync + async wrappers), retry-on-timeout
│   ├── smtp_validator.py                       # Live SMTP RCPT probe (deliverability + catch-all detection)
│   ├── disposable_checker.py                   # Disposable domain detection — hardcoded fallback list + live-fetched list (24h cache, background refresh)
│   └── score_calculator.py                     # TRUSTED_DOMAINS list, username-quality heuristics, calculate_score(), determine_status()
│
├── utils/
│   ├── config.py                               # Pydantic Settings — DB, AWS, SMTP, disposable-list, CORS, admin password
│   ├── logging.py                              # structlog configuration (console in dev, JSON in prod)
│   ├── timezone.py                             # utc_now_naive() — single source of truth for all DB timestamps (UTC, naive)
│   ├── email_utils.py                          # detect_email_column() — auto-detects the email column in an uploaded file
│   ├── file_utils.py                           # read_upload_file() — shared CSV/Excel reader with encoding fallback + malformed-CSV recovery
│   ├── executor.py                             # Global ThreadPoolExecutor lifecycle (init/get/shutdown) for SMTP + bulk work
│   ├── api_key.py                              # generate_api_key() / hash_api_key() — SHA-256, plaintext shown once
	│   ├── admin_auth.py                           # Stateless signed admin token (HMAC, 24h validity) for the admin dashboard
│   ├── rate_limiter.py                         # In-memory fixed-window RateLimiter (per-process; verify + bulk limiters)
│   └── usage_logger.py                         # Best-effort external-API call logging → api_key_usage_logs
│
├── scripts/
│   └── manage_api_keys.py                      # CLI: create/list/revoke/activate external API keys (source of truth before admin UI existed)
│
├── tests/                                       # Pytest suite (pytest-asyncio, pytest-mock)
│
├── main.py                                      # FastAPI app: lifespan (executor init, DB check, weak-config warnings), CORS, request-timing middleware, global exception handler, routers, /health
├── entrypoint.sh                                # Container boot: create DB if missing → alembic upgrade head → uvicorn
├── Dockerfile                                   # python:3.12-slim + MySQL client libs
├── requirements.txt                             # FastAPI, SQLAlchemy, Alembic, aiomysql/pymysql, boto3, pandas, structlog, dnspython, etc.
├── alembic.ini                                  # script_location = migrations
├── pytest.ini
├── .env.example                                 # Template for all environment variables
└── .dockerignore
```

### Key backend architectural notes

- **Two parallel API surfaces**: `/api/v1/*` (internal, no auth — used by the React dashboard) and `/api/external/v1/*` (external, `X-API-Key` header + per-key rate limits).
- **Two DB session flavors coexist by design**: async sessions (`AsyncSessionLocal`) for FastAPI request handlers, sync sessions (`SyncSessionLocal`) for `ThreadPoolExecutor` background workers. Never mix them.
- **`domain_service.py` is the single source of truth** for writing `Email`/`Domain` rows — replaced three previously-inconsistent, race-prone implementations. Uses MySQL `INSERT ... ON DUPLICATE KEY UPDATE ... VALUES()` syntax (MySQL 8.0.x specific — not `AS new` alias syntax).
- **Notifications** (`notification_service.py`) and **usage logging** (`usage_logger.py`) are both best-effort — failures are logged and swallowed, never break the primary request/job.
- **Bulk cancellation** is cooperative: `POST /jobs/{id}/cancel` only flips `Job.cancel_requested`; the worker polls it (fresh isolated session each check, to avoid SQLAlchemy snapshot staleness) and stops queuing new work, letting in-flight verifications finish naturally.

---

## Frontend Structure (`frontend/`)

```text
frontend/
├── public/
│   └── favicon.ico
│
├── src/
│   ├── components/
│   │   ├── bulk/                             # Bulk Upload page components
│   │   │   ├── UploadZone.jsx                 # Persistent drag-and-drop + selected-file preview card
│   │   │   ├── TopStatsRow.jsx                # Total Uploads / Emails Processed / Completed / Active stat cards
│   │   │   ├── HistoryToolbar.jsx             # Date/status filters, search, sort for job history
│   │   │   ├── HistoryPagination.jsx
│   │   │   ├── JobCard.jsx                    # Single job row (progress, stats, cancel/retry/delete, export link)
│   │   │   ├── JobActionsMenu.jsx             # Copy Job ID / Delete Upload dropdown
│   │   │   ├── BulkStatusBadge.jsx            # Job-status badge (pending/processing/completed/failed/cancelled)
│   │   │   └── AnimatedCounter.jsx            # rAF count-up number (shared easing with ScoreRing)
│   │   │
│   │   ├── charts/
│   │   │   ├── StackedBarChart.jsx            # Dashboard daily verification volume (safe/risky/unsafe/processing)
│   │   │   └── TrendsChart.jsx                # Line chart: verified/invalid/risky over time
│   │   │
│   │   ├── layout/
│   │   │   └── ThemeToggle.jsx                # Light/dark toggle, persists to localStorage, syncs across tabs
│   │   │
│   │   ├── notifications/                     # Header notification bell system
│   │   │   ├── NotificationBell.jsx            # Bell icon + unread badge + pulse animation
│   │   │   ├── NotificationDropdown.jsx        # Panel: mark-all-read, clear-all, list
│   │   │   ├── NotificationItem.jsx            # Single notification row
│   │   │   └── NotificationBadge.jsx           # Unread-count pill
│   │   │
│   │   ├── pages/                              # Domains-page-specific components
│   │   │   ├── DomainHeader.jsx                # Page title + Export/Delete Selected actions
│   │   │   ├── DomainStats.jsx                 # Total Domains/Emails/Safe/Risky+Unsafe/Flagged stat cards
│   │   │   ├── DomainAnalytics.jsx             # Top 5 riskiest domains, 7-day risk trend, new-domains sparkline
│   │   │   ├── DomainFilters.jsx               # Search + risk/flags/MX/min-emails filters
│   │   │   ├── DomainTable.jsx                 # Sortable domain table with verdict/trend/MX/flags columns
│   │   │   ├── DomainPagination.jsx
│   │   │   └── SortHeader.jsx                  # Reusable sortable <th> (asc → desc → none cycle)
│   │   │
│   │   ├── ui/                                  # Generic reusable UI primitives
│   │   │   ├── Button.jsx                      # Variant/size system + built-in loading spinner
│   │   │   ├── StatusBadge.jsx                 # Email status badge (derives bucket via statusBucket.js)
│   │   │   ├── CircularProgress.jsx            # Animated ring (used for Trust Score)
│   │   │   └── CustomTooltip.jsx               # Recharts tooltip for verification-status charts
│   │   │
│   │   ├── verify/                              # Verify Email page components
│   │   │   ├── CheckCard.jsx                   # One check pill (idle/checking/resolved) in the live-scan row
│   │   │   ├── ScoreRing.jsx                   # Animated 0→N count-up score ring
│   │   │   ├── RecommendationBanner.jsx        # Safe/Caution/Not Recommended banner
│   │   │   ├── WhyThisScore.jsx                # Per-check explanation list
│   │   │   ├── UsernameAnalysisCard.jsx        # Username-quality verdict + flags
│   │   │   ├── StatusLegend.jsx                # Sidebar legend: status meanings + score bands
│   │   │   ├── QuickActions.jsx                # Copy email/result, print-to-PDF, verify another
│   │   │   ├── RecentVerificationsList.jsx     # Last 5 verifications feed
│   │   │   ├── statusConfig.js                 # Single source of truth: check status resolution, score→recommendation bands
│   │   │   └── usernameFlags.js                # Maps backend username-quality flags → title/icon/description
│   │   │
│   │   └── AdminRoute.jsx                      # Route guard — redirects to /admin/login if no adminToken
│   │
│   ├── hooks/
│   │   ├── useIsTabVisible.js                  # Shared visibility hook — pauses polling on background tabs
│   │   └── useNotifications.js                 # Single polling query (list + unread_count together) + toast-on-new logic
│   │
│   ├── layouts/
│   │   └── Layout.jsx                          # Sidebar + header shell (nav, notification bell, theme toggle, profile menus)
│   │
│   ├── pages/
│   │   ├── DashboardPage.jsx                   # Trust score, safe/risky/unsafe/total cards, status breakdown, volume chart, flagged emails, domain leaderboard
│   │   ├── VerifyEmailPage.jsx                 # Single-email verification UI (persistent card, staged check reveal)
│   │   ├── BulkUploadPage.jsx                  # Upload + job history with polling, filters, cancel/retry/delete
│   │   ├── EmailListPage.jsx                   # Paginated/filterable/sortable email table + bulk delete/export
│   │   ├── DomainsPage.jsx                     # Domain analytics + table (server-side filter/sort/paginate)
│   │   ├── SettingsPage.jsx                    # Minimal account/appearance/API-keys-link page
│   │   ├── AdminLoginPage.jsx                  # Admin password → token exchange
│   │   ├── ApiKeysPage.jsx                     # Admin: create/revoke/activate API keys + usage chart
│   │   └── NotFoundPage.jsx                    # Catch-all 404
│   │
│   ├── services/
│   │   └── api.js                              # Single axios instance (GET retry-dedup queue, error normalization) + every backend call
│   │
│   ├── styles/
│   │   └── theme.ts                            # Reads live CSS custom properties into a JS object for chart libraries
│   │
│   ├── utils/
│   │   ├── appConfig.js                        # Single-tenant hardcoded user identity + app info
│   │   ├── dateUtils.js                        # UTC→IST formatting (ALL timestamps must go through this — backend stores naive UTC)
│   │   ├── statusBucket.js                     # JS mirror of backend's bucket_case() SQL — MUST stay in sync
│   │   ├── scoreThresholds.js                  # Score/risk-percent color-band thresholds (mirrors backend dashboard.py)
│   │   ├── jobUtils.js                         # calculateJobStats(), isJobActive(), status ordering
│   │   ├── csvPreview.js                       # Client-only best-effort CSV row-count/column/duplicate preview (never touches backend)
│   │   ├── fileHelpers.js                      # File extension/size formatting + badge color
│   │   ├── pagination.js                       # getPageWindow() — pagination number/ellipsis generator
│   │   └── errorReporter.js                    # Centralized console.error wrapper (single point to wire a real error tracker later)
│   │
│   ├── App.jsx                                  # Route-level code splitting (lazy pages), route table, document title sync
│   ├── main.jsx                                 # React root, QueryClientProvider, BrowserRouter, ErrorBoundary
│   └── index.css                                # Design tokens (CSS vars, light/dark), Tailwind layers, component classes (.card, .btn-primary, .input, badges)
│
├── index.html                                   # Pre-paint theme-class script (no flash of wrong theme on load)
├── nginx.conf                                    # Production static serving + /api/ reverse proxy to backend:8000
├── Dockerfile                                    # Multi-stage: node:20-alpine build → nginx:alpine serve
├── package.json / package-lock.json
├── vite.config.js                                # @ alias → src/, dev proxy /api → localhost:8000
├── tailwind.config.js                            # Dark mode via .class, CSS-var-backed color tokens
└── postcss.config.js
```

### Key frontend architectural notes

- **`services/api.js` is the only place that talks to the backend.** Every page/component calls a named export from here — no raw `fetch`/`axios` elsewhere.
- **Two JS files must stay manually in sync with backend logic**: `utils/statusBucket.js` (mirrors `bucket_case()` in `dashboard.py`) and `utils/scoreThresholds.js` (mirrors score/risk bands in `dashboard.py`/`score_calculator.py`). If backend thresholds change, update these too.
- **Live-polling pattern**: Dashboard, Email List, Domains, and Bulk Upload all poll on an interval, gated by `useIsTabVisible()` so backgrounded tabs don't hammer the API.
- **`TechnicalDetailsAccordion.jsx` has been removed** — it was flagged as dead code (references already stripped from `VerifyEmailPage.jsx`/`QuickActions.jsx`) and is intentionally absent from this tree.

---

## Database Schema

### `emails`
| Column | Type | Notes |
|---|---|---|
| id | BigInt PK | |
| email | String(255) | unique, indexed |
| domain | String(255) | indexed |
| status | Enum(EmailStatus) | verified/invalid/risky/processing/deliverable/trusted/probably_valid/unconfirmed/uncertain/undeliverable |
| syntax_valid, domain_exists, mx_found, smtp_valid, disposable, role_based, catch_all | Boolean | |
| score | Integer (0–100) | check constraint enforced |
| verified_at | DateTime, indexed | capped to a realistic processing window in avg-time queries |
| job_id | String(100), indexed | nullable — set only for bulk-uploaded emails |
| created_at, updated_at | DateTime | UTC naive |
| **Composite indexes** | | `(domain, status)`, `(job_id, status)` |

### `domains`
| Column | Type | Notes |
|---|---|---|
| id | BigInt PK | |
| domain | String(255) | unique, indexed |
| mx_records | JSON | nullable — only written when a real DNS lookup ran |
| total_emails | Integer | incremented on every upsert |
| verified_count / invalid_count / risky_count / bounce_rate | — | **legacy/unused** — dashboard/domains pages live-aggregate from `emails` instead |

### `jobs`
| Column | Type | Notes |
|---|---|---|
| id | BigInt PK | |
| job_id | String(100) | unique, indexed (UUID) |
| file_name, s3_key | String | s3_key may be `local:<job_id>/<filename>` or a real S3 key |
| status | Enum(JobStatus) | pending/processing/completed/failed/cancelled |
| current_stage | String(20) | uploading/validating/processing/cleaning/completed/cancelled |
| progress_percent | Integer (0–100) | |
| estimated_time_remaining | Integer (seconds), nullable | |
| cancel_requested | Boolean | cooperative cancellation flag |
| started_at, completed_at | DateTime, nullable | |
| error_details | JSON, nullable | |
| total, processed, verified, invalid, risky | Integer | check-constrained non-negative |
| error_message | Text, nullable | |

### `api_keys`
| Column | Type | Notes |
|---|---|---|
| id | BigInt PK | |
| key_hash | String(64), unique, indexed | SHA-256 of full key — plaintext never stored |
| key_prefix | String(20), unique | shown in UI/CLI for identification |
| name | String(255), nullable | |
| is_active | Boolean | |
| rate_limit_per_min | Integer | default 60 |
| bulk_limit_per_hour | Integer | default 5 |
| last_used_at | DateTime, nullable | |

### `api_key_usage_logs`
| Column | Type | Notes |
|---|---|---|
| id | BigInt PK | |
| api_key_id | BigInt, indexed | no hard FK (project convention) |
| endpoint | String(20) | "verify" \| "bulk" |
| status_code | Integer | |
| created_at | DateTime, indexed | |

### `notifications`
| Column | Type | Notes |
|---|---|---|
| id | BigInt PK | |
| title, message | String / Text | |
| type | Enum(NotificationType) | success/error/warning/info |
| priority | Enum(NotificationPriority) | low/medium/high |
| is_read | Boolean, indexed | |
| metadata | JSON (DB column name `metadata`, ORM attribute `extra_data`) | nullable |
| created_at, updated_at | DateTime, indexed | |

---

## Data Flow (Single Verification)

```text
User → VerifyEmailPage.jsx
     → POST /api/v1/verify-email
     → verify.py: mark email "processing" (short-lived async session)
     → email_service.verify_email():
         syntax_validator → disposable_checker → dns_validator (skipped for TRUSTED_DOMAINS)
         → smtp_validator (skipped for disposable/trusted/no-MX)
         → score_calculator (score + status + username analysis)
     → domain_service.async_upsert_email() + async_upsert_domain() (short-lived async session)
     → EmailVerifyResponse → frontend renders CheckCard row → ScoreRing → RecommendationBanner
```

## Data Flow (Bulk Upload)

```text
User → BulkUploadPage.jsx → POST /api/v1/bulk-upload (multipart)
     → bulk.py: save file (local /tmp/uploads or S3), create Job row, fire "Bulk Upload Started" notification
     → BackgroundTasks.add_task(process_bulk_job_sync)
     → bulk_processor.py (ThreadPoolExecutor):
         per email → verify_single_email_sync() → email_service.verify_email() (own event loop per thread)
         → domain_service.sync_upsert_email/domain() → _update_job_counter() (progress/ETA/stage)
         every 10 completions → check Job.cancel_requested (fresh session)
     → on completion/cancellation → notification_service.sync_create_notification()
Frontend polls GET /jobs/{job_id} every 2s until status is completed/failed/cancelled.
```

---

## Security

- **External API**: `X-API-Key` header → SHA-256 hash lookup → per-key rate limiting (in-memory, per-process — see `rate_limiter.py` docstring for the multi-instance caveat).
- **Admin dashboard**: password (`ADMIN_PASSWORD` env var) → signed HMAC token (`admin_auth.py`, 24h validity) → `X-Admin-Token` header on all `/admin/*` routes except `/admin/login`. Login endpoint itself is rate-limited (5/min per IP).
- **API keys**: never stored in plaintext — only SHA-256 hash + a display prefix.
- **SQL injection**: SQLAlchemy ORM/Core with parameter binding throughout; all `sort_by` params are whitelisted against a fixed set before use.
- **CORS**: configured via `CORS_ORIGINS`; `main.py` warns on startup if origins are `*` or `SECRET_KEY`/`ADMIN_PASSWORD` are left at defaults.

---

## Development Setup

### Backend
```powershell
cd backend
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
# edit .env with your DATABASE_URL, SECRET_KEY, ADMIN_PASSWORD, etc.
alembic upgrade head
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend
```powershell
cd frontend
npm install
npm run dev
```

### Docker Compose (both services)
```powershell
docker-compose up --build
```
- Frontend: http://localhost
- Backend API: http://localhost:8000
- API Docs (Swagger): http://localhost:8000/docs
- Health check: http://localhost:8000/health

---

## Extending the System

| Task | Where to start |
|---|---|
| Add a new validation rule | New file in `validators/`, call it from `services/email_service.py`, extend `EmailVerifyResponse` in `schemas/schemas.py` if it needs to be persisted/returned |
| Add a new internal dashboard endpoint | `api/v1/endpoints/`, register in `api/v1/router.py`, add schema in `schemas/schemas.py` |
| Add a new external API endpoint | `api/external/v1/endpoints/`, register in `api/external/v1/router.py`, gate with `rate_limit_verify`/`rate_limit_bulk`/`get_api_key` from `dependencies.py` |
| Add a DB column/table | Edit `models/models.py` → `alembic revision --autogenerate -m "..."` → review the file in `migrations/versions/` → `alembic upgrade head` |
| Add a new notification type/event | Call `services/notification_service.py`'s `async_create_notification`/`sync_create_notification` from the relevant endpoint or worker step |
| Add a new frontend page | Create in `src/pages/`, lazy-import + route it in `App.jsx`, add API calls to `src/services/api.js` |
| Change score/status thresholds | Update `backend/validators/score_calculator.py` **and** `frontend/src/utils/scoreThresholds.js` together |

---

*Last synced with codebase: reflects notifications system, bulk cancellation, external developer API, admin API-key management, and all 17 backend-audit fixes as of the most recent session.*
