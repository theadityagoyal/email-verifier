import os
import sys

# Ensure backend root is on path when running as a worker
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from celery import Celery
from utils.config import settings

celery_app = Celery(
    "email_verifier",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["tasks.verification_tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_track_started=True,
    result_expires=86400,  # 24 hours
)
