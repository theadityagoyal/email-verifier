# Email Verification System

Production-ready email verification platform with a React dashboard, FastAPI backend, Celery workers, MySQL, and Redis.

---

## Features

| Feature | Details |
|---------|---------|
| **Single email verification** | Syntax → DNS → MX → SMTP → disposable → role → catch-all → score |
| **Bulk CSV upload** | Async processing via Celery + Redis queue |
| **Real-time dashboard** | Stats cards, trend charts, domain analytics |
| **Email list** | Paginated, searchable, filterable, CSV export |
| **Domain analytics** | Per-domain breakdown with bounce rate |
| **Job tracking** | Live progress for bulk jobs |
| **AWS ready** | S3, RDS MySQL, ElastiCache, EC2/ECS |

---

## Project Structure

```
email-verifier/
├── backend/
│   ├── api/v1/endpoints/
│   │   ├── verify.py          # POST /api/v1/verify-email
│   │   ├── bulk.py            # POST /api/v1/bulk-upload, GET /jobs/{id}
│   │   └── dashboard.py       # Stats, trends, email list, domains
│   ├── models/
│   │   ├── models.py          # SQLAlchemy ORM models
│   │   └── database.py        # Async + sync engine/session
│   ├── schemas/
│   │   └── schemas.py         # Pydantic request/response models
│   ├── services/
│   │   ├── email_service.py   # Full verification pipeline
│   │   └── s3_service.py      # AWS S3 helpers
│   ├── validators/
│   │   ├── syntax_validator.py
│   │   ├── dns_validator.py
│   │   ├── smtp_validator.py
│   │   ├── disposable_checker.py
│   │   └── score_calculator.py
│   ├── tasks/
│   │   ├── celery_app.py      # Celery configuration
│   │   └── verification_tasks.py
│   ├── migrations/            # Alembic migrations
│   ├── tests/
│   │   └── test_validators.py
│   ├── utils/
│   │   ├── config.py          # Pydantic settings
│   │   └── logging.py         # Structured logging
│   ├── main.py                # FastAPI application
│   ├── requirements.txt
│   ├── Dockerfile
│   └── alembic.ini
│
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── DashboardPage.jsx
│   │   │   ├── VerifyPage.jsx
│   │   │   ├── EmailListPage.jsx
│   │   │   ├── DomainsPage.jsx
│   │   │   └── BulkUploadPage.jsx
│   │   ├── components/
│   │   │   ├── ui/            # StatCard, StatusBadge, BoolIcon
│   │   │   └── charts/        # TrendsChart, DomainBarChart, StatusPieChart
│   │   ├── layouts/
│   │   │   └── Sidebar.jsx
│   │   ├── services/
│   │   │   └── api.js         # Axios API layer
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── tailwind.config.js
│   └── vite.config.js
│
├── docker-compose.yml
└── AWS_DEPLOYMENT.md
```

---

## Quick Start (Docker Compose)

### Prerequisites
- Docker Engine 24+
- Docker Compose v2

### 1. Clone and configure

```bash
git clone <repo>
cd email-verifier

# Backend env
cp backend/.env.example backend/.env
# Edit backend/.env — add AWS credentials if using S3

# Root env (MySQL password)
cp .env.example .env
```

### 2. Start all services

```bash
docker-compose up -d --build
```

This starts:
| Container | Port | Purpose |
|-----------|------|---------|
| `ev_mysql` | 3306 | MySQL 8.0 database |
| `ev_redis` | 6379 | Redis broker + result backend |
| `ev_backend` | 8000 | FastAPI (runs migrations on start) |
| `ev_worker` | — | Celery verification worker |
| `ev_flower` | 5555 | Celery monitoring UI |
| `ev_frontend` | 80 | React dashboard via Nginx |

### 3. Access

| URL | Description |
|-----|-------------|
| http://localhost | React Dashboard |
| http://localhost:8000/docs | Swagger API docs |
| http://localhost:5555 | Flower (Celery monitor) |

---

## Local Development (without Docker)

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
pip install aiomysql

# Start MySQL + Redis locally or via Docker:
docker run -d -p 3306:3306 -e MYSQL_ROOT_PASSWORD=password -e MYSQL_DATABASE=email_verifier mysql:8.0
docker run -d -p 6379:6379 redis:7-alpine

cp .env.example .env   # edit DATABASE_URL and REDIS_URL for local

# Run migrations
alembic upgrade head

# Start API
uvicorn main:app --reload --port 8000

# Start Celery worker (separate terminal)
celery -A tasks.celery_app worker --loglevel=info
```

### Frontend

```bash
cd frontend
npm install
npm run dev      # http://localhost:3000
```

---

## API Reference

### POST `/api/v1/verify-email`

```bash
curl -X POST http://localhost:8000/api/v1/verify-email \
  -H "Content-Type: application/json" \
  -d '{"email": "john@gmail.com"}'
```

**Response:**
```json
{
  "email": "john@gmail.com",
  "domain": "gmail.com",
  "status": "verified",
  "syntax_valid": true,
  "domain_exists": true,
  "mx_found": true,
  "smtp_valid": true,
  "disposable": false,
  "role_based": false,
  "catch_all": false,
  "score": 100,
  "verified_at": "2024-01-15T10:30:00Z"
}
```

### POST `/api/v1/bulk-upload`

```bash
curl -X POST http://localhost:8000/api/v1/bulk-upload \
  -F "file=@emails.csv"
```

**CSV format:**
```csv
email
john@gmail.com
jane@yahoo.com
test@company.com
```

**Response:**
```json
{
  "job_id": "abc-123-def",
  "message": "Job queued",
  "total_emails": 3
}
```

### GET `/api/v1/jobs/{job_id}`

```bash
curl http://localhost:8000/api/v1/jobs/abc-123-def
```

**Response:**
```json
{
  "job_id": "abc-123-def",
  "status": "processing",
  "total": 10000,
  "processed": 8500,
  "verified": 7000,
  "invalid": 1000,
  "risky": 500
}
```

### GET `/api/v1/emails` (list with filters)

```bash
curl "http://localhost:8000/api/v1/emails?page=1&size=20&status=verified&search=gmail"
```

### GET `/api/v1/dashboard/stats`

```bash
curl http://localhost:8000/api/v1/dashboard/stats
```

---

## Scoring System

| Check | Weight | Pass condition |
|-------|--------|----------------|
| Syntax valid | +20 | Valid email format |
| Domain exists | +20 | A/AAAA DNS record found |
| MX records | +20 | At least one MX record |
| SMTP valid | +20 | RCPT TO accepted |
| Not disposable | +10 | Domain not in blocklist |
| Not catch-all | +10 | Server rejects random addresses |

**Status thresholds:**
- `verified` — score ≥ 70 AND smtp_valid AND not disposable AND not catch-all
- `risky` — score 50–69, or disposable, or catch-all
- `invalid` — syntax/domain/MX failed, or score < 50

---

## Running Tests

```bash
cd backend
pip install pytest pytest-asyncio pytest-mock
pytest tests/ -v
```

---

## Production Checklist

- [ ] Change `SECRET_KEY` to a random 32-byte hex string
- [ ] Set strong `MYSQL_ROOT_PASSWORD`
- [ ] Configure real AWS credentials and S3 bucket
- [ ] Set `DEBUG=false`
- [ ] Set `CORS_ORIGINS` to your actual domain
- [ ] Enable HTTPS (via CloudFront or ALB + ACM)
- [ ] Set up DB backups (RDS automated backups)
- [ ] Configure log aggregation (CloudWatch)
- [ ] Set up alerting on queue depth and error rates
- [ ] Review and expand the disposable domain list
- [ ] Configure SMTP timeout values for your traffic volume

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| API | FastAPI + Uvicorn |
| ORM | SQLAlchemy 2.0 (async) |
| Migrations | Alembic |
| Database | MySQL 8.0 |
| Queue | Celery + Redis |
| Storage | AWS S3 |
| Frontend | React 18 + Vite |
| Styling | Tailwind CSS |
| Charts | Recharts |
| State | TanStack Query |
| Deployment | Docker Compose / AWS ECS |
