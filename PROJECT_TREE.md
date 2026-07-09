# PROJECT_TREE.md — Email Verification System

Complete annotated project tree. Every folder and file is explained with purpose, dependencies, criticality, and modification safety.

---

```
EMAIL-VERIFIER/
│
├── backend/
│   │
│   ├── api/
│   │   └── v1/
│   │       ├── __init__.py
│   │       ├── router.py                       ★ CRITICAL — API router aggregator
│   │       └── endpoints/
│   │           ├── __init__.py
│   │           ├── verify.py                   ★ CRITICAL — POST /api/v1/verify-email
│   │           ├── bulk.py                     ★ CRITICAL — POST /api/v1/bulk-upload & job management
│   │           └── dashboard.py                ★ CRITICAL — Dashboard stats, email list, domains
│   │
│   ├── models/
│   │   ├── database.py                         ★ CRITICAL — Async + sync DB engines, session factories
│   │   └── models.py                           ★ CRITICAL — SQLAlchemy ORM: Email, Domain, Job, enums
│   │
│   ├── schemas/
│   │   ├── __init__.py
│   │   └── schemas.py                          ★ CRITICAL — All Pydantic request/response models
│   │
│   ├── services/
│   │   ├── __init__.py
│   │   ├── email_service.py                    ★ CRITICAL — Full 7-step verification pipeline
│   │   └── s3_service.py                       IMPORTANT — AWS S3 upload/download/presigned URLs
│   │
│   ├── validators/
│   │   ├── __init__.py
│   │   ├── syntax_validator.py                 ★ CRITICAL — RFC syntax + role-based detection
│   │   ├── dns_validator.py                    ★ CRITICAL — DNS A/MX/SPF/DMARC lookups
│   │   ├── smtp_validator.py                   ★ CRITICAL — SMTP RCPT TO + catch-all probing
│   │   ├── disposable_checker.py               ★ CRITICAL — 100K+ domain live-fetch + fallback list
│   │   └── score_calculator.py                 ★ CRITICAL — Weighted scoring + 10-tier status tiers
│   │
│   ├── tasks/
│   │   ├── __init__.py
│   │   └── bulk_processor.py                   ★ CRITICAL — ThreadPoolExecutor bulk job processing
│   │
│   ├── utils/
│   │   ├── __init__.py
│   │   ├── config.py                           ★ CRITICAL — Pydantic BaseSettings from .env
│   │   ├── logging.py                          IMPORTANT — structlog JSON logging configuration
│   │   ├── email_utils.py                      IMPORTANT — CSV email column auto-detection
│   │   └── executor.py                         CRITICAL — Global ThreadPoolExecutor (20 workers)
│   │
│   ├── migrations/
│   │   ├── __init__.py
│   │   ├── env.py                              CRITICAL — Alembic migration runner
│   │   ├── script.py.mako                      SAFE — Template for new migration files
│   │   └── versions/
│   │       ├── 0001_initial.py                 CRITICAL — Base schema: emails, domains, jobs tables
│   │       ├── 755992d1fcc0_...py              CRITICAL — Adds job_id, progress tracking columns
│   │       └── d0739350dd1a_...py              SAFE — Empty placeholder migration
│   │
│   ├── tests/
│   │   ├── __init__.py
│   │   ├── test_validators.py                  IMPORTANT — Syntax, disposable, score, DNS, SMTP tests
│   │   ├── test_bulk_upload.py                 IMPORTANT — Bulk upload endpoint integration tests
│   │   ├── test_tasks.py                       IMPORTANT — Bulk processor, domain stats, job counter tests
│   │   ├── test_utils.py                       IMPORTANT — Email column detection unit tests
│   │   └── test_dashboard_stats.py             IMPORTANT — Dashboard stats schema + endpoint tests
│   │
│   ├── main.py                                 ★ CRITICAL — FastAPI app entry point, lifespan, middleware
│   ├── requirements.txt                        CRITICAL — All Python dependencies with pinned versions
│   ├── Dockerfile                              CRITICAL — Multi-stage Docker build for backend
│   ├── .dockerignore
│   ├── .env                                    ★ CRITICAL — Actual env vars (gitignored, not committed)
│   ├── .env.example                            IMPORTANT — Template for env configuration
│   ├── entrypoint.sh                           CRITICAL — Docker CMD: creates DB, runs migrations, starts uvicorn
│   ├── alembic.ini                             CRITICAL — Alembic configuration
│   └── pytest.ini                              IMPORTANT — Pytest configuration
│
├── frontend/
│   │
│   ├── src/
│   │   ├── main.jsx                            ★ CRITICAL — React DOM entry point
│   │   ├── App.jsx                             ★ CRITICAL — Router + TanStack Query provider
│   │   ├── index.css                           IMPORTANT — Global Tailwind styles
│   │   │
│   │   ├── pages/
│   │   │   ├── DashboardPage.jsx               ★ CRITICAL — Main dashboard with status breakdown
│   │   │   ├── VerifyEmailPage.jsx             ★ CRITICAL — Single email verification form
│   │   │   ├── BulkUploadPage.jsx              ★ CRITICAL — CSV/Excel upload + job history
│   │   │   ├── EmailListPage.jsx               ★ CRITICAL — Paginated, filterable, sortable email table
│   │   │   └── DomainsPage.jsx                 ★ CRITICAL — Domain analytics, risk trends, verdicts
│   │   │
│   │   ├── components/
│   │   │   ├── ui/
│   │   │   │   ├── Button.jsx                  IMPORTANT — Reusable gradient/styled button component
│   │   │   │   ├── CircularProgress.jsx        IMPORTANT — SVG circular progress/score ring
│   │   │   │   ├── StatusBadge.jsx             IMPORTANT — Color-coded safe/risky/unsafe status pill
│   │   │   │   ├── StatCard.jsx                SAFE — Gradient stat card (used infrequently)
│   │   │   │   └── CustomTooltip.jsx           SAFE — Recharts tooltip for StackedBarChart
│   │   │   │
│   │   │   ├── charts/
│   │   │   │   ├── StackedBarChart.jsx         IMPORTANT — Safe/Risky/Unsafe/Processing stacked bars
│   │   │   │   ├── TrendsChart.jsx             SAFE — Legacy 3-line trends chart
│   │   │   │   ├── StatusPieChart.jsx          SAFE — Donut pie chart (rarely used)
│   │   │   │   └── DomainBarChart.jsx          SAFE — Per-domain grouped bars
│   │   │   │
│   │   │   └── layout/
│   │   │       └── ThemeToggle.jsx             SAFE — Dark/light mode toggle button

                pages 
│   │   │
│   │   ├── layouts/
│   │   │   ├── Layout.jsx                      ★ CRITICAL — App shell: sidebar + header + outlet
│   │   │   └── Sidebar.jsx                     SAFE — Legacy sidebar (replaced by Layout.jsx inline)
│   │   │
│   │   ├── services/
│   │   │   └── api.js                          ★ CRITICAL — Axios API client, all endpoint functions
│   │   │
│   │   └── styles/
│   │       └── theme.ts                        IMPORTANT — Light/dark design tokens (CSS variables)
│   │
│   ├── index.html                              CRITICAL — Vite HTML entry
│   ├── package.json                            CRITICAL — Dependencies: React 18, Recharts, TanStack Query
│   ├── vite.config.js                          IMPORTANT — Vite config with @ alias + dev proxy
│   ├── tailwind.config.js                      IMPORTANT — Tailwind theme with CSS variable colors
│   ├── postcss.config.js                       SAFE — PostCSS config (Tailwind pipeline)
│   ├── nginx.conf                              CRITICAL — Nginx: SPA fallback + /api/ proxy to backend
│   └── Dockerfile                              CRITICAL — Multi-stage: Node build → Nginx serve
│
├── docker-compose.yml                          ★ CRITICAL — Orchestrates backend + frontend containers
├── aws-deployment.md                           REFERENCE — AWS architecture guide (CloudFront, RDS, ECS)
├── readme.md                                   REFERENCE — Project overview, quick start, API docs
│
├── PROJECT_TREE.md                             ← THIS FILE
└── PROJECT_CONTEXT.md                          ← Companion knowledge base
```

---

## File Annotations

### BACKEND — Core Infrastructure

| File | Purpose | Who Uses It | Dependencies | Safe to Modify? |
|------|---------|-------------|--------------|-----------------|
| **main.py** | FastAPI app creation, CORS, request timing middleware, lifespan (executor start/shutdown), global exception handler, `/health` endpoint, router mounting | All API requests | `api.v1.router`, `utils.config`, `utils.logging`, `utils.executor` | ⚠️ Careful — changes affect every request |
| **utils/config.py** | Loads environment variables via Pydantic Settings: DATABASE_URL, AWS creds, SMTP timeout, CORS origins, DEBUG flag | Every backend module | `.env` file | ⚠️ Add new vars only — removing breaks things |
| **utils/logging.py** | Configures structlog for structured JSON logging | All backend modules | `utils.config` (LOG_LEVEL) | ✅ Safe — log format changes are cosmetic |
| **utils/executor.py** | Global ThreadPoolExecutor singleton (20 workers) used for SMTP (blocking I/O) and bulk processing | `email_service`, `bulk_processor` | None | ⚠️ Worker count affects throughput |
| **utils/email_utils.py** | `detect_email_column()` — auto-finds the email column in a DataFrame | `bulk.py` endpoint, `bulk_processor.py` | pandas | ✅ Safe — standalone utility |
| **models/database.py** | Creates async engine (aiomysql) for FastAPI + sync engine (pymysql) for background tasks; provides `get_db()` async generator and `get_sync_db()` sync generator | Every endpoint, bulk processor | `utils.config` (DATABASE_URL) | ⚠️ Pool size values affect concurrency |
| **models/models.py** | SQLAlchemy ORM: Email (14 fields), Domain (11 fields), Job (20 fields), EmailStatus enum (10 values), JobStatus enum (4 values) | All endpoints, bulk processor, migrations | SQLAlchemy | ⚠️ Adding columns requires new migration |
| **schemas/schemas.py** | Pydantic v2 models: EmailVerifyRequest, EmailVerifyResponse, JobStatusResponse, BulkUploadResponse, PaginatedEmailsResponse, DomainStats, DashboardStats (with trends + speed), PaginatedDomainsResponse, DomainOverview, ActiveJob, VerificationTrend | All endpoints (response_model), frontend API layer | `models.models` (enums) | ⚠️ Frontend consumes these shapes — coordinate changes |
| **alembic.ini** | Alembic config: points to `migrations/` directory | Alembic CLI | None | ✅ Safe — path changes only |
| **migrations/env.py** | Migration runner: reads DATABASE_URL from Settings, targets Base.metadata | `alembic upgrade head` | `models.models.Base`, `utils.config` | ⚠️ Core migration plumbing |
| **requirements.txt** | 21 pinned dependencies: FastAPI, SQLAlchemy, boto3, pandas, structlog, pytest, etc. | `pip install`, Docker build | None | ✅ Add new deps only |
| **Dockerfile** | `python:3.12-slim` → install MySQL client libs → pip install → run entrypoint.sh | `docker-compose up backend` | `requirements.txt`, `entrypoint.sh` | ⚠️ Break Docker build if incorrect |
| **entrypoint.sh** | Creates MySQL database if missing, runs `alembic upgrade head`, starts `uvicorn` | Docker CMD | alembic, pymysql, DATABASE_URL env | ⚠️ Migration failure = container crash |
| **.env.example** | Template: DATABASE_URL, AWS creds, SECRET_KEY, DEBUG, CORS_ORIGINS, SMTP_TIMEOUT | Developers cloning repo | None | ✅ Safe — it's a template |

### BACKEND — API Layer

| File | Purpose | Route(s) | Related Files | Safe to Modify? |
|------|---------|----------|---------------|-----------------|
| **api/v1/router.py** | Aggregates all endpoint routers under `/api/v1` prefix | Root router | `verify.router`, `bulk.router`, `dashboard.router` | ✅ Safe — just adds routers |
| **api/v1/endpoints/verify.py** | `POST /verify-email` — validates + persists single email, upserts domain stats | `POST /api/v1/verify-email` | `email_service.verify_email`, `models.Email`, `models.Domain`, `schemas.EmailVerifyResponse` | ⚠️ Core feature |
| **api/v1/endpoints/bulk.py** | `POST /bulk-upload` (CSV/Excel), `GET /jobs`, `GET /jobs/{id}`, `DELETE /jobs/{id}`, `GET /jobs/{id}/export` | 5 routes under `/api/v1/` | `tasks.bulk_processor`, `models.Job`, `models.Email`, `utils.email_utils` | ⚠️ Core feature |
| **api/v1/endpoints/dashboard.py** | `GET /dashboard/stats`, `GET /dashboard/trends`, `GET /emails`, `GET /emails/export`, `GET /domains/overview`, `GET /domains`, `DELETE /emails/{email}` | 7 routes under `/api/v1/` | `models.Email`, `models.Domain`, `models.Job`, `schemas.*` | ⚠️ Largest endpoint file — complex aggregation queries |

### BACKEND — Business Logic

| File | Purpose | Input | Output | Called By |
|------|---------|-------|--------|-----------|
| **services/email_service.py** | 7-step async pipeline: syntax → role → disposable → DNS → MX → SMTP → score | Email string | EmailVerifyResponse | `verify.py` endpoint, `bulk_processor.py` |
| **services/s3_service.py** | S3 client factory + `upload_file_to_s3()`, `download_file_from_s3()`, `generate_presigned_url()` | File bytes / S3 key | S3 URL / bytes / presigned URL | `bulk.py` (optional), `bulk_processor.py` |
| **tasks/bulk_processor.py** | `verify_single_email_sync()` — wraps async verify in sync thread; `process_bulk_job_sync()` — reads file, fans out via ThreadPoolExecutor, updates job counters; `_update_domain_stats()` — ON DUPLICATE KEY UPDATE; `_update_job_counter()` — progress + stage tracking | job_id, s3_key, email_col | None (side effects on DB) | `bulk.py` endpoint (BackgroundTasks) |
| **validators/syntax_validator.py** | RFC validation via email-validator library + custom checks (emoji, quotes, keyboard patterns); `is_role_based()` — 75+ role prefixes | Email string | (bool, normalized_email, domain) | `email_service.py` |
| **validators/dns_validator.py** | DNS resolution via dnspython: A/MX lookup with 4 public resolvers (Google + Cloudflare); async wrappers via `asyncio.to_thread`; SPF + DMARC lookup | Domain string | bool / list[str] / str | `email_service.py` |
| **validators/smtp_validator.py** | SMTP HELO → MAIL FROM → RCPT TO + random-address catch-all probe; single MX attempt for speed | Email, MX host list | (smtp_valid: bool, catch_all: bool) | `email_service.py` |
| **validators/disposable_checker.py** | 125+ fallback domains + live fetch from 2 GitHub repos (100K+ domains), 24h cache TTL, background refresh thread on import | Domain string | bool | `email_service.py` |
| **validators/score_calculator.py** | Weighted scoring (0-100) + username quality analysis (entropy, vowel ratio, keyboard walks, char repetition) + 10-tier status determination (deliverable/trusted/probably_valid/unconfirmed/uncertain/undeliverable) | All check results + domain + username | (score: int, username_analysis: dict) | `email_service.py` |

### FRONTEND — Pages

| Page | Route | Purpose | APIs Called | Key Components |
|------|-------|---------|-------------|----------------|
| **DashboardPage.jsx** | `/` | Trust score, status breakdown (Safe/Risky/Unsafe/Processing), 24h trends, verification speed, active job, stacked bar chart, flagged emails, worst domains | `getDashboardStats(days)` | CircularProgress, StackedBarChart, StatusGroup |
| **VerifyEmailPage.jsx** | `/verify` | Single email input → 7-check result card with score ring, expandable details, username analysis, domain link | `verifyEmail(email)` | StatusBadge, CircularProgress, Button |
| **BulkUploadPage.jsx** | `/bulk` | Drag-drop CSV/Excel upload, job history with progress bars, polling (2s interval), date filters, export download, delete/retry | `bulkUpload`, `getJobStatus`, `listJobs`, `deleteJob`, `exportJobResults` | StatusBadge, Button |
| **EmailListPage.jsx** | `/emails` | Paginated table, search, status/domain/score/date filters, multi-select, bulk delete/export, sortable columns, KPI cards | `listEmails`, `getDashboardStats`, `deleteEmail`, `exportEmails` | StatusBadge, Button, ChecksCell |
| **DomainsPage.jsx** | `/domains` | Domain analytics: overview cards, top-5 riskiest, 7-day risk trend chart, new domains sparkline, paginated domain table with verdicts/flags/MX/trends, client-side risk/MX/flags filters | `listDomains`, `getDomainOverview`, `getDashboardStats` | Button |

### FRONTEND — Shared Components

| Component | Purpose | Used By |
|-----------|---------|---------|
| **api.js** | Axios instance (`/api/v1` base), response normalization (10 statuses → 3 buckets), all API functions | Every page |
| **Layout.jsx** | Collapsible sidebar nav, mobile menu, header with ThemeToggle, `<Outlet/>` for pages | App.jsx (root route element) |
| **Sidebar.jsx** | Legacy sidebar (not used — Layout.jsx has inline sidebar) | Not referenced |
| **Button.jsx** | 7 variants (primary/secondary/outline/accent/danger/ghost/link), 3 sizes, loading spinner state | Every page |
| **StatusBadge.jsx** | Maps 10 backend statuses → 4 bucket-colored pills (safe/risky/unsafe/processing) with icons | VerifyEmailPage, BulkUploadPage, EmailListPage |
| **CircularProgress.jsx** | SVG donut progress ring with animated `stroke-dashoffset` | DashboardPage, VerifyEmailPage |
| **StackedBarChart.jsx** | Recharts stacked bar: Safe/Risky/Unsafe/Processing per day, IST timezone labels | DashboardPage |
| **ThemeToggle.jsx** | Sun/Moon icon toggle, toggles `.dark` class on `<html>` | Layout.jsx |
| **theme.ts** | Light/dark CSS variable definitions (background, foreground, success, error, etc.) | Tailwind config, all pages |

### INFRASTRUCTURE

| File | Purpose | Key Details |
|------|---------|-------------|
| **docker-compose.yml** | 2 services: `ev_backend` (FastAPI, port 8000) + `ev_frontend` (Nginx, port 80), both `unless-stopped` | No MySQL container — expects external DB |
| **frontend/Dockerfile** | Multi-stage: `node:20-alpine` build → `nginx:alpine` serve with nginx.conf | Healthcheck via wget |
| **frontend/nginx.conf** | SPA fallback (`try_files $uri /index.html`), `/api/` proxy to `backend:8000`, static asset caching (1y), gzip, 60M client body | Critical for production |
| **backend/Dockerfile** | `python:3.12-slim` → gcc + MySQL libs → pip install → entrypoint.sh | Single stage |
| **aws-deployment.md** | Reference architecture: CloudFront → S3 (static) + ALB → ECS/EC2 → RDS MySQL → S3 uploads | Cost estimate: ~$176/mo |

---

## Criticality Legend

| Symbol | Meaning |
|--------|---------|
| ★ CRITICAL | App breaks if this file is removed or broken. Touching requires care. |
| IMPORTANT | App functions but with degraded features if removed. |
| SAFE | Cosmetic or tangential. Safe to modify without cascading breakage. |
| REFERENCE | Documentation only. No runtime impact. |

## Modification Risk Legend

| Symbol | Meaning |
|--------|---------|
| ⚠️ Careful | Changes can cascade. Test thoroughly. |
| ✅ Safe | Standalone or cosmetic. Low risk. |