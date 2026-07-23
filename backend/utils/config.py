from pydantic_settings import BaseSettings
from typing import List
import json


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 20
    DB_POOL_TIMEOUT: int = 30
    DB_POOL_RECYCLE: int = 1800
    DEBUG_SQL: bool = False

    # AWS
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    AWS_REGION: str = "ap-south-1"
    S3_BUCKET_NAME: str = "email-verifier-uploads"

    # Application
    SECRET_KEY: str = "change-me-in-production"
    DEBUG: bool = False
    LOG_LEVEL: str = "INFO"
    CORS_ORIGINS: str = '["http://localhost:3000"]'

    # Admin dashboard (API Keys management)
    ADMIN_PASSWORD: str = "change-me-admin-password"

    # SMTP
    SMTP_TIMEOUT: int = 3
    SMTP_RETRIES: int = 2
    SMTP_MAX_WORKERS: int = 20
    SMTP_MAX_MX_TO_TRY: int = 2
    SMTP_SENDER_EMAIL: str = "verify@emailchecker.com"
    SMTP_HELO_DOMAIN: str = "emailchecker.com"

    # Disposable email checker
    DISPOSABLE_CACHE_TTL: int = 86400  # 24 hours
    DISPOSABLE_SOURCES: List[str] = [
        "https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains/master/disposable_email_blocklist.conf",
        "https://raw.githubusercontent.com/FGRibreau/mailchecker/master/list.txt",
    ]

    # ── Smart verification result reuse ─────────────────────────────────────
    # Master switch — if False, every verification always does a full
    # DNS+SMTP check regardless of any existing DB record (old behavior).
    RESULT_REUSE_ENABLED: bool = True
    # Syntax + disposable checks are pure/cheap (no I/O) and are ALWAYS
    # recomputed fresh — they have no TTL setting because caching them
    # would save nothing and could go stale for free.
    # DNS + MX results are the slowest-changing signal (domain existence,
    # mail server config rarely churns) — long TTL.
    DNS_MX_TTL_DAYS: int = 60
    # SMTP acceptance + catch-all behavior can change more often (mailbox
    # provisioning, greylisting, catch-all toggled) — shorter TTL.
    SMTP_TTL_DAYS: int = 30

    class Config:
        env_file = ".env"
        extra = "ignore"

    @property
    def cors_origins_list(self) -> List[str]:
        return json.loads(self.CORS_ORIGINS)


settings = Settings()
