# Email Verifier System - Project Structure Documentation

## Overview

This document provides a comprehensive overview of the complete folder structure and purpose of each directory and file in the Email Verifier system.

---

## Root Directory Structure

```text
email-verifier/
├── backend/                    # Backend FastAPI application
├── frontend/                   # Frontend React application
├── docker-compose.yml          # Docker Compose configuration
└── README.md                   # Project documentation
```

---

## Backend Structure

### Directory Tree

```text
backend/
├── api/                        # API route definitions
│   ├── external/               # External developer API
│   │   └── v1/                 # Version 1 API
│   │       ├── endpoints/      # API endpoint handlers
│   │       │   ├── bulk.py     # Bulk email verification endpoints
│   │       │   └── verify.py   # Single email verification endpoints
│   │       ├── dependencies.py # API dependencies (rate limiting, auth)
│   │       ├── router.py       # API router configuration
│   │       └── __init__.py     # Package initializer
│   ├── v1/                     # Internal dashboard API
│   │   ├── endpoints/          # API endpoint handlers
│   │   │   ├── bulk.py         # Bulk upload and job management
│   │   │   ├── dashboard.py    # Dashboard statistics and analytics
│   │   │   └── verify.py       # Email verification endpoints
│   │   ├── __init__.py         # Package initializer
│   │   └── router.py           # API router configuration
│   ├── __init__.py             # Package initializer
│   └── __init__.py             # Package initializer

├── core/                       # Core application configuration

├── database/                   # Database configuration and migrations
│   ├── alembic.ini             # Alembic configuration
│   └── versions/               # Database migration scripts
│       ├── 0001_initial.py                 # Initial schema
│       ├── 755992d1fcc0_add_columns_for_bulk_upload_redesign.py
│       ├── a1e5f9c3b7d2_add_api_keys.py
│       └── d0739350dd1a_add_columns_for_job_stages_and_email_status.py

├── models/                     # SQLAlchemy database models
│   ├── database.py             # Database connection and session management
│   ├── models.py               # Database models (Email, Domain, Job, ApiKey)
│   └── __init__.py             # Package initializer

├── schemas/                    # Pydantic schemas for request/validation
│   ├── schemas.py              # Request and response schemas
│   └── __init__.py             # Package initializer

├── services/                   # Business logic services
│   ├── email_service.py        # Main email verification pipeline
│   ├── s3_service.py           # S3 file storage abstraction
│   └── __init__.py             # Package initializer

├── tasks/                      # Background processing tasks
│   ├── bulk_processor.py       # ThreadPoolExecutor-based bulk processing
│   └── __init__.py             # Package initializer

├── utils/                      # Utility functions and helpers
│   ├── config.py               # Application configuration management
│   ├── email_utils.py          # Email column detection and file utilities
│   ├── executor.py             # Thread pool executor management
│   ├── logging.py              # Structured logging configuration
│   └── __init__.py             # Package initializer

├── validators/                 # Email validation components
│   ├── disposable_checker.py   # Disposable email domain detection
│   ├── dns_validator.py        # DNS/MX record validation
│   ├── smtp_validator.py       # SMTP connection verification
│   ├── score_calculator.py     # Email scoring algorithm
│   ├── syntax_validator.py     # Email syntax validation
│   └── __init__.py             # Package initializer

├── tests/                      # Test suite
│   ├── __init__.py             # Package initializer
│   └── [various test files]    # Unit and integration tests

├── .dockerignore               # Docker ignore file
├── .env                        # Environment variables (not in version control)
├── .env.example                # Example environment variables
├── Dockerfile                  # Docker container definition
├── alembic.ini                 # Alembic migration configuration
├── entrypoint.sh               # Container startup script
├── main.py                     # FastAPI application entry point
├── pytest.ini                  # Pytest configuration
└── requirements.txt            # Python dependencies
```

---

## Frontend Structure

### Directory Tree

```text
frontend/
├── public/                     # Static assets
│   └── [various assets]        # Favicon, robots.txt, etc.

├── src/                        # Source code
│   ├── assets/                 # Static assets (images, icons, etc.)
│
│   ├── components/             # Reusable UI components
│   │   ├── charts/             # Chart components (Recharts)
│   │   │   ├── [chart components]
│   │   │   └── index.js
│   │   ├── layout/             # Layout components (header, footer, sidebar)
│   │   │   ├── [layout.jsx]
│   │   │   └── index.js
│   │   ├── ui/                 # Reusable UI components (buttons, inputs, modals)
│   │   │   ├── [component files]
│   │   │   └── index.js
│   │   └── [component files]
│
│   ├── pages/                  # Page-level components
│   │   ├── BulkUploadPage.jsx  # File upload and job management page
│   │   ├── DashboardPage.jsx   # Main dashboard with analytics
│   │   ├── DomainsPage.jsx     # Domain analytics and management
│   │   ├── EmailListPage.jsx   # Email verification history and search
│   │   └── VerifyEmailPage.jsx # Single email verification interface
│
│   ├── services/               # API service modules
│   │   ├── api.js              # Axios instance and base configuration
│   │   ├── authService.js      # Authentication API calls
│   │   ├── dashboardService.js # Dashboard data API calls
│   │   ├── emailService.js     # Email verification API calls
│   │   └── jobService.js       # Job management API calls
│
│   ├── utils/                  # Utility functions and helpers
│   │   ├── constants.js        # Application constants
│   │   ├── helpers.js          # Helper functions
│   │   └── utils.js            # Utility functions
│
│   ├── styles/                 # CSS and styling
│   │   ├── index.css           # Global styles
│   │   └── [other CSS files]   # Component-specific styles
│
│   ├── App.jsx                 # Main application component
│   ├── index.css               # Global CSS imports
│   ├── index.jsx               # Application entry point
│   ├── main.jsx                # ReactDOM rendering
│   ├── postcss.config.js       # PostCSS configuration
│   ├── tailwind.config.js      # Tailwind CSS configuration
│   └── vite.config.js          # Vite build configuration

├── .git                        # Git repository metadata
├── Dockerfile                  # Docker container definition
├── index.html                  # HTML template
├── nginx.conf                  # Nginx configuration for production
├── package-lock.json           # NPM lockfile
├── package.json                # NPM dependencies and scripts
├── postcss.config.js           # PostCSS configuration
└── vite.config.js              # Vite build configuration
```

---

## Database Schema

### emails Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | Integer | Primary key |
| `email` | String | Email address (unique, indexed) |
| `domain` | String | Extracted domain (indexed) |
| `status` | Enum | Verification status |
| `syntax_valid` | Boolean | Syntax validation result |
| `domain_exists` | Boolean | Domain existence check |
| `mx_found` | Boolean | MX record found |
| `smtp_valid` | Boolean | SMTP validation result |
| `disposable` | Boolean | Disposable email check |
| `role_based` | Boolean | Role-based email check |
| `catch_all` | Boolean | Catch-all domain check |
| `score` | Integer | Score (0-100) |
| `verified_at` | Timestamp | Verification timestamp (indexed) |
| `job_id` | Foreign Key | Reference to jobs table |
| `created_at` | Timestamp | Creation timestamp |
| `updated_at` | Timestamp | Last update timestamp |

### domains Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | Integer | Primary key |
| `domain` | String | Domain name (unique, indexed) |
| `mx_records` | JSON | Array of MX records |
| `total_emails` | Integer | Total emails counter |
| `verified_count` | Integer | Verified emails counter |
| `invalid_count` | Integer | Invalid emails counter |
| `risky_count` | Integer | Risky emails counter |
| `bounce_rate` | Float | Bounce rate (0-100) |
| `created_at` | Timestamp | Creation timestamp |
| `updated_at` | Timestamp | Last update timestamp |

### jobs Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | Integer | Primary key |
| `job_id` | UUID | Unique job identifier (indexed) |
| `file_name` | String | Original filename |
| `s3_key` | String | Storage reference |
| `status` | Enum | Job status |
| `current_stage` | String | Processing stage description |
| `progress_percent` | Integer | Progress (0-100) |
| `estimated_time_remaining` | Integer | Estimated time in seconds |
| `started_at` | Timestamp | Job start time |
| `completed_at` | Timestamp | Job completion time |
| `error_details` | JSON | Error information |
| `total` | Integer | Total emails to process |
| `processed` | Integer | Emails processed so far |
| `verified` | Integer | Count of valid emails |
| `invalid` | Integer | Count of invalid emails |
| `risky` | Integer | Count of risky emails |
| `error_message` | Text | Error message |
| `created_at` | Timestamp | Creation timestamp |
| `updated_at` | Timestamp | Last update timestamp |

### api_keys Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | Integer | Primary key |
| `key_hash` | String | SHA-256 hash of API key (unique, indexed) |
| `key_prefix` | String | First 8 chars of key for display |
| `name` | String | Key description/name |
| `is_active` | Boolean | Active status |
| `rate_limit_per_min` | Integer | Requests per minute limit |
| `bulk_limit_per_hour` | Integer | Bulk uploads per hour limit |
| `last_used_at` | Timestamp | Last usage timestamp |
| `created_at` | Timestamp | Creation timestamp |

---

## Security Considerations

### Authentication & Authorization

- **API Keys**: External API uses API key authentication with `X-API-Key` header
- **Passwords**: Not applicable (no user authentication in current implementation)
- **Secrets**: Database credentials, API keys stored in environment variables

### Data Protection

- **Email Storage**: Email addresses stored as-is (consider hashing for GDPR compliance if needed)
- **API Keys**: Stored as salted hashes (never plaintext)
- **File Uploads**: Scanned for malicious content (basic extension validation)

### Rate Limiting

- **Per-IP**: Implemented via middleware (can be enhanced)
- **Per-API Key**: Configurable limits for email verification and bulk uploads
- **Endpoints**: Different limits for different endpoint types

### Input Validation

- **File Uploads**: Extension and size validation
- **Email Input**: Length and format validation via Pydantic
- **SQL Injection**: Protected by SQLAlchemy ORM
- **XSS**: React auto-escapes content; backend returns JSON only

---

## Extending the System

### Adding New Validation Rules

1. Create new validator in `/validators/` module
2. Import and call it in `email_service.verify_email()`
3. Update `EmailVerifyResponse` schema if needed
4. Update database schema if persistent storage needed
5. Update frontend to display new validation results

### Changing Storage Backend

1. Modify `services/s3_service.py` to implement desired storage
2. Update configuration in `utils/config.py`
3. Ensure proper permissions for new storage service

### Adding New API Endpoints

1. Add route to appropriate `/api/*/endpoints/` file
2. Create Pydantic schemas in `/schemas/schemas.py` if needed
3. Implement business logic in services or directly in endpoint
4. Add appropriate error handling and logging
5. Write unit and integration tests
6. Update frontend service methods if needed

### Database Migrations

1. Modify `/models/models.py` with new fields or tables
2. Generate migration: `alembic revision --autogenerate -m "description"`
3. Review generated migration in `/database/versions/`
4. Apply migration: `alembic upgrade head`

---

## Performance Considerations

### Database Indexes

Strategic indexes on frequently queried columns:

- `emails.email` (unique)
- `emails.domain` (for domain lookups)
- `emails.status` (for filtering)
- `emails.job_id` (for job-based queries)
- `emails.verified_at` (for time-based queries)
- `jobs.job_id` (unique)
- `jobs.status` (for queue processing)
- `domains.domain` (unique)

### Connection Pooling

SQLAlchemy connection pooling configured via:

- `DB_POOL_SIZE`: Base number of connections
- `DB_MAX_OVERFLOW`: Additional connections allowed
- `DB_POOL_TIMEOUT`: Seconds to wait for connection
- `DB_POOL_RECYCLE`: Seconds before connection refresh

### Concurrent Processing

- ThreadPoolExecutor size configurable via `WORKERS` environment variable
- Optimal value typically equals number of CPU cores
- I/O-bound nature of email verification benefits from threading

### Caching Opportunities

- Domain DNS lookups could be cached (Redis recommended)
- Frequently accessed domains could be cached
- Consider implementing LRU cache for expensive operations

---

## Monitoring & Observability

### Logging

Structured logging via structlog with JSON output. Key loggers:

- Application startup/shutdown
- HTTP requests/responses with timing
- Email verification steps
- Database operations
- Background task progress
- Error conditions with stack traces

### Metrics Collection

Consider integrating with Prometheus/Grafana for:

- Request latency and throughput
- Database query performance
- Background job processing rates
- Error rates and failure categories
- System resource utilization (CPU, memory, disk)

### Health Checks

- `/health` endpoint returns basic service status
- Database connectivity verified on startup
- Can be extended to check:
  - Disk space availability
  - Mail server connectivity
  - External service dependencies

---

## Development Setup

### Prerequisites

- Python 3.12+
- Node.js 18+
- Docker and Docker Compose (recommended)
- MySQL 5.7+ or compatible

### Backend Setup

```bash
# Clone repository
git clone <repository-url>
cd email-verifier/backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Linux/Mac
# or
.\venv\Scripts\activate  # Windows

# Install dependencies
pip install -r requirements.txt

# Set up environment
cp .env.example .env
# Edit .env with your configuration

# Run migrations
alembic upgrade head

# Start development server
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend Setup

```bash
cd ../frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

### Docker Setup

```bash
# From project root
docker-compose up --build

# Services will be available at:
# Backend API: http://localhost:8000
# Frontend UI: http://localhost
# API Docs: http://localhost:8000/docs
```

---

## Testing

### Backend Tests

```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=backend

# Run specific test file
pytest tests/test_specific_feature.py
```

### Frontend Tests

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch
```

---

## Environment Variables

### Backend (.env)

```env
# Server
HOST=0.0.0.0
PORT=8000
DEBUG=False

# Database
DATABASE_URL=mysql+pymysql://user:password@localhost/dbname
DB_POOL_SIZE=10
DB_MAX_OVERFLOW=20
DB_POOL_TIMEOUT=30
DB_POOL_RECYCLE=3600

# Security
SECRET_KEY=your-secret-key-here
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# CORS
BACKEND_CORS_ORIGINS=["http://localhost:3000","http://localhost"]

# Email Verification
WORKERS=4  # ThreadPoolExecutor worker count
MAX_FILE_SIZE_MB=50
SMTP_TIMEOUT=10
DNS_TIMEOUT=5

# File Storage
USE_S3=False  # Set to True to use S3 instead of local storage
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_S3_BUCKET=your-bucket-name
AWS_S3_REGION=us-east-1

# Rate Limiting
DEFAULT_RATE_LIMIT_PER_MIN=60
DEFAULT_BULK_LIMIT_PER_HOUR=5

# Logging
LOG_LEVEL=INFO
```

### Frontend (.env)

```env
VITE_API_BASE_URL=http://localhost:8000/api/v1
VITE_EXTERNAL_API_BASE_URL=http://localhost:8000/api/external/v1
```

---

## License

[Specify your license - e.g., MIT License, Apache License 2.0, etc.]

---

## Contact

[Your name or team name]  
[Your email or contact information]  
[Project repository URL]
