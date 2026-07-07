# PROJECT_CONTEXT — Part 1: Overview & Folder Responsibilities

---

## 1. Project Overview

### What This Project Does

**Email Verification System** — A production-ready platform that verifies whether email addresses are real, deliverable, and safe to send to. It checks 7 signals for every email (syntax, domain DNS, MX records, SMTP handshake, disposable detection, role-based detection, catch-all detection) and assigns a 0–100 deliverability score.

### Target Users

- **Marketing teams** cleaning email lists before campaigns
- **SaaS platforms** validating user sign-up emails
- **HR/recruitment systems** verifying candidate email addresses
- **Any business** that sends bulk email and wants to reduce bounce rates

### Main Features

| Feature | Description |
|---------|-------------|
| **Single Email Verification** | Real-time 7-step pipeline: Syntax → DNS → MX → SMTP → Disposable → Role → Score |
| **Bulk CSV/Excel Upload** | Upload files with thousands of emails, async background processing via ThreadPoolExecutor |
| **Real-time Dashboard** | Trust score, status breakdown (Safe/Risky/Unsafe/Processing), 24h trends, verification speed |
| **Email List** | Paginated, searchable, filterable table with bulk delete/export |
| **Domain Analytics** | Per-domain risk %, verdicts (Healthy/Watch/High Risk/Low Sample), 7-day trends, MX status |
| **Job Tracking** | Live progress bars, ETA estimation, stage tracking (uploading→validating→processing→cleaning→completed) |
| **CSV Export** | Export verified results with all check columns appended to original file |
| **Dark/Light Mode** | Full theme support via CSS variables + Tailwind |

### Overall Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Docker Compose                        │
│                                                         │
│  ┌──────────────────┐     ┌──────────────────────────┐  │
│  │   ev_frontend    │     │       ev_backend         │  │
│  │   Nginx :80      │────▶│    FastAPI :8000         │  │
│  │   React SPA      │     │                          │  │
│  │   (Vite build)   │     │  ┌────────────────────┐  │  │
│  └──────────────────┘     │  │  ThreadPoolExecutor │  │  │
│                            │  │  (20 workers)       │  │  │
│                            │  └────────┬───────────┘  │  │
│                            │           │               │  │
│                            │  ┌────────▼───────────┐  │  │
│                            │  │   MySQL 8.0        │  │  │
│                            │  │   (external/RDS)   │  │  │
│                            │  └────────────────────┘  │  │
│                            │                           │  │
│                            │  ┌────────────────────┐  │  │
│                            │  │   AWS S3           │  │  │
│                            │  │   (optional)       │  │  │
│                            │  └────────────────────┘  │  │
│                            └──────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

**Key architectural decisions:**
- **No Celery/Redis** — Uses FastAPI BackgroundTasks + ThreadPoolExecutor for simplicity
- **Dual database engines** — Async (aiomysql) for FastAPI endpoints, Sync (pymysql) for background tasks
- **Bucket-based classification** — 10 fine-grained statuses mapped to 4 buckets (Safe/Risky/Unsafe/Processing) via SQL CASE expressions
- **Trusted domain skip** — 300+ known-good domains (Gmail, Outlook, corporate) skip DNS+SMTP for speed

---

## 2. Folder Responsibilities

### `backend/`

**Purpose:** FastAPI application — API, business logic, database models, background processing.

**Responsibilities:**
- Expose REST API at `/api/v1/`
- Validate email addresses through multi-step pipeline
- Process bulk CSV/Excel uploads in background threads
- Store and query verification results in MySQL
- Aggregate dashboard statistics from live data
- Upload/download files to/from AWS S3 (optional)

**Important files:** `main.py`, `requirements.txt`, `Dockerfile`, `entrypoint.sh`, `.env`

**Dependencies:** Python 3.12, MySQL 8.0, optional AWS S3

---

### `backend/api/v1/endpoints/`

**Purpose:** FastAPI route handlers — where HTTP requests meet business logic.

**Responsibilities:**
- `verify.py` — Single email verification endpoint
- `bulk.py` — File upload, job CRUD, CSV export
- `dashboard.py` — Stats aggregation, email list, domain analytics

**Important files:** All three endpoint files are critical

**Dependencies:** `services/`, `models/`, `schemas/`, `tasks/`

---

### `backend/models/`

**Purpose:** Database layer — ORM models + connection management.

**Responsibilities:**
- Define table schemas (Email, Domain, Job)
- Manage async + sync SQLAlchemy engines
- Provide session factory functions (`get_db`, `get_sync_db`)

**Important files:** `models.py` (3 tables, 2 enums), `database.py` (dual engine setup)

**Dependencies:** SQLAlchemy 2.0, MySQL (pymysql + aiomysql)

---

### `backend/schemas/`

**Purpose:** Pydantic v2 request/response models — data validation and serialization.

**Responsibilities:**
- Validate incoming request bodies
- Define response shapes (used by FastAPI auto-docs)
- Provide type safety between API layer and frontend

**Important files:** `schemas.py` (11 Pydantic models)

**Dependencies:** `models.models` (EmailStatus, JobStatus enums)

---

### `backend/services/`

**Purpose:** Business logic — the verification pipeline and external integrations.

**Responsibilities:**
- `email_service.py` — Orchestrate all 7 validation steps
- `s3_service.py` — AWS S3 file operations

**Important files:** `email_service.py` (the heart of the app)

**Dependencies:** All 5 validators, schemas, logging

---

### `backend/validators/`

**Purpose:** Individual validation checks — each validator does one thing.

**Responsibilities:**
- `syntax_validator.py` — RFC format, role-based detection (75+ prefixes)
- `dns_validator.py` — DNS A/MX/SPF/DMARC queries via 4 public resolvers
- `smtp_validator.py` — SMTP handshake + catch-all probing
- `disposable_checker.py` — 125+ hardcoded + 100K+ live-fetched domains
- `score_calculator.py` — Weighted scoring, username quality analysis, status tiers

**Important files:** All 5 are critical to verification accuracy

**Dependencies:** dnspython, email-validator, smtplib, urllib

---

### `backend/tasks/`

**Purpose:** Background job processing — the bulk verification engine.

**Responsibilities:**
- `bulk_processor.py` — Read CSV/Excel, fan out emails to ThreadPoolExecutor, track progress, update DB

**Important files:** `bulk_processor.py` — single file, handles all bulk processing

**Dependencies:** `services/email_service`, `models/`, `utils/executor`, pandas

---

### `backend/utils/`

**Purpose:** Cross-cutting utilities — config, logging, shared helpers.

**Responsibilities:**
- `config.py` — Load all env vars via Pydantic Settings
- `logging.py` — structlog JSON logging setup
- `executor.py` — Global ThreadPoolExecutor singleton
- `email_utils.py` — CSV column auto-detection

**Important files:** `config.py` (every module imports `settings`), `executor.py`

**Dependencies:** pydantic-settings, structlog, python-dotenv

---

### `backend/migrations/`

**Purpose:** Alembic database migrations — schema versioning.

**Responsibilities:**
- Track and apply schema changes
- 3 migration files: initial schema, bulk upload redesign, placeholder

**Important files:** `env.py` (migration runner), `versions/0001_initial.py`

**Dependencies:** Alembic, SQLAlchemy, `models.models.Base`

---

### `backend/tests/`

**Purpose:** Unit and integration tests.

**Responsibilities:**
- `test_validators.py` — Syntax, disposable, score, DNS, SMTP tests (mocked I/O)
- `test_bulk_upload.py` — Bulk upload endpoint integration tests
- `test_tasks.py` — Bulk processor, domain stats, job counter tests
- `test_utils.py` — Email column detection unit tests
- `test_dashboard_stats.py` — Dashboard schema + endpoint tests

**Important files:** All test files. Run with `pytest tests/ -v`

**Dependencies:** pytest, pytest-asyncio, pytest-mock

---

### `frontend/`

**Purpose:** React 18 SPA — dashboard, verification UI, domain analytics.

**Responsibilities:**
- Render all 5 pages (Dashboard, Verify, Bulk Upload, Email List, Domains)
- Communicate with backend via Axios (`/api/v1`)
- Manage state with TanStack Query (auto-refetch, caching)
- Provide dark/light theme via CSS variables + Tailwind

**Important files:** `src/App.jsx`, `src/services/api.js`, all 5 page files

**Dependencies:** React 18, Vite, Tailwind CSS, Recharts, TanStack Query, Framer Motion, Lucide icons

---

### `frontend/src/pages/`

**Purpose:** Page-level components — one per route.

| Page | Route | Primary API Calls |
|------|-------|-------------------|
| DashboardPage | `/` | `getDashboardStats(days)` every 3s |
| VerifyEmailPage | `/verify` | `verifyEmail(email)` on submit |
| BulkUploadPage | `/bulk` | `bulkUpload`, `getJobStatus` (poll 2s), `listJobs`, `deleteJob` |
| EmailListPage | `/emails` | `listEmails(params)`, `deleteEmail`, `getDashboardStats` |
| DomainsPage | `/domains` | `listDomains(params)`, `getDomainOverview`, `getDashboardStats` |

---

### `frontend/src/components/`

**Purpose:** Reusable UI components.

- `ui/` — Button, CircularProgress, StatusBadge, StatCard, CustomTooltip
- `charts/` — StackedBarChart, TrendsChart, StatusPieChart, DomainBarChart
- `layout/` — ThemeToggle

---

### `frontend/src/services/`

**Purpose:** API communication layer.

**Responsibilities:**
- Axios instance with `/api/v1` base URL, 30s timeout, error interceptor
- Status normalization: 10 backend statuses → 3 buckets (safe/risky/unsafe)
- All API functions exported for pages to use

**Important files:** `api.js` — every page imports from here

---

### `frontend/src/layouts/`

**Purpose:** App shell — sidebar navigation + header + content area.

- `Layout.jsx` — Active layout with collapsible sidebar, mobile menu, `<Outlet/>`
- `Sidebar.jsx` — Legacy, no longer referenced

---

### `frontend/src/styles/`

**Purpose:** Design tokens for light/dark themes.

- `theme.ts` — Exports `light` and `dark` objects with CSS variable values. Provides `useTheme()` hook used by chart components for dynamic colors.

---

## Next: Part 2 — [Important Files Detail](PROJECT_CONTEXT_02_IMPORTANT_FILES.md)