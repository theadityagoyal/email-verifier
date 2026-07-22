# EmailVerifier Pro

A production-ready, single-tenant email verification SaaS with an internal analytics dashboard **and** an external developer API. Verifies emails through a multi-step pipeline (syntax → DNS → MX → SMTP → disposable/role-based/catch-all detection → scoring), supports single and bulk (CSV/Excel) verification, and ships with in-app notifications, cooperative bulk-job cancellation, and API-key-based external access.

---

## Features

- **Single Email Verification** — real-time, full validation pipeline with a live "scanning" UI
- **Bulk Email Verification** — upload CSV/Excel, background-processed with progress %, ETA, and graceful cancellation
- **External Developer API** — `X-API-Key` auth, per-key rate limits (verify: per-minute, bulk: per-hour), usage logging
- **Admin Panel** — password-protected API key management (create/revoke/activate) with a usage chart
- **In-App Notifications** — bulk job lifecycle, API key events, surfaced via a polling header bell
- **Dashboard Analytics** — trust score, safe/risky/unsafe breakdown, daily volume chart, flagged-email feed, domain risk leaderboard
- **Domain Analytics** — per-domain reputation, risk %, MX status, 7-day trend, flags (disposable/catch-all/role-based)
- **Comprehensive Validation**: syntax, domain DNS existence, MX records, live SMTP probe, disposable-domain detection (auto-updating list), role-based detection, catch-all detection, username-quality heuristics, trusted-domain fast path

## Tech Stack

**Backend**
- FastAPI (Python 3.12), async SQLAlchemy (FastAPI request handlers) + sync SQLAlchemy (background workers)
- MySQL 8.0.x, Alembic migrations
- `ThreadPoolExecutor` for background/bulk processing — **no Celery, no Redis**
- `structlog` for structured logging
- `pandas` for CSV/Excel parsing
- `dnspython`, `email-validator`, raw `smtplib` for the SMTP probe

**Frontend**
- React 18 + Vite
- TanStack Query (React Query) for server state + polling
- Tailwind CSS (CSS-variable-driven theming, light/dark)
- Framer Motion for animation
- Recharts for charts
- React Router v6, React Hot Toast, Lucide icons

**Infrastructure**
- Docker & Docker Compose
- Nginx (frontend static serving + `/api/` reverse proxy)
- Optional S3 for file storage (local `/tmp/uploads` by default)

---

## Architecture Overview

```text
Client (Browser)
      │
      ▼
┌─────────────┐        ┌──────────────────────────────┐
│  Frontend   │◄──────►│         Backend (FastAPI)     │
│ React/Vite  │  /api  │                                │
│ (Nginx)     │        │  /api/v1/*          — internal │
└─────────────┘        │  /api/external/v1/* — external │
                        └───────────┬────────────────────┘
                                    │
                    ┌───────────────┼────────────────────┐
                    ▼               ▼                    ▼
              MySQL 8.0.x    ThreadPoolExecutor      Local /tmp
           (async + sync)   (bulk verification,   or S3 (uploads)
                              SMTP probes)
```

Two parallel API surfaces share the same underlying services:
- **`/api/v1`** — used by the React dashboard, no auth
- **`/api/external/v1`** — used by external developers, `X-API-Key` header required

---

## Getting Started (Windows / PowerShell)

### Prerequisites
- Docker Desktop **or** Python 3.12+ and Node.js 18+ with a local/remote MySQL 8.0.x instance

### Option 1 — Docker Compose (recommended)

```powershell
git clone <repository-url>
cd email-verifier

copy backend\.env.example backend\.env
# edit backend\.env — set DATABASE_URL, SECRET_KEY, ADMIN_PASSWORD, CORS_ORIGINS

docker-compose up -d --build
```

- Frontend: http://localhost
- Backend API: http://localhost:8000
- Swagger docs: http://localhost:8000/docs
- Health check: http://localhost:8000/health

### Option 2 — Manual (local dev)

**Backend:**
```powershell
cd backend
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt

copy .env.example .env
# edit .env with your local MySQL DATABASE_URL etc.

alembic upgrade head
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

**Frontend (separate PowerShell window):**
```powershell
cd frontend
npm install
npm run dev
```
Vite dev server runs on `http://localhost:3000` and proxies `/api` → `http://localhost:8000` (see `vite.config.js`).

---

## Environment Variables (`backend/.env`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes | — | `mysql+pymysql://user:pass@host:3306/dbname` |
| `DB_POOL_SIZE` / `DB_MAX_OVERFLOW` / `DB_POOL_TIMEOUT` / `DB_POOL_RECYCLE` | No | 10 / 20 / 30 / 1800 | SQLAlchemy connection pool tuning |
| `SECRET_KEY` | Yes (prod) | `change-me-in-production` | Signs admin tokens — **must** be changed in production |
| `ADMIN_PASSWORD` | Yes (prod) | `change-me-admin-password` | Login password for `/admin/login` |
| `DEBUG` | No | `false` | Enables human-readable logs; keep `false` in prod |
| `LOG_LEVEL` | No | `INFO` | |
| `CORS_ORIGINS` | Yes (prod) | `["http://localhost:3000"]` | JSON array — must match your real frontend domain in prod |
| `SMTP_TIMEOUT` / `SMTP_RETRIES` / `SMTP_MAX_WORKERS` / `SMTP_MAX_MX_TO_TRY` | No | 3 / 2 / 20 / 2 | Live SMTP probe tuning |
| `SMTP_SENDER_EMAIL` / `SMTP_HELO_DOMAIN` | No | placeholder | Used as the FROM/HELO for SMTP probes — set to your real domain |
| `DISPOSABLE_CACHE_TTL` | No | 86400 (24h) | Refresh interval for the live disposable-domain list |
| `DISPOSABLE_SOURCES` | No | 2 GitHub lists | JSON array of URLs to fetch disposable domains from |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_REGION` / `S3_BUCKET_NAME` | No | — | Only needed if you enable S3 uploads (`services/s3_service.py`) |

**Frontend (`frontend/.env`, optional):**

| Variable | Default | Description |
|---|---|---|
| `VITE_API_URL` | `/api/v1` | Override if the backend isn't proxied at `/api` |

---

## API Reference

### Internal Dashboard API (`/api/v1`) — no auth

| Endpoint | Method | Purpose |
|---|---|---|
| `/verify-email` | POST | Verify a single email |
| `/bulk-upload` | POST | Upload CSV/Excel for bulk verification |
| `/jobs` | GET | List all bulk jobs |
| `/jobs/{job_id}` | GET | Poll job status/progress |
| `/jobs/{job_id}/cancel` | POST | Request graceful cancellation |
| `/jobs/{job_id}` | DELETE | Delete a job + its emails + uploaded file |
| `/jobs/{job_id}/export` | GET | Download job results as CSV |
| `/dashboard/stats` | GET | Full dashboard payload (trust score, breakdowns, trends) |
| `/dashboard/trends` | GET | Verification trend series |
| `/dashboard/domains/new-per-day` | GET | New-domain sparkline data |
| `/emails` | GET | Paginated/filterable/sortable email list |
| `/emails/export` | GET | Export filtered emails as CSV |
| `/emails/{email}` | DELETE | Delete a single email record |
| `/domains` | GET | Paginated/filterable/sortable domain list |
| `/domains/overview` | GET | Aggregate domain stats |
| `/domains/export` | GET | Export filtered domains as CSV |
| `/domains/delete` | POST | Bulk-delete domains (+ their emails) |
| `/notifications` | GET | Paginated notifications + unread count |
| `/notifications/unread-count` | GET | Just the unread count |
| `/notifications/read-all` | POST | Mark all as read |
| `/notifications/{id}/read` | POST | Mark one as read |
| `/notifications/{id}` | DELETE | Delete one notification |
| `/notifications/clear-all` | DELETE | Delete all notifications |
| `/admin/login` | POST | Exchange `ADMIN_PASSWORD` for a 24h token |
| `/admin/api-keys` | GET / POST | List / create external API keys *(requires `X-Admin-Token`)* |
| `/admin/api-keys/{prefix}/activate` | POST | Reactivate a revoked key *(admin)* |
| `/admin/api-keys/{prefix}/revoke` | POST | Revoke a key *(admin)* |
| `/admin/api-keys/{prefix}/usage` | GET | Daily usage chart data *(admin)* |

### External Developer API (`/api/external/v1`) — requires `X-API-Key`

```bash
POST /api/external/v1/verify
Headers: X-API-Key: evp_xxxxxxxxxxxx
Body:    {"email": "user@example.com"}
```

```bash
POST /api/external/v1/bulk
Headers: X-API-Key: evp_xxxxxxxxxxxx
Body:    multipart/form-data (file)
```

```bash
GET /api/external/v1/jobs/{job_id}
GET /api/external/v1/jobs/{job_id}/export
Headers: X-API-Key: evp_xxxxxxxxxxxx
```

Rate limits are per-key (`rate_limit_per_min` for `/verify`, `bulk_limit_per_hour` for `/bulk`), configurable when the key is created (via `/admin/api-keys` or the CLI below).

**Managing API keys via CLI** (before or alongside the admin UI):
```powershell
docker exec -it <backend-container-name> python scripts/manage_api_keys.py create --name "Acme Corp"
docker exec -it <backend-container-name> python scripts/manage_api_keys.py list
docker exec -it <backend-container-name> python scripts/manage_api_keys.py revoke --prefix evp_a1b2c3d4
```

---

## Verification Pipeline

1. **Syntax validation** — RFC-style rules + emoji/space/consecutive-dot checks (`email-validator` + custom rules)
2. **Role-based detection** — checks against a large list of generic prefixes (admin@, support@, etc.)
3. **Disposable-domain check** — hardcoded fallback + a live-fetched list (refreshed every 24h in the background)
4. **Trusted-domain fast path** — known-good domains (Gmail, Outlook, major companies, etc.) skip DNS/SMTP and get a reputation bonus + score floor
5. **Domain DNS existence** — A/MX record lookup with timeout + one patient retry before assuming existence
6. **MX record lookup** — sorted by priority, falls back to the A record if no MX
7. **SMTP verification** — live RCPT probe + a random-address probe on the same domain to detect catch-all
8. **Scoring** — combines all signals + username-quality heuristics (keyboard walks, entropy, vowel ratio, char repetition) into a 0–100 score, then maps to a status (`invalid` → `undeliverable` → `uncertain` → `unconfirmed` → `probably_valid` → `trusted` → `deliverable`)

## Background Processing

Bulk jobs run on a global `ThreadPoolExecutor` (not Celery/Redis, for simpler single-instance deployment):

1. Upload creates a `Job` row and returns `job_id` immediately (202 Accepted)
2. `FastAPI BackgroundTasks` kicks off `process_bulk_job_sync()`
3. Emails are submitted to the executor in parallel; each one gets its own thread-local asyncio event loop (reused across calls, not recreated per email)
4. Every 10 completions, the worker checks `Job.cancel_requested` (fresh DB session, avoids stale reads) — if cancelled, remaining un-started futures are cancelled and in-flight ones are allowed to finish
5. Job counters (`processed`, `verified`, `invalid`, `risky`), `progress_percent`, `current_stage`, and `estimated_time_remaining` update after every email
6. A notification fires on start, completion, cancellation, and failure

---

## Security

- **External API**: `X-API-Key` → SHA-256 hash lookup → per-key rate limiting
- **API keys**: stored only as SHA-256 hashes; the plaintext key is shown exactly once at creation
- **Admin auth**: password → signed HMAC token (24h validity), required via `X-Admin-Token` on all admin routes; login itself is rate-limited (5/min/IP)
- **SQL injection**: fully parameterized via SQLAlchemy; all `sort_by`/`sort_order` query params are whitelisted
- **CORS**: explicit origin list — `main.py` logs a startup warning if it's wildcarded or if `SECRET_KEY`/`ADMIN_PASSWORD` are left at their defaults
- **File uploads**: extension whitelist (`.csv`, `.xlsx`, `.xls`), 50 MB size cap, filenames sanitized before touching the filesystem

---

## Testing

```powershell
cd backend
pytest
pytest --cov=backend
```

---

## Deployment

See **`aws-deployment.md`** for a full step-by-step guide (EC2 + Docker Compose + RDS MySQL + Route 53 + host-level Nginx/Certbot) written specifically for this codebase's actual architecture — not the older ECS/CloudFront reference doc.

For local/self-hosted production, the same `docker-compose.yml` applies — just make sure `backend/.env` has real secrets and `CORS_ORIGINS` points to your real domain.

---

## Project Structure

For the full file-by-file breakdown of both backend and frontend, see **[PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md)**.

---

## License

[Specify your license — e.g., MIT, Apache 2.0]

## Contact

[Your name / team / repository URL]
