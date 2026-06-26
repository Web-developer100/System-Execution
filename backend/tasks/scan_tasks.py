"""
Background Task Implementations for Celery Workers.

Implements:
  - Scan Tasks: execute, progress, cancel
  - AI Analysis Tasks: analyze, enrich, classify
  - Notification Tasks: email, slack, webhook
  - Report Tasks: generate, export, deliver
  - Worker Management Tasks: heartbeat, health check
  - Cleanup Tasks: artifact expiration, log rotation
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Any, Dict, List, Optional

from celery import Task
from celery.exceptions import MaxRetriesExceededError

from app.core.config import settings
from app.core.events import (
    ScanStarted, ScanCompleted, ScanFailed, ScanProgressed,
    FindingCreated, NotificationSent,
    event_bus,
)
from app.infrastructure.queue.celery_app import celery_app

logger = logging.getLogger(__name__)


class BaseTask(Task):
    """Base task with automatic retry and error handling."""
    autoretry_for = (Exception,)
    max_retries = 3
    retry_backoff = True
    retry_backoff_max = 600
    retry_jitter = True

    def on_failure(self, exc, task_id, args, kwargs, einfo):
        logger.error(f"[TASK] Failed: {task_id}: {exc}")


# ═══════════════════════════════════════════════════════════════════════════
# Scan Tasks
# ═══════════════════════════════════════════════════════════════════════════

@celery_app.task(bind=True, base=BaseTask, queue="scans")
def execute_scan(self, scan_id: str, target: str, plugins: list, config: dict = None):
    """Execute a security scan."""
    logger.info(f"[SCAN] Starting scan {scan_id} against {target}")
    config = config or {}

    try:
        # Emit scan started event
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(event_bus.publish(
            ScanStarted(scan_id=scan_id, target=target, tools=plugins)
        ))
        loop.close()

        # Update progress
        self.update_state(state="PROGRESS", meta={"progress": 10, "stage": "initializing"})

        results = {"scan_id": scan_id, "target": target, "findings": [], "duration_ms": 0}
        start_time = time.time() * 1000

        # TODO: Actual scan execution would dispatch to plugin executors here
        for i, plugin_id in enumerate(plugins):
            progress = int(10 + (80 * (i + 1) / len(plugins)))
            self.update_state(state="PROGRESS", meta={
                "progress": progress, "stage": f"running {plugin_id}"
            })
            logger.debug(f"[SCAN] Running plugin {plugin_id} on {target}")

        duration_ms = int(time.time() * 1000 - start_time)
        results["duration_ms"] = duration_ms

        # Emit completion
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(event_bus.publish(
            ScanCompleted(scan_id=scan_id, findings_count=len(results["findings"]), duration_ms=duration_ms)
        ))
        loop.close()

        logger.info(f"[SCAN] Completed scan {scan_id} in {duration_ms}ms")
        return results

    except Exception as e:
        logger.error(f"[SCAN] Failed scan {scan_id}: {e}")
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(event_bus.publish(
            ScanFailed(scan_id=scan_id, error=str(e), stage="execution")
        ))
        loop.close()
        raise self.retry(exc=e)


@celery_app.task(bind=True, base=BaseTask, queue="scans")
def cancel_scan(self, scan_id: str):
    """Cancel a running scan."""
    logger.info(f"[SCAN] Cancelling scan {scan_id}")
    # TODO: Revoke Celery tasks by scan_id
    from celery.task.control import revoke
    revoke(scan_id, terminate=True)
    return {"scan_id": scan_id, "status": "cancelled"}


@celery_app.task(bind=True, base=BaseTask, queue="scans")
def batch_scan(self, targets: list, plugin_id: str, config: dict = None):
    """Run a batch scan across multiple targets."""
    config = config or {}
    results = []
    for target in targets:
        try:
            result = execute_scan.delay(
                scan_id=f"batch-{hash(target)}",
                target=target,
                plugins=[plugin_id],
                config=config,
            )
            results.append({"target": target, "task_id": result.id})
        except Exception as e:
            results.append({"target": target, "error": str(e)})
    return {"results": results, "total": len(targets)}


# ═══════════════════════════════════════════════════════════════════════════
# AI Analysis Tasks
# ═══════════════════════════════════════════════════════════════════════════

@celery_app.task(bind=True, base=BaseTask, queue="ai")
def analyze_finding(self, finding_id: str, title: str, description: str, config: dict = None):
    """Perform AI analysis on a finding."""
    config = config or {}
    logger.info(f"[AI] Analyzing finding {finding_id}: {title}")

    try:
        from app.plugin.examples import OpenAiAnalyzerPlugin
        from app.plugin.sdk.context import PluginExecutionContext

        plugin = OpenAiAnalyzerPlugin()
        ctx = PluginExecutionContext(
            target=title,
            config={"finding": {"title": title, "description": description}},
            environment={"OPENAI_API_KEY": settings.OPENAI_API_KEY or ""},
        )

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        result = loop.run_until_complete(plugin.execute(ctx))
        loop.close()

        return {
            "finding_id": finding_id,
            "analysis": result.findings[0] if result.findings else None,
            "success": result.success,
            "duration_ms": result.duration_ms,
        }

    except Exception as e:
        logger.error(f"[AI] Analysis failed for {finding_id}: {e}")
        raise self.retry(exc=e)


@celery_app.task(bind=True, base=BaseTask, queue="ai")
def batch_analyze(self, findings: list):
    """Batch analyze multiple findings."""
    results = []
    for finding in findings:
        try:
            result = analyze_finding.delay(
                finding_id=finding["id"],
                title=finding.get("title", ""),
                description=finding.get("description", ""),
            )
            results.append({"finding_id": finding["id"], "task_id": result.id})
        except Exception as e:
            results.append({"finding_id": finding["id"], "error": str(e)})
    return {"results": results}


# ═══════════════════════════════════════════════════════════════════════════
# Notification Tasks
# ═══════════════════════════════════════════════════════════════════════════

@celery_app.task(bind=True, base=BaseTask, queue="notifications")
def send_notification(
    self, channel: str, recipient: str, subject: str, body: str, config: dict = None
):
    """Send a notification via the specified channel."""
    config = config or {}
    logger.info(f"[NOTIFICATION] Sending {channel} notification to {recipient}")

    if channel == "slack":
        from app.plugin.examples import SlackNotifierPlugin
        from app.plugin.sdk.context import PluginExecutionContext

        plugin = SlackNotifierPlugin()
        ctx = PluginExecutionContext(
            target=recipient,
            config={"channel": config.get("channel", "#security-alerts"), "finding": {"title": subject, "description": body}},
            environment={"SLACK_WEBHOOK_URL": config.get("webhook_url", "")},
        )

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        result = loop.run_until_complete(plugin.execute(ctx))
        loop.close()
        success = result.success

    elif channel == "email":
        # Send email via SMTP
        import smtplib
        from email.mime.text import MIMEText
        try:
            msg = MIMEText(body)
            msg["Subject"] = subject
            msg["From"] = settings.SMTP_FROM
            msg["To"] = recipient

            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as server:
                if settings.SMTP_USE_TLS:
                    server.starttls()
                if settings.SMTP_USER:
                    server.login(settings.SMTP_USER, settings.SMTP_PASSWORD or "")
                server.send_message(msg)
            success = True
        except Exception as e:
            logger.error(f"[NOTIFICATION] Email failed: {e}")
            raise self.retry(exc=e)
    else:
        # Webhook
        import aiohttp
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        async def send_webhook():
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    recipient,
                    json={"subject": subject, "body": body},
                    timeout=aiohttp.ClientTimeout(total=10),
                ) as resp:
                    return resp.status < 500
        try:
            success = loop.run_until_complete(send_webhook())
        except Exception:
            success = False
        loop.close()

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(event_bus.publish(
        NotificationSent(notification_id=self.request.id, channel=channel, recipient=recipient)
    ))
    loop.close()

    return {"channel": channel, "recipient": recipient, "success": success}


@celery_app.task(bind=True, base=BaseTask, queue="notifications")
def batch_notify(self, notification_list: list):
    """Send multiple notifications."""
    results = []
    for item in notification_list:
        result = send_notification.delay(
            channel=item["channel"],
            recipient=item["recipient"],
            subject=item.get("subject", "V8 Platform Alert"),
            body=item.get("body", ""),
            config=item.get("config", {}),
        )
        results.append({"recipient": item["recipient"], "task_id": result.id})
    return {"results": results}


# ═══════════════════════════════════════════════════════════════════════════
# Report Tasks
# ═══════════════════════════════════════════════════════════════════════════

@celery_app.task(bind=True, base=BaseTask, queue="reports")
def generate_report(self, report_id: str, scan_id: str, format: str = "pdf"):
    """Generate a scan report."""
    logger.info(f"[REPORT] Generating {format} report {report_id} for scan {scan_id}")
    start_time = time.time() * 1000

    try:
        self.update_state(state="PROGRESS", meta={"progress": 10})
        # TODO: Actual report generation

        duration_ms = int(time.time() * 1000 - start_time)
        return {
            "report_id": report_id,
            "scan_id": scan_id,
            "format": format,
            "status": "ready",
            "duration_ms": duration_ms,
        }
    except Exception as e:
        logger.error(f"[REPORT] Failed: {e}")
        raise self.retry(exc=e)


# ═══════════════════════════════════════════════════════════════════════════
# Worker Management Tasks
# ═══════════════════════════════════════════════════════════════════════════

@celery_app.task(bind=True, base=BaseTask, queue="default")
def worker_heartbeat(self, worker_id: str, cpu_usage: float = 0.0, memory_mb: float = 0.0):
    """Record worker heartbeat."""
    from app.workers import worker_manager, HeartbeatData
    from datetime import datetime, timezone

    hb = HeartbeatData(
        worker_id=worker_id,
        cpu_usage=cpu_usage,
        memory_usage_mb=memory_mb,
        status="online",
    )
    result = worker_manager.heartbeat(hb)
    return {"worker_id": worker_id, "status": result["status"]}


@celery_app.task(bind=True, base=BaseTask, queue="default")
def health_check(self):
    """Perform system health check."""
    from app.queue import job_queue
    from app.queue.scheduler import scheduler
    from app.workers import worker_manager

    return {
        "jobs": job_queue.get_stats(),
        "workers": worker_manager.get_stats(),
        "scheduler": scheduler.get_stats(),
    }


# ═══════════════════════════════════════════════════════════════════════════
# Cleanup Tasks
# ═══════════════════════════════════════════════════════════════════════════

@celery_app.task(bind=True, base=BaseTask, queue="default")
def cleanup_expired_artifacts(self, max_age_days: int = 30):
    """Clean up expired execution artifacts."""
    logger.info(f"[CLEANUP] Cleaning artifacts older than {max_age_days} days")
    # TODO: Scan storage for expired artifacts and delete
    return {"cleaned": 0}


@celery_app.task(bind=True, base=BaseTask, queue="default")
def cleanup_completed_jobs(self, max_age_days: int = 7):
    """Clean up completed jobs from the queue."""
    from app.queue import JobStatus, job_queue
    count = 0
    for job in job_queue.store.get_by_status(JobStatus.COMPLETED):
        job_queue.store.remove(job.id)
        count += 1
    return {"removed": count}


@celery_app.task(bind=True, base=BaseTask, queue="default")
def scheduled_cleanup(self):
    """Run all cleanup tasks."""
    cleanup_expired_artifacts.delay()
    cleanup_completed_jobs.delay()
    return {"status": "cleanup initiated"}
