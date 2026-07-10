# Email Verifier System

A production-ready email verification system with both internal dashboard and external API interfaces. The system provides single and bulk email verification with comprehensive validation including syntax, domain, MX records, SMTP verification, disposable email detection, role-based detection, and scoring.

## Features

- **Single Email Verification**: Real-time email validation through API endpoints
- **Bulk Email Verification**: Upload CSV/Excel files for bulk processing with job tracking
- **Job Management**: Secure API key authentication for external API access
- **Job Tracking**: Monitor progress of bulk verification jobs
- **Result Export**: Download verification results in CSV format
- **Dashboard Analytics**: Visual dashboard with email statistics and domain analytics
- **Rate Limiting**: Configurable rate limits for API protection
- **File Upload**: Support for CSV and Excel files (up to 50MB)
- **Comprehensive Validation**: Multi-step email validation pipeline including disposable, role-based, and catch-all detection

## Technology Stack

### Backend
- **Framework**: FastAPI (Python 3.12+)
- **Database**: MySQL with SQLAlchemy ORM
- **Validation**: 
  - Syntax: email-validator, custom syntax validation
  - Domain/DNS: dnspython
  - SMTP: Direct SMTP connection verification
  - Disposable: Custom disposable email domain detection
  - Role-based: Role account detection (admin, info, support, etc.)
  - Scoring: Custom scoring algorithm (0-100)
- **Background Processing**: ThreadPoolExecutor (replaces Celery for simpler deployment)
- **File Processing**: Pandas for CSV/Excel handling
- **API Documentation**: Automatic Swagger/OpenAPI docs
- **Logging**: Structured logging with structlog

### Frontend
- **Framework**: React 18+
- **State Management**: React Query (TanStack Query)
- **Routing**: React Router DOM v6
- **Styling**: Tailwind CSS
- **Charts**: Recharts for data visualization
- **Notifications**: React Hot Toast
- **Icons**: Lucide React
- **Build Tool**: Vite

### Infrastructure
- **Containerization**: Docker & Docker Compose
- **Environment**: Environment variable configuration
- **File Storage**: Local file storage (configurable for S3)

## Architecture Overview

```
Client (Web Browser/Mobile/App)
         ↓
[Load Balancer/Reverse Proxy] (Optional - Nginx in Docker)
         ↓
┌─────────────────┐              ┌──────────────────┐
│   Frontend App  ◄────────────►  Backend API        │
│  (React/Vite)   │              │ (FastAPI)         │
└─────────────────┘              └──────────────────┘
         ↓                             ↓
           ┌─────────────────────────────────────┐
           │           Database Layer            │
           │  (MySQL + SQLAlchemy ORM)           │
           └─────────────────────────────────────┘
         ↓                             ↓
[Background Workers]            [File Storage]
(ThreadPoolExecutor)          (Local/S3 Storage)
```

## Getting Started

### Prerequisites

- Docker and Docker Compose
- OR
- Python 3.12+ and Node.js 18+ (for local development)
- MySQL database

### Installation

#### Option 1: Docker Compose (Recommended)

1. Clone the repository:
```bash
git clone <repository-url>
cd email-verifier
```

2. Copy environment files:
```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env  # If exists
```

3. Configure environment variables in `backend/.env`:
   - Database connection settings
   - API keys (if using external services)
   - File upload limits
   - Rate limiting settings

4. Start the application:
```bash
docker-compose up -d
```

5. Access the application:
   - Frontend: http://localhost
   - Backend API: http://localhost:8000
   - API Documentation: http://localhost:8000/docs

#### Option 2: Manual Installation

##### Backend Setup
```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Run database migrations
alembic upgrade head

# Start the server
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

##### Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

### Environment Variables

#### Backend (.env)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| DATABASE_URL | Yes | mysql+pymysql://user:pass@localhost/db | Database connection URL |
| DB_POOL_SIZE | No | 5 | Database connection pool size |
| DB_MAX_OVERFLOW | No | 10 | Max overflow connections |
| DEBUG | No | False | Enable debug mode |
| CORS_ORIGINS | No | ["*"] | CORS allowed origins (JSON array) |
| MAX_FILE_SIZE_MB | No | 50 | Maximum file upload size in MB |
| RATE_LIMIT_PER_MIN | No | 60 | API key rate limit per minute |
| BULK_LIMIT_PER_HOUR | No | 5 | API key bulk upload limit per hour |

#### Frontend (.env)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| VITE_API_BASE_URL | Yes | http://localhost:8000 | Backend API base URL |

## API Documentation

### Internal API (/api/v1)
Accessible via the dashboard interface. Provides full dashboard functionality.

### External Developer API (/api/external/v1)
Designed for programmatic access with API key authentication.

#### Authentication
External API uses `X-API-Key` header for authentication.

#### Endpoints

##### Single Email Verification
```
POST /api/external/v1/verify
Headers: X-API-Key: your_api_key
Body: {"email": "user@example.com"}
```

##### Bulk Upload
```
POST /api/external/v1/bulk
Headers: X-API-Key: your_api_key
Body: multipart/form-data (file)
```

##### Job Status
```
GET /api/external/v1/jobs/{job_id}
Headers: X-API-Key: your_api_key
```

##### Export Results
```
GET /api/external/v1/jobs/{job_id}/export
Headers: X-API-Key: your_api_key
```

### Internal Dashboard API
Used by the React frontend - same endpoints as external but without API key requirement.

## Database Schema

### Tables

#### emails
Stores individual email verification results.

| Column | Type | Description |
|--------|------|-------------|
| id | BigInt | Primary key |
| email | String(255) | Email address (unique) |
| domain | String(255) | Extracted domain |
| status | Enum | Verification status |
| syntax_valid | Boolean | Syntax validation result |
| domain_exists | Boolean | Domain DNS existence |
| mx_found | Boolean | MX records found |
| smtp_valid | Boolean | SMTP verification passed |
| disposable | Boolean | Disposable email detected |
| role_based | Boolean | Role-based account detected |
| catch_all | Boolean | Catch-all domain detected |
| score | Integer | Validation score (0-100) |
| verified_at | DateTime | Verification timestamp |
| job_id | String(100) | Associated job ID (nullable) |
| created_at | DateTime | Record creation time |
| updated_at | DateTime | Last update time |

#### domains
Aggregated domain statistics.

| Column | Type | Description |
|--------|------|-------------|
| id | BigInt | Primary key |
| domain | String(255) | Domain name (unique) |
| mx_records | JSON | MX records data |
| total_emails | Integer | Total emails checked for domain |
| verified_count | Integer | Verified emails count |
| invalid_count | Integer | Invalid emails count |
| risky_count | Integer | Risky emails count |
| bounce_rate | Float | Calculated bounce rate (%) |
| created_at | DateTime | Record creation time |
| updated_at | DateTime | Last update time |

#### jobs
Bulk job tracking.

| Column | Type | Description |
|--------|------|-------------|
| id | BigInt | Primary key |
| job_id | String(100) | Unique job identifier |
| file_name | String(500) | Original filename |
| s3_key | String(500) | Storage key (local or S3) |
| status | Enum | Job status |
| current_stage | String(20) | Processing stage |
| progress_percent | Integer | Progress percentage (0-100) |
| estimated_time_remaining | Integer | ETA in seconds |
| started_at | DateTime | Job start time |
| completed_at | DateTime | Job completion time |
| error_details | JSON | Error information |
| total | Integer | Total emails to process |
| processed | Integer | Emails processed |
| verified | Integer | Verified emails count |
| invalid | Integer | Invalid emails count |
| risky | Integer | Risky emails count |
| error_message | Text | Error message |
| created_at | DateTime | Job creation time |
| updated_at | DateTime | Last update time |

#### api_keys
External API key management.

| Column | Type | Description |
|--------|------|-------------|
| id | BigInt | Primary key |
| key_hash | String(64) | SHA-256 hash of API key |
| key_prefix | String(20) | First few chars of key (for display) |
| name | String(255) | Key description/name |
| is_active | Boolean | Active status |
| rate_limit_per_min | Integer | Rate limit per minute |
| bulk_limit_per_hour | Integer | Bulk upload limit per hour |
| last_used_at | DateTime | Last usage timestamp |
| created_at | DateTime | Creation time |

## Validation Process

The email verification pipeline consists of the following steps:

1. **Syntax Validation**: Checks RFC 5322 compliance using email-validator library
2. **Role-based Detection**: Identifies role accounts (admin@, info@, support@, etc.)
3. **Disposable Domain Check**: Compares domain against known disposable email domains
4. **Trusted Domain Shortcut**: Skips DNS/SMTP for trusted domains (gmail.com, yahoo.com, etc.)
5. **Domain DNS Validation**: Verifies domain exists via DNS A/AAAA record lookup
6. **MX Record Lookup**: Retrieves and validates MX records for the domain
7. **SMTP Verification**: 
   - Connects to mail server
   - Performs SMTP handshake
   - Checks for catch-all configuration
   - Validates email deliverability (without sending actual email)
8. **Scoring Algorithm**: Calculates confidence score (0-100) based on:
   - Syntax validity
   - Domain reputation
   - MX record validity
   - SMTP response
   - Disposable/role-based flags
   - Username analysis

## Security Features

- **API Key Authentication**: External API requires valid API key
- **Rate Limiting**: Configurable limits per API key
- **Input Validation**: Strict validation on all inputs
- **File Upload Security**:
  - File type validation (CSV/XLSX only)
  - Size limits (configurable, default 50MB)
  - Content validation (email format checking)
- **Password/Key Hashing**: API keys stored as SHA-256 hashes
- **SQL Injection Protection**: SQLAlchemy ORM with parameterized queries
- **CORS Protection**: Configurable CORS origins
- **Environment Variables**: Sensitive configuration via environment variables

## Background Processing

The system uses a ThreadPoolExecutor for background job processing instead of Celery for simpler deployment:

1. **Job Creation**: File uploaded via API creates job record
2. **Background Task**: FastAPI BackgroundTasks initiates processing
3. **Thread Pool**: Emails processed concurrently using ThreadPoolExecutor
4. **Progress Updates**: Job status updated in real-time
5. **Completion Handling**: Results stored, job marked as completed/failed

## Error Handling

- **Global Exception Handler**: Catches unhandled exceptions and returns 500
- **HTTP Exception Handling**: Returns appropriate status codes (400, 401, 404, 409, 413, 500)
- **Validation Errors**: Detailed validation error messages
- **Database Transaction Safety**: Automatic rollback on errors
- **File Processing Errors**: Graceful handling of malformed files
- **External Service Failures**: Graceful degradation when external services fail

## Logging

Structured logging using structlog with:
- Request tracking (method, path, duration)
- Error logging with stack traces
- Business logic events (verification started/completed)
- Database operation logging
- Background job progress tracking

## Project Structure

For a complete breakdown of the project structure, please refer to [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md).

## Testing

Run tests with:
```bash
# Backend tests
cd backend
pytest

# Frontend tests (if applicable)
cd frontend
npm test
```

## Docker Deployment

The project includes Dockerfiles for both frontend and backend:

### Backend Dockerfile
- Based on Python 3.12-slim
- Installs system dependencies (gcc, MySQL dev libraries)
- Installs Python dependencies
- Copies application code
- Exposes port 8000

### Frontend Dockerfile
- Multi-stage build:
  1. Builder stage: Node.js 20-alpine for building React app
  2. Production stage: Nginx-alpine serving built assets
- Includes health check endpoint

### Docker Compose
- Defines backend and frontend services
- Configures networking between services
- Sets up volume mounts for development
- Configures restart policies
- Exposes ports:
  - Backend: 8000 (host) → 8000 (container)
  - Frontend: 80 (host) → 80 (container)

## Deployment

### Production Considerations
1. **Environment Variables**: Use secure secrets management
2. **Database**: Use managed database service with backups
3. **Storage**: Consider S3 or similar for file storage in production
4. **Monitoring**: Add health checks and monitoring
5. **Load Balancing**: Use reverse proxy (NGINX) for SSL termination
6. **Rate Limiting**: Adjust based on expected traffic
7. **Email Limits**: Configure SMTP rate limits to avoid blacklisting

### Scaling
- **Horizontal Scaling**: Multiple backend instances behind load balancer
- **Database**: Read replicas for read-heavy workloads
- **Processing**: Increase ThreadPoolExecutor workers based on CPU cores
- **Caching**: Consider Redis for frequent domain lookups

## License

[Specify your license here - e.g., MIT, Apache 2.0, etc.]

## Contact

[Your contact information or repository maintainers]