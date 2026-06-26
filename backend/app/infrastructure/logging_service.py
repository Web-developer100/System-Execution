"""
Structured Logging Service — Enterprise Searchable Log Management.

Collects structured logs with:
  - Timestamp (ISO 8601)
  - Worker ID
  - Job ID
  - Plugin
  - Task
  - Severity (DEBUG, INFO, WARNING, ERROR, CRITICAL)
  - Execution Time
  - Exit Code
  - Correlation ID
  - Exception Stack Trace
  - Structured JSON fields

Logs are searchable and can be streamed to:
  - Elasticsearch
  - Loki (Grafana)
  - CloudWatch
  - Local file with rotation
  - Console (stdout/stderr)
"""
from __future__ import annotations

import asyncio
import gzip
import json
import logging
import os
import re
import time
import traceback
import uuid
from dataclasses import dataclass, field, asdict
from datetime import datetime, timedelta, timezone
from enum import Enum
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, TextIO

logger = logging.getLogger(__name__)


class LogSeverity(str, Enum):
    DEBUG = "debug"
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


class LogOutput(str, Enum):
    CONSOLE = "console"
    FILE = "file"
    ELASTICSEARCH = "elasticsearch"
    LOKI = "loki"
    CLOUDWATCH = "cloudwatch"
    S3 = "s3"


@dataclass
class StructuredLogEntry:
    """A single structured log entry."""
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    severity: LogSeverity = LogSeverity.INFO
    message: str = ""
    worker_id: str = ""
    job_id: str = ""
    plugin_id: str = ""
    task_name: str = ""
    correlation_id: str = ""
    execution_time_ms: float = 0.0
    exit_code: int = 0
    exception: str = ""
    stack_trace: str = ""
    source: str = ""
    tags: Dict[str, str] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)
    raw: str = ""


@dataclass
class LogQuery:
    """Query parameters for searching logs."""
    severity: Optional[LogSeverity] = None
    worker_id: Optional[str] = None
    job_id: Optional[str] = None
    plugin_id: Optional[str] = None
    correlation_id: Optional[str] = None
    search_text: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    limit: int = 100
    offset: int = 0
    sort_order: str = "desc"


class LoggingService:
    """Structured logging service with searchable log storage."""

    def __init__(self):
        self._entries: List[StructuredLogEntry] = []
        self._outputs: List[LogOutput] = [LogOutput.CONSOLE]
        self._log_dir = Path("/var/log/v8-platform")
        self._current_file: Optional[TextIO] = None
        self._file_size = 0
        self._max_file_size = 100 * 1024 * 1024  # 100MB rotation
        self._max_entries_memory = 50000
        self._redact_patterns: List[Tuple[str, str]] = [
            (r'(V8_API_TOKEN=)\S+', r'\1***'),
            (r'(V8_SECRET=)\S+', r'\1***'),
            (r'(V8_ENCRYPTION_KEY=)\S+', r'\1***'),
            (r'(api[_-]key["\s:=]+)[\w\-]+', r'\1***'),
            (r'(token["\s:=]+)[\w\-\.]+', r'\1***'),
            (r'(secret["\s:=]+)[\w\-]+', r'\1***'),
            (r'(password["\s:=]+)\S+', r'\1***'),
            (r'(Authorization: Bearer )\S+', r'\1***'),
        ]
        self._flush_interval = 5  # seconds
        self._flush_task: Optional[asyncio.Task] = None
        self._handlers: Dict[str, List[Callable]] = {}
        self._initialized = False

    def on(self, event: str, handler: Callable) -> Callable:
        if event not in self._handlers:
            self._handlers[event] = []
        self._handlers[event].append(handler)
        def unsubscribe():
            if handler in self._handlers.get(event, []):
                self._handlers[event].remove(handler)
        return unsubscribe

    def _emit(self, event: str, entry: StructuredLogEntry) -> None:
        for handler in list(self._handlers.get(event, [])):
            try: handler(entry)
            except Exception as e: logger.error(f"[LOG-SVC] Handler error: {e}")

    async def initialize(self) -> None:
        """Initialize the logging service."""
        if self._initialized:
            return
        self._log_dir.mkdir(parents=True, exist_ok=True)
        self._rotate_file()
        self._flush_task = asyncio.create_task(self._periodic_flush())
        self._initialized = True
        logger.info(f"[LOG-SVC] Logging service initialized: dir={self._log_dir}")

    def _rotate_file(self) -> None:
        """Rotate log files when they exceed max size."""
        if self._current_file:
            self._current_file.close()

        # Find or create the current log file
        today = datetime.now(timezone.utc).strftime("%Y%m%d")
        log_path = self._log_dir / f"v8-platform-{today}.jsonl"
        self._current_file = open(log_path, "a", encoding="utf-8")
        self._file_size = log_path.stat().st_size if log_path.exists() else 0

        # Check if we need to gzip old files
        if self._file_size > self._max_file_size:
            self._current_file.close()
            # Compress old file
            gz_path = log_path.with_suffix(log_path.suffix + ".gz")
            with open(log_path, "rb") as f_in:
                with gzip.open(gz_path, "wb") as f_out:
                    f_out.write(f_in.read())
            log_path.unlink()
            # Start new file
            self._current_file = open(log_path, "w", encoding="utf-8")
            self._file_size = 0

    def log(
        self,
        message: str,
        severity: LogSeverity = LogSeverity.INFO,
        worker_id: str = "",
        job_id: str = "",
        plugin_id: str = "",
        task_name: str = "",
        correlation_id: str = "",
        execution_time_ms: float = 0.0,
        exit_code: int = 0,
        exception: Optional[Exception] = None,
        tags: Optional[Dict[str, str]] = None,
        metadata: Optional[Dict[str, Any]] = None,
        source: str = "",
    ) -> StructuredLogEntry:
        """Create a structured log entry."""
        entry = StructuredLogEntry(
            severity=severity,
            message=message,
            worker_id=worker_id,
            job_id=job_id,
            plugin_id=plugin_id,
            task_name=task_name,
            correlation_id=correlation_id or str(uuid.uuid4()),
            execution_time_ms=execution_time_ms,
            exit_code=exit_code,
            tags=tags or {},
            metadata=metadata or {},
            source=source or "v8-platform",
        )

        if exception:
            entry.exception = f"{type(exception).__name__}: {exception}"
            entry.stack_trace = "".join(traceback.format_exception(
                type(exception), exception, exception.__traceback__
            ))

        self._entries.append(entry)
        self._emit("log:entry", entry)

        # Console output
        if LogOutput.CONSOLE in self._outputs:
            self._output_console(entry)

        # Trim memory if needed
        if len(self._entries) > self._max_entries_memory:
            self._entries = self._entries[-self._max_entries_memory:]

        return entry

    def _redact(self, text: str) -> str:
        """Redact sensitive information from log messages."""
        for pattern, replacement in self._redact_patterns:
            text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)
        return text

    def _output_console(self, entry: StructuredLogEntry) -> None:
        """Output a log entry to console with redaction."""
        sev = entry.severity.value.upper()
        ts = entry.timestamp[11:23]  # HH:MM:SS.ffffff
        parts = [f"[{sev}]", f"[{ts}]"]
        if entry.worker_id:
            parts.append(f"[w:{entry.worker_id[:8]}]")
        if entry.job_id:
            parts.append(f"[j:{entry.job_id[:8]}]")
        if entry.correlation_id:
            parts.append(f"[c:{entry.correlation_id[:8]}]")
        message = self._redact(entry.message)
        parts.append(message)
        line = " ".join(parts)

        if entry.severity in (LogSeverity.ERROR, LogSeverity.CRITICAL):
            import sys
            print(line, file=sys.stderr)
        else:
            print(line)

    # ── File Output ─────────────────────────────────────────────────────────

    def _write_to_file(self, entry: StructuredLogEntry) -> None:
        """Write a log entry to the JSONL file."""
        if not self._current_file:
            return
        try:
            data = asdict(entry)
            # Remove raw field from serialization
            data.pop("raw", None)
            line = json.dumps(data, default=str) + "\n"
            self._current_file.write(line)
            self._file_size += len(line.encode())
            if self._file_size > self._max_file_size:
                self._rotate_file()
        except Exception as e:
            logger.error(f"[LOG-SVC] File write error: {e}")

    async def _periodic_flush(self) -> None:
        """Periodically flush log entries to file output."""
        while True:
            await asyncio.sleep(self._flush_interval)
            if self._current_file and LogOutput.FILE in self._outputs:
                pending = self._entries[-(len(self._entries) % 100):] if len(self._entries) > 100 else self._entries
                if pending:
                    try:
                        for entry in pending[-50:]:
                            self._write_to_file(entry)
                        self._current_file.flush()
                    except Exception as e:
                        logger.error(f"[LOG-SVC] Flush error: {e}")

    # ── Search / Query ──────────────────────────────────────────────────────

    def search(self, query: LogQuery) -> List[Dict[str, Any]]:
        """Search log entries with filters."""
        results = self._entries

        # Apply filters
        if query.severity:
            sev_values = [s.value for s in LogSeverity]
            sev_idx = sev_values.index(query.severity.value)
            results = [e for e in results if sev_values.index(e.severity.value) >= sev_idx]

        if query.worker_id:
            results = [e for e in results if query.worker_id in e.worker_id]
        if query.job_id:
            results = [e for e in results if query.job_id in e.job_id]
        if query.plugin_id:
            results = [e for e in results if query.plugin_id in e.plugin_id]
        if query.correlation_id:
            results = [e for e in results if query.correlation_id in e.correlation_id]

        if query.search_text:
            text = query.search_text.lower()
            results = [e for e in results if text in e.message.lower()
                       or text in e.exception.lower() or text in e.task_name.lower()]

        if query.start_time:
            results = [e for e in results if e.timestamp >= query.start_time]
        if query.end_time:
            results = [e for e in results if e.timestamp <= query.end_time]

        # Sort
        reverse = query.sort_order == "desc"
        results.sort(key=lambda e: e.timestamp, reverse=reverse)

        # Paginate
        total = len(results)
        results = results[query.offset:query.offset + query.limit]

        return [asdict(e) for e in results]

    def get_by_correlation(self, correlation_id: str) -> List[Dict[str, Any]]:
        """Get all log entries sharing a correlation ID."""
        return self.search(LogQuery(correlation_id=correlation_id, limit=1000))

    def get_by_job(self, job_id: str) -> List[Dict[str, Any]]:
        """Get all log entries for a job."""
        return self.search(LogQuery(job_id=job_id, limit=1000))

    def get_errors(self, since_minutes: int = 60) -> List[Dict[str, Any]]:
        """Get recent error log entries."""
        since = (datetime.now(timezone.utc) - timedelta(minutes=since_minutes)).isoformat()
        return self.search(LogQuery(
            severity=LogSeverity.ERROR,
            start_time=since,
            limit=500,
        ))

    # ── Shutdown ────────────────────────────────────────────────────────────

    async def shutdown(self) -> None:
        """Flush and close the logging service."""
        if self._flush_task:
            self._flush_task.cancel()
            self._flush_task = None
        if self._current_file:
            # Flush remaining entries
            for entry in self._entries[-100:]:
                self._write_to_file(entry)
            self._current_file.flush()
            self._current_file.close()
            self._current_file = None
        logger.info("[LOG-SVC] Logging service shut down")

    def get_stats(self) -> Dict[str, Any]:
        """Get logging service statistics."""
        sev_counts = {}
        for sev in LogSeverity:
            sev_counts[sev.value] = sum(1 for e in self._entries if e.severity == sev)

        return {
            "total_entries": len(self._entries),
            "by_severity": sev_counts,
            "outputs": [o.value for o in self._outputs],
            "file_size_mb": round(self._file_size / (1024 * 1024), 2),
            "log_directory": str(self._log_dir),
        }


logging_service = LoggingService()
