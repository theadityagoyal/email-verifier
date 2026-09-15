#!/bin/sh
set -e

python - <<'PY'
import os, pymysql
from urllib.parse import urlparse

url = os.environ['DATABASE_URL']
parsed = urlparse(url)
db = parsed.path.lstrip('/')

conn = pymysql.connect(
    host=parsed.hostname,
    port=parsed.port or 3306,
    user=parsed.username,
    password=parsed.password,
)
with conn.cursor() as cursor:
    cursor.execute(f"CREATE DATABASE IF NOT EXISTS `{db}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
conn.commit()
conn.close()
print(f"Database {db} is ready.")
PY

alembic upgrade head
exec uvicorn main:app --host 0.0.0.0 --port 8000