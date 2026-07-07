# Development Guide

## Prerequisites
- Docker Engine 24+ & Docker Compose v2
- Git
- Python 3.11+ (for local backend development)
- Node.js 18+ & npm (for frontend)
- Optional: MySQL client, Redis CLI (for inspection)

## Cloning the Repository
```bash
git clone <repository-url>
cd email-verifier/email-verifier
```

## Environment Setup

### Using Docker Compose (Recommended for full-stack)
1. Copy example env files:
   ```bash
   cp backend/.env.example backend/.env
   cp .env.example .env
   ```
2. Edit `backend/.env` if you need to customize:
   - `DATABASE_URL` (default points to MySQL service)
   - AWS credentials if using S3
   - `SECRET_KEY`, `DEBUG`, etc.
3. Build and start:
   ```bash
   docker-compose up -d --build
   ```
4. Verify:
   - Backend API: http://localhost:8000/docs
   - Frontend: http://localhost
   - MySQL: host `localhost:3306` (user `root`, password from `.env`)

### Backend Only (Fast Development Loop)
If you only need to iterate on backend code:
```bash
cd backend
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
pip install aiomysql   # async MySQL driver
# Ensure MySQL is running (via Docker or locally):
docker run -d -p 3306:3306 -e MYSQL_ROOT_PASSWORD=password -e MYSQL_DATABASE=email_verifier mysql:8.0
# Point DATABASE_URL to your MySQL instance in .env
cp .env.example .env
# Edit DATABASE_URL if needed
alembic upgrade head
uvicorn main:app --reload --port 8000
```
Hot reload will pick up Python file changes.

### Frontend Only
```bash
cd frontend
npm install
npm run dev   # Vets Vite dev server at http://localhost:5173
```
Proxy to backend can be configured in `vite.config.js` if backend runs on different port.

## Running Tests
### Backend
```bash
cd backend
pip install pytest pytest-asyncio pytest-mock
pytest tests/ -v
```
Tests use an in‑memory SQLite database by default (see `tests/conftest.py` if exists).

### Frontend (if tests exist)
```bash
cd frontend
npm test
```

## Debugging Tips
- **Backend Logs**: `docker logs -f ev_backend` or `journalctl -u docker-container-ev_backend` if using systemd.
- **Database Inspection**: 
   ```bash
   docker exec -it ev_mysql mysql -uroot -ppassword email_verifier -e "SHOW TABLES;"
   docker exec -it ev_mysql mysql -uroot -ppassword email_verifier -e "SELECT * FROM jobs LIMIT 5;"
   ```
- **Email Verification Pipeline**: 
   - Set `LOG_LEVEL=DEBUG` in `.env` to see detailed validator steps.
   - Use tools like MailHog (`docker run -d -p 1025:1025 -p 8025:8025 mailhog/mailhog`) and point SMTP settings to localhost:1025 to capture outgoing SMTP commands without sending real emails.
- **Background Jobs**: Since Celery is removed, background tasks run via `BackgroundTasks` + `ThreadPoolExecutor`. Check `backend/utils/executor.py` for worker count (`max_workers=20`). Adjust if needed.

## Code Style
- **Python**: Follow PEP 8. Use `black` and `flake8` if configured.
- **JavaScript/JSX**: Follow ESLint/Prettier configs in frontend.
- **Commit Messages**: Use conventional style (`feat:`, `fix:`, `docs:` etc.) if adopting.

## Making Changes
1. Create a feature branch: `git checkout -b feature/amazing-feature`
2. Make changes, ensuring tests pass.
3. Commit with clear messages.
4. Push and open a Pull Request.

## Adding New Dependencies
- **Backend**: Add to `backend/requirements.txt`, then `pip install -r requirements.txt` (or rebuild container: `docker compose build backend`).
- **Frontend**: `npm install <package> --save` (or `--save-dev`).

## Database Migrations
- Modify models in `backend/models/`.
- Generate migration: `alembic revision --autogenerate -m "description"`
- Edit generated script if needed.
- Apply: `alembic upgrade head`
- In Docker compose, migrations run automatically on backend startup via lifespan event.

## Troubleshooting
| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| Cannot connect to MySQL | Wrong `DATABASE_URL` or MySQL not running | Verify credentials, ensure container `ev_mysql` is healthy (`docker ps`) |
| Background jobs stall | ThreadPool exhausted or unhandled exception | Check logs, increase `max_workers` in `executor.py`, ensure SMTP/DNS timeouts are reasonable |
| Frontend shows API errors | CORS or proxy misconfiguration | Verify `CORS_ORIGINS` in backend `.env` includes frontend origin; check `vite.config.js` proxy |
| Build fails on ARM | Some wheels not available | Use `--platform linux/amd64` in Docker Compose or ensure compatible base images |

## Resources
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [SQLAlchemy 2.0 Tutorial](https://docs.sqlalchemy.org/en/20/)
- [React + Vite Guide](https://vitejs.dev/guide/)
- [Docker Compose Guide](https://docs.docker.com/compose/)