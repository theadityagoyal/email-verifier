# API Reference

Base URL: `http://localhost:8000/api/v1`

## Authentication
Currently no authentication is implemented. For production, consider adding API key or JWT middleware.

## Endpoints

### Verify Single Email
- **POST** `/verify-email`
- Body: `{ "email": "user@example.com" }`
- Returns verification result with score and status.

### Bulk Upload
- **POST** `/bulk-upload`
- Form-data: `file` (CSV with header `email`)
- Returns `{ job_id, message, total_emails }`

### Job Status
- **GET** `/jobs/{job_id}`
- Returns job progress: `{ job_id, status, total, processed, verified, invalid, risky }`

### Export Job Results
- **GET** `/jobs/{job_id}/export`
- Returns CSV file with verification results.

### Email List
- **GET** `/emails`
- Query params: `page`, `size`, `status`, `search`, `domain`
- Returns paginated list of verified emails.

### Domain Analytics
- **GET** `/domains`
- Query params: `page`, `size`, `search`
- Returns per-domain stats (count, verified percentage, bounce rate).

### Dashboard Stats
- **GET** `/dashboard/stats`
- Returns summary counts: total emails, verified, invalid, risky, etc.

### Health Check
- **GET** `/health`
- Returns `{ status: "ok" }` if service and DB are reachable.

## Error Responses
All errors return JSON:
```json
{
  "detail": "Error description"
}
```
HTTP status codes:
- 400: Bad request (validation error)
- 404: Not found
- 500: Internal server error
```