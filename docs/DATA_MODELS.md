# Data Models

## Overview
The application uses SQLAlchemy 2.0 ORM with a MySQL 8.0 backend. Alembic handles migrations.

## Tables

### emails
Stores each email address and its verification results.

| Column | Type | Description |
|--------|------|-------------|
| id | BIGINT PK | Auto-increment primary key |
| email | VARCHAR(255) | Original email address (lowercased) |
| domain | VARCHAR(255) | Extracted domain part |
| status | ENUM('verified','risky','invalid') | Final classification |
| score | TINYINT | 0‑100 based on weighted checks |
| syntax_valid | BOOLEAN | Passed syntax check |
| domain_exists | BOOLEAN | DNS A/AAAA record found |
| mx_found | BOOLEAN | At least one MX record |
| smtp_valid | BOOLEAN | RCPT TO accepted |
| disposable | BOOLEAN | Domain in disposable list |
| role_based | BOOLEAN | Role‑based address (admin, support, etc.) |
| catch_all | BOOLEAN | Domain accepts random addresses |
| verified_at | DATETIME | Timestamp when verification completed |
| job_id | VARCHAR(36) | FK to jobs.job_id (nullable for single verifications) |
| created_at | DATETIME | Record creation timestamp |

### domains
Aggregated statistics per domain.

| Column | Type | Description |
|--------|------|-------------|
| id | BIGINT PK | Auto-increment |
| domain | VARCHAR(255) PK (unique) | Domain name |
| total_emails | INT | Number of emails seen for this domain |
| verified_count | INT | Count of emails marked verified |
| invalid_count | INT | Count of emails marked invalid |
| risky_count | INT | Count of emails marked risky |
| bounce_rate | FLOAT | Estimated bounce percentage (derived) |
| last_seen | DATETIME | Most recent timestamp for this domain |
| created_at | DATETIME | Record creation timestamp |

### jobs
Tracks bulk upload jobs.

| Column | Type | Description |
|--------|------|-------------|
| job_id | VARCHAR(36) PK | UUID (e.g., "abc-123-def") |
| status | ENUM('pending','processing','completed','failed') | Current job state |
| total_emails | INT | Total rows in uploaded CSV |
| processed | INT | Number of emails processed so far |
| verified | INT | Number of emails classified as verified |
| invalid | INT | Number classified as invalid |
| risky | INT | Number classified as risky |
| s3_key | VARCHAR(255) | Optional S3 object key for uploaded CSV |
| created_at | DATETIME | Job creation timestamp |
| completed_at | DATETIME | Timestamp when job finished (nullable) |

### alembic_version
Standard Alembic table for migration version tracking.

| Column | Type |
|--------|------|
| version_num | VARCHAR(32) PK |

## Relationships
- `emails.job_id` → `jobs.job_id` (optional, NULL for single‑email verification)
- No direct foreign key between `emails` and `domains`; domain stats are updated via aggregates/triggers or application logic.

## Indexes
- `emails(email)` – unique? currently not unique to allow re‑verification; index for lookup.
- `emails(domain)` – for domain‑based queries.
- `emails(job_id)` – for job‑wide exports.
- `domains(domain)` – primary key.
- `jobs(job_id)` – primary key.

## Notes
- All timestamps stored in UTC.
- String lengths chosen to accommodate typical email/domain sizes.
- ENUM values are stored as strings; application enforces valid values.