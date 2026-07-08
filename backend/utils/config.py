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

    class Config:
        env_file = ".env"
        extra = "ignore"

    @property
    def cors_origins_list(self) -> List[str]:
        return json.loads(self.CORS_ORIGINS)


settings = Settings()