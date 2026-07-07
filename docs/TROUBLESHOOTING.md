# Troubleshooting Guide

## Common Issues and Solutions

### 1. Database Connection Errors
**Symptoms**: `sqlalchemy.exc.OperationalError: (pymysql.err.OperationalError) (2003, "Can't connect to MySQL server on 'localhost:3306'")`  
**Checks**:
- Is the MySQL container running? `docker ps` should show `ev_mysql` with status `Up`.
- Are the credentials in `backend/.env` correct? Default user `root`, password from `.env` (or `MYSQL_ROOT_PASSWORD` in docker‑compose).
- Is the host correct? Inside the backend container the host is `mysql` (service name). If you run backend locally, point to `localhost:3306` or the Docker host IP.
**Fix**:
```bash
# Restart MySQL container if needed
docker compose restart ev_mysql
# Verify connection
docker exec -it ev_mysql mysql -uroot -ppassword email_verifier -e "SELECT 1;"
```

### 2. Background Jobs Not Processing
**Symptoms**: Jobs stay in `pending` or `processing` forever, no progress updates.  
**Likely Causes**:
- ThreadPoolExecutor exhausted (all workers stuck on a slow SMTP/DNS lookup).
- Uncaught exception in worker thread silently killing the task.
**Diagnostics**:
- Check backend logs: `docker logs -f ev_backend` – look for tracebacks or repeated "worker busy" messages.
- Verify SMTP timeout settings: `SMTP_TIMEOUT` (default 10 seconds) may be too low for some mail servers.
**Fixes**:
- Increase worker count in `backend/utils/executor.py` (`max_workers=50` or higher).
- Adjust `SMTP_TIMEOUT` and `SMTP_RETRIES` in `.env`.
- Ensure external network access (DNS, SMTP ports 25/587) from the container.

### 3. Frontend Cannot Reach Backend (CORS / Proxy Errors)
**Symptoms**: Browser console shows `Failed to fetch` or `Access-Control-Allow-Origin` errors.  
**Checks**:
- Backend `CORS_ORIGINS` list includes the frontend origin (e.g., `http://localhost` or `http://localhost:5173`).
- If using Docker, the frontend container accesses backend via host network (`http://localhost:8000`) – ensure `CORS_ORIGINS` matches that.
- Verify backend is actually running on port 8000 (`docker ps` shows `ev_backend` port mapping).
**Fix**:
- Update `backend/.env`:
  ```
  CORS_ORIGINS=["http://localhost","http://localhost:5173","http://<your-domain>"]
  ```
- Restart backend: `docker compose restart ev_backend`.

### 4. Email Verification Always Returns Invalid / Low Score
**Symptoms**: Even known-good addresses (e.g., Gmail) are marked invalid or score < 50.  
**Likely Causes**:
- DNS resolver inside container cannot reach external servers (network policy).
- SMTP server greylisting or rate limiting causing temporary failures.
- Disposable/domain blocklist too aggressive.
**Diagnostics**:
- Enable debug logs: set `LOG_LEVEL=DEBUG` and inspect logs for DNS or SMTP failures.
- Use `nslookup` inside container: `docker exec -it ev_backend nslookup gmail.com`.
- Test SMTP manually: `telnet gmail-smtp-in.l.google.com 25` (may be blocked).
**Fixes**:
- Ensure container has outbound UDP/TCP 53 (DNS) and TCP 25/587 (SMTP) open.
- If on a restricted network, consider using a reliable DNS resolver (e.g., Google 8.8.8.8) or configure forwarding.
- Adjust disposable provider list in `backend/validators/disposable_checker.py` if false positives.
- For testing, you can disable SMTP check temporarily by setting `SMTP_TIMEOUT=0` (not recommended for prod).

### 5. Docker Build Fails due to Missing Python Wheels
**Symptoms**: `ERROR: Could not find a version that satisfies the requirement ...` during `docker compose build`.  
**Cause**: Base image may lack compatibility for certain packages on the host architecture (e.g., Apple M1).  
**Fix**:
- Ensure you are using Linux containers (Docker Desktop setting).
- Or add `--platform linux/amd64` to the build:  
  ```bash
  docker compose build --platform linux/amd64 backend
  ```
- Alternatively, use a more generic base image (`python:3.11-slim`) and install build dependencies.

### 6. Alembic Migration Fails on Startup
**Symptoms**: Backend crashes with `alembic.util.CommandError: Target database is not up to date.`  
**Cause**: Migration script manually edited or database schema drifted.  
**Fix**:
- Backup your database (if production).
- Reset migrations: drop `alembic_version` table, re-run `alembic upgrade head`.
- In development, you can simply delete the `backend/migrations/versions/` files and regenerate:
  ```bash
  rm backend/migrations/versions/*.py
  alembic revision --autogenerate -m "reset schema"
  alembic upgrade head
  ```

### 7. High Memory Usage Over Time
**Symptoms**: Container memory usage steadily increases, leading to OOM kills.  
**Likely Causes**:
- Accumulation of request-scoped objects or logging handlers not released.
- ThreadPool threads not being recycled (though they are reused).  
**Mitigations**:
- Ensure you are not storing large objects in global variables.
- Periodically restart the backend container (orchestration can handle rolling restarts).
- If using Python <3.11, consider upgrading for better garbage collection.

### 8. Test Suite Fails Due to Missing Redis (if any test still expects it)
**Symptoms**: pytest errors about missing Redis connection.  
**Fix**:
- Ensure no leftover imports of `celery` or `redis` in test files.
- Remove any Redis‑dependent fixtures; the project now uses SQLite in-memory for tests.
- Run `pytest --tb=short` to see exact failure.

## Getting Help
If the issue persists after trying the above:
1. Check the latest logs (`docker logs <container>`).
2. Search existing GitHub Issues.
3. Open a new issue with:
   - Description of the problem.
   - Steps to reproduce.
   - Relevant log excerpts.
   - Environment details (Docker version, OS, any custom config changes).

--- 
*Keep this guide updated as new failure modes are discovered.*