"""
Celery Application Configuration
Background task processing with Redis/RabbitMQ broker.
"""
from __future__ import annotations

from celery import Celery

from app.core.config import settings

celery_app = Celery(
    "v8-platform",
    broker=settings.CELERY_BROKER_URL or settings.redis_url,
    backend=settings.CELERY_RESULT_BACKEND or settings.redis_url,
    include=[
        "tasks.scan_tasks",
        "tasks.analysis_tasks",
        "tasks.notification_tasks",
        "tasks.report_tasks",
    ],
)

celery_app.conf.update(
    task_serializer=settings.CELERY_TASK_SERIALIZER,
    result_serializer=settings.CELERY_RESULT_SERIALIZER,
    accept_content=settings.CELERY_ACCEPT_CONTENT,
    task_track_started=settings.CELERY_TASK_TRACK_STARTED,
    task_time_limit=settings.CELERY_TASK_TIME_LIMIT,
    task_soft_time_limit=settings.CELERY_TASK_SOFT_TIME_LIMIT,
    worker_concurrency=settings.CELERY_WORKER_CONCURRENCY,
    worker_prefetch_multiplier=settings.CELERY_WORKER_PREFETCH_MULTIPLIER,
    task_acks_late=settings.CELERY_TASK_ACKS_LATE,
    task_reject_on_worker_lost=settings.CELERY_TASK_REJECT_ON_WORKER_LOST,
    task_default_retry_delay=settings.CELERY_TASK_RETRY_DELAY,
    task_max_retries=settings.CELERY_TASK_RETRY_MAX_RETRIES,
    result_expires=3600,
    task_queues={
        "default": {"exchange": "default", "routing_key": "default"},
        "scans": {"exchange": "scans", "routing_key": "scan.#"},
        "ai": {"exchange": "ai", "routing_key": "ai.#"},
        "reports": {"exchange": "reports", "routing_key": "report.#"},
        "notifications": {"exchange": "notifications", "routing_key": "notification.#"},
        "high_priority": {"exchange": "high_priority", "routing_key": "urgent.#"},
    },
    task_routes={
        "tasks.scan_tasks.*": {"queue": "scans"},
        "tasks.analysis_tasks.*": {"queue": "ai"},
        "tasks.notification_tasks.*": {"queue": "notifications"},
        "tasks.report_tasks.*": {"queue": "reports"},
    },
)


@celery_app.task(bind=True, max_retries=3, soft_time_limit=60)
def debug_task(self):
    """Debug task to verify Celery is working."""
    print(f"Request: {self.request!r}")
    return {"status": "ok", "task_id": self.request.id}
