"""
Prometheus Metrics Service — Comprehensive Metrics Collection Pipeline.

Collects Prometheus-compatible metrics:
  - Jobs Started / Finished / Failed
  - Queue Depth by type
  - Worker Count (online, offline, busy)
  - Plugin Runtime (histogram)
  - Average Scan Time
  - Verification Time
  - AI Latency
  - Container Startup Time
  - Network Throughput
  - Resource Consumption (CPU, RAM, Disk)
  - Heartbeat Latency
  - Error Rate by type
"""
from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Any, Callable, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)


class MetricType(str, Enum):
    COUNTER = "counter"
    GAUGE = "gauge"
    HISTOGRAM = "histogram"
    SUMMARY = "summary"


@dataclass
class MetricSample:
    """A single metric data point."""
    name: str
    value: float
    labels: Dict[str, str] = field(default_factory=dict)
    timestamp: float = field(default_factory=time.time)
    type: MetricType = MetricType.GAUGE


@dataclass
class HistogramBucket:
    """A histogram bucket configuration."""
    le: float  # Less-than-or-equal threshold
    count: int = 0


class MetricsService:
    """Prometheus-compatible metrics collection service."""

    def __init__(self):
        self._counters: Dict[str, Dict[str, float]] = {}
        self._gauges: Dict[str, Dict[str, float]] = {}
        self._histograms: Dict[str, Dict[str, List[float]]] = {}
        self._counter_handlers: Dict[str, List[Callable]] = {}
        self._bucket_definitions: Dict[str, List[float]] = {
            "duration_ms": [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000, 60000],
            "size_bytes": [1024, 10240, 102400, 1048576, 10485760, 104857600],
            "latency_ms": [1, 5, 10, 25, 50, 100, 250, 500, 1000],
        }
        self._historical: Dict[str, List[float]] = {}
        self._max_retention: int = 10000

    def _labels_key(self, labels: Dict[str, str]) -> str:
        return json.dumps(labels, sort_keys=True)

    # ── Counters ────────────────────────────────────────────────────────────

    def increment(self, name: str, value: float = 1.0, labels: Optional[Dict[str, str]] = None) -> None:
        """Increment a counter metric."""
        labels = labels or {}
        key = self._labels_key(labels)
        if name not in self._counters:
            self._counters[name] = {}
        self._counters[name][key] = self._counters[name].get(key, 0) + value

        # Track historical data
        if name not in self._historical:
            self._historical[name] = []
        self._historical[name].append(value)
        if len(self._historical[name]) > self._max_retention:
            self._historical[name] = self._historical[name][-self._max_retention:]

        # Notify handlers
        for handler in list(self._counter_handlers.get(name, [])):
            try: handler(MetricSample(name=name, value=value, labels=labels, type=MetricType.COUNTER))
            except Exception as e: logger.error(f"[METRICS] Handler error: {e}")

    def get_counter(self, name: str, labels: Optional[Dict[str, str]] = None) -> float:
        """Get the current value of a counter."""
        if name not in self._counters:
            return 0.0
        key = self._labels_key(labels or {})
        return self._counters[name].get(key, 0.0)

    # ── Gauges ──────────────────────────────────────────────────────────────

    def set_gauge(self, name: str, value: float, labels: Optional[Dict[str, str]] = None) -> None:
        """Set a gauge metric to a specific value."""
        labels = labels or {}
        key = self._labels_key(labels)
        if name not in self._gauges:
            self._gauges[name] = {}
        self._gauges[name][key] = value

    def increment_gauge(self, name: str, delta: float = 1.0, labels: Optional[Dict[str, str]] = None) -> None:
        """Increment a gauge metric."""
        current = self.get_gauge(name, labels)
        self.set_gauge(name, current + delta, labels)

    def decrement_gauge(self, name: str, delta: float = 1.0, labels: Optional[Dict[str, str]] = None) -> None:
        """Decrement a gauge metric."""
        current = self.get_gauge(name, labels)
        self.set_gauge(name, max(0, current - delta), labels)

    def get_gauge(self, name: str, labels: Optional[Dict[str, str]] = None) -> float:
        """Get the current value of a gauge."""
        if name not in self._gauges:
            return 0.0
        key = self._labels_key(labels or {})
        return self._gauges[name].get(key, 0.0)

    # ── Histograms ──────────────────────────────────────────────────────────

    def observe(self, name: str, value: float, labels: Optional[Dict[str, str]] = None) -> None:
        """Record an observation for a histogram metric."""
        labels = labels or {}
        key = self._labels_key(labels)
        if name not in self._histograms:
            self._histograms[name] = {}
        if key not in self._histograms[name]:
            self._histograms[name][key] = []
        self._histograms[name][key].append(value)
        if len(self._histograms[name][key]) > self._max_retention:
            self._histograms[name][key] = self._histograms[name][key][-self._max_retention:]

    def get_histogram(self, name: str, labels: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
        """Get histogram data with bucket counts."""
        key = self._labels_key(labels or {})
        observations = self._histograms.get(name, {}).get(key, [])
        buckets = self._bucket_definitions.get(name, [10, 50, 100, 500, 1000, 5000])

        if not observations:
            return {"count": 0, "sum": 0, "buckets": {str(b): 0 for b in buckets}}

        bucket_counts = {}
        for b in buckets:
            bucket_counts[str(b)] = sum(1 for v in observations if v <= b)

        return {
            "count": len(observations),
            "sum": sum(observations),
            "min": min(observations),
            "max": max(observations),
            "avg": sum(observations) / len(observations),
            "p50": sorted(observations)[len(observations) // 2],
            "p95": sorted(observations)[int(len(observations) * 0.95)],
            "p99": sorted(observations)[int(len(observations) * 0.99)],
            "buckets": bucket_counts,
        }

    # ── Convenience Methods for Common Metrics ──────────────────────────────

    def record_job_started(self, job_type: str = "scan") -> None:
        self.increment("jobs_started_total", labels={"type": job_type})
        self.increment_gauge("jobs_running", labels={"type": job_type})

    def record_job_completed(self, job_type: str = "scan", duration_ms: float = 0) -> None:
        self.increment("jobs_completed_total", labels={"type": job_type})
        self.decrement_gauge("jobs_running", labels={"type": job_type})
        self.observe("job_duration_ms", duration_ms, labels={"type": job_type})

    def record_job_failed(self, job_type: str = "scan", error_type: str = "unknown") -> None:
        self.increment("jobs_failed_total", labels={"type": job_type, "error": error_type})
        self.decrement_gauge("jobs_running", labels={"type": job_type})

    def record_queue_depth(self, queue_type: str, depth: int) -> None:
        self.set_gauge("queue_depth", depth, labels={"queue_type": queue_type})

    def record_worker_count(self, status: str, count: int) -> None:
        self.set_gauge("worker_count", count, labels={"status": status})

    def record_plugin_execution(self, plugin_id: str, duration_ms: float, success: bool) -> None:
        self.observe("plugin_duration_ms", duration_ms, labels={"plugin": plugin_id})
        if success:
            self.increment("plugin_executions_success", labels={"plugin": plugin_id})
        else:
            self.increment("plugin_executions_failed", labels={"plugin": plugin_id})

    def record_scan_duration(self, scan_id: str, duration_ms: float) -> None:
        self.observe("scan_duration_ms", duration_ms)

    def record_ai_latency(self, model: str, latency_ms: float) -> None:
        self.observe("ai_latency_ms", latency_ms, labels={"model": model})

    def record_container_startup(self, duration_ms: float) -> None:
        self.observe("container_startup_ms", duration_ms)

    def record_network_throughput(self, bytes_sent: int, bytes_received: int) -> None:
        self.increment("network_bytes_sent", bytes_sent)
        self.increment("network_bytes_received", bytes_received)

    def record_resource_usage(self, cpu_percent: float, memory_mb: float, disk_gb: float) -> None:
        self.set_gauge("resource_cpu_percent", cpu_percent)
        self.set_gauge("resource_memory_mb", memory_mb)
        self.set_gauge("resource_disk_gb", disk_gb)

    def record_error(self, error_type: str, source: str = "system") -> None:
        self.increment("errors_total", labels={"type": error_type, "source": source})

    # ── Prometheus Text Format Export ──────────────────────────────────────

    def to_prometheus_text(self) -> str:
        """Export all metrics in Prometheus text format."""
        lines = ["# HELP v8_platform_metrics V8 Platform metrics"]
        lines.append("# TYPE v8_platform_metrics gauge")
        lines.append("")

        # Counters
        for name, label_values in self._counters.items():
            lines.append(f"# HELP {name} Counter metric")
            lines.append(f"# TYPE {name} counter")
            for labels_key, value in label_values.items():
                labels = json.loads(labels_key)
                label_str = ",".join(f'{k}="{v}"' for k, v in sorted(labels.items()))
                if label_str:
                    lines.append(f"{name}{{{label_str}}} {value}")
                else:
                    lines.append(f"{name} {value}")
            lines.append("")

        # Gauges
        for name, label_values in self._gauges.items():
            lines.append(f"# HELP {name} Gauge metric")
            lines.append(f"# TYPE {name} gauge")
            for labels_key, value in label_values.items():
                labels = json.loads(labels_key)
                label_str = ",".join(f'{k}="{v}"' for k, v in sorted(labels.items()))
                if label_str:
                    lines.append(f"{name}{{{label_str}}} {value}")
                else:
                    lines.append(f"{name} {value}")
            lines.append("")

        # Histograms
        for name, labels_data in self._histograms.items():
            lines.append(f"# HELP {name} Histogram metric")
            lines.append(f"# TYPE {name} histogram")
            for labels_key, observations in labels_data.items():
                labels = json.loads(labels_key)
                label_str = ",".join(f'{k}="{v}"' for k, v in sorted(labels.items()))
                buckets = self._bucket_definitions.get(name, [10, 50, 100, 500, 1000, 5000])
                count = len(observations)
                total = sum(observations)

                if label_str:
                    for b in buckets:
                        bcount = sum(1 for v in observations if v <= b)
                        lines.append(f"{name}_bucket{{{label_str},le=\"{b}\"}} {bcount}")
                    lines.append(f"{name}_bucket{{{label_str},le=\"+Inf\"}} {count}")
                    lines.append(f"{name}_count{{{label_str}}} {count}")
                    lines.append(f"{name}_sum{{{label_str}}} {total}")
                else:
                    for b in buckets:
                        bcount = sum(1 for v in observations if v <= b)
                        lines.append(f"{name}_bucket{{le=\"{b}\"}} {bcount}")
                    lines.append(f"{name}_bucket{{le=\"+Inf\"}} {count}")
                    lines.append(f"{name}_count {count}")
                    lines.append(f"{name}_sum {total}")
            lines.append("")

        return "\n".join(lines)

    def get_stats(self) -> Dict[str, Any]:
        """Get metrics service statistics."""
        return {
            "counters": {name: sum(v.values()) for name, v in self._counters.items()},
            "gauges": {name: sum(v.values()) for name, v in self._gauges.items()},
            "histograms": {
                name: sum(len(v) for v in labels.values())
                for name, labels in self._histograms.items()
            },
            "total_metrics": len(self._counters) + len(self._gauges) + len(self._histograms),
        }


metrics_service = MetricsService()
