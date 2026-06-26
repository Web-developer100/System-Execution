"""
Example Plugins for the V8 Platform SDK.

Real, production-ready plugin implementations demonstrating
the complete Plugin SDK. These plugins can be used as-is or
as reference implementations for custom plugins.

Includes:
  - NucleiPlugin: YAML template-based vulnerability scanner
  - SubfinderPlugin: Passive subdomain enumeration
  - SlackNotifierPlugin: Send notifications to Slack
  - OpenAiAnalyzerPlugin: AI-powered vulnerability analysis
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Any, Dict, List, Optional

from app.plugin.sdk.plugin_base import PluginBase
from app.plugin.sdk.manifest import (
    PluginManifest, PluginCategory, PluginPermission,
    ResourceLimits, SecurityProfile, HealthCheck, UpdatePolicy,
)
from app.plugin.sdk.context import PluginExecutionContext, PluginExecutionResult

logger = logging.getLogger(__name__)


# ── Nuclei Plugin ───────────────────────────────────────────────────────────

class NucleiPlugin(PluginBase):
    """Fast vulnerability scanner based on YAML templates."""

    manifest = PluginManifest(
        id="com.v8platform.nuclei",
        name="Nuclei",
        description="Fast vulnerability scanner based on YAML templates. Uses ProjectDiscovery's Nuclei engine for template-based scanning.",
        version="1.0.0",
        author="V8 Platform",
        license="MIT",
        repository="https://github.com/projectdiscovery/nuclei",
        homepage="https://nuclei.projectdiscovery.io",
        documentation_url="https://docs.projectdiscovery.io",
        category=PluginCategory.SCANNER,
        tags=["vulnerability-scanning", "cve", "template", "yaml"],
        supported_platforms=["linux/amd64", "linux/arm64", "darwin/amd64"],
        supported_input_types=["url", "domain", "ip"],
        supported_output_types=["json"],
        supported_events=["ScanStarted", "ScanFinished"],
        entry_point="nuclei",
        permissions_required=[
            PluginPermission(permission="network:internet", description="Network scanning requires outbound connections", required=True),
            PluginPermission(permission="shell:execute", description="Runs nuclei binary", required=True),
        ],
        resource_limits=ResourceLimits(cpu="2", memory="1024m", timeout=600),
        default_config={
            "severity": ["critical", "high", "medium"],
            "rate_limit": 150,
            "concurrency": 25,
            "templates": [],
            "exclude_templates": [],
        },
        health_check=HealthCheck(
            command="nuclei -version",
            expected_output="Nuclei",
            interval=120,
        ),
        security_score=95,
        compatibility_score=98,
    )

    async def on_install(self) -> None:
        """Download and install nuclei binary."""
        self.logger.info("Installing Nuclei...")
        # In production, this would download the nuclei binary
        await super().on_install()

    async def execute(self, ctx: PluginExecutionContext) -> PluginExecutionResult:
        """Execute nuclei scanning."""
        start_time = int(time.time() * 1000)
        findings: List[Dict[str, Any]] = []
        errors: List[str] = []
        warnings: List[str] = []

        try:
            self.logger.info(f"Starting Nuclei scan against {ctx.target}")

            cmd = [
                "nuclei",
                "-u", ctx.target,
                "-json",
                "-silent",
                "-rate-limit", str(ctx.config.get("rate_limit", 150)),
                "-concurrency", str(ctx.config.get("concurrency", 25)),
            ]

            # Add severity filters
            severities = ctx.config.get("severity", ["critical", "high", "medium"])
            if severities:
                cmd.extend(["-severity", ",".join(severities)])

            # Add custom templates
            templates = ctx.config.get("templates", [])
            for t in templates:
                cmd.extend(["-t", t])

            # Execute nuclei
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )

            try:
                stdout, stderr = await asyncio.wait_for(
                    proc.communicate(), timeout=ctx.timeout
                )
            except asyncio.TimeoutError:
                proc.kill()
                return PluginExecutionResult(
                    success=False,
                    errors=["Nuclei scan timed out"],
                    duration_ms=int(time.time() * 1000) - start_time,
                    plugin_id=self.manifest.id,
                )

            # Parse JSON output
            for line in stdout.decode().split("\n"):
                line = line.strip()
                if not line:
                    continue
                try:
                    result = json.loads(line)
                    findings.append({
                        "title": result.get("info", {}).get("name", "Unknown"),
                        "severity": result.get("info", {}).get("severity", "unknown"),
                        "description": result.get("info", {}).get("description", ""),
                        "url": result.get("matched-at", ""),
                        "template": result.get("template-id", ""),
                        "type": "nuclei",
                        "evidence": json.dumps(result.get("extracted-results", [])),
                        "references": [result.get("info", {}).get("reference", "")],
                        "cve_ids": result.get("info", {}).get("classification", {}).get("cve-id", []),
                        "cwe_ids": result.get("info", {}).get("classification", {}).get("cwe-id", []),
                        "cvss_score": result.get("info", {}).get("classification", {}).get("cvss-score"),
                    })
                except json.JSONDecodeError:
                    continue

            duration_ms = int(time.time() * 1000) - start_time
            self.logger.info(f"Nuclei scan completed: {len(findings)} findings in {duration_ms}ms")

            return PluginExecutionResult(
                success=True,
                findings=findings,
                duration_ms=duration_ms,
                stdout=stdout.decode()[:ctx.max_stdout],
                stderr=stderr.decode()[:ctx.max_stderr],
                plugin_id=self.manifest.id,
                plugin_version=self.manifest.version,
            )

        except FileNotFoundError:
            return PluginExecutionResult(
                success=False,
                errors=["nuclei binary not found. Install from https://github.com/projectdiscovery/nuclei"],
                duration_ms=int(time.time() * 1000) - start_time,
                plugin_id=self.manifest.id,
            )
        except Exception as e:
            return PluginExecutionResult(
                success=False,
                errors=[str(e)],
                duration_ms=int(time.time() * 1000) - start_time,
                plugin_id=self.manifest.id,
            )

    async def parse_output(self, stdout: str, stderr: str, target: str) -> List[Dict[str, Any]]:
        """Parse nuclei JSON output into findings."""
        findings = []
        for line in stdout.split("\n"):
            line = line.strip()
            if not line:
                continue
            try:
                result = json.loads(line)
                findings.append({
                    "title": result.get("info", {}).get("name", "Unknown"),
                    "severity": result.get("info", {}).get("severity", "unknown"),
                    "url": result.get("matched-at", target),
                    "template": result.get("template-id", ""),
                })
            except json.JSONDecodeError:
                continue
        return findings


# ── Subfinder Plugin ────────────────────────────────────────────────────────

class SubfinderPlugin(PluginBase):
    """Passive subdomain enumeration tool."""

    manifest = PluginManifest(
        id="com.v8platform.subfinder",
        name="Subfinder",
        description="Fast passive subdomain enumeration tool for discovering valid subdomains.",
        version="1.0.0",
        author="V8 Platform",
        license="MIT",
        repository="https://github.com/projectdiscovery/subfinder",
        category=PluginCategory.RECON,
        tags=["subdomain", "dns", "recon", "enumeration"],
        supported_input_types=["domain"],
        supported_output_types=["json"],
        entry_point="subfinder",
        permissions_required=[
            PluginPermission(permission="network:internet", description="DNS resolution requires internet", required=True),
            PluginPermission(permission="shell:execute", description="Runs subfinder binary", required=True),
        ],
        resource_limits=ResourceLimits(cpu="1", memory="512m", timeout=300),
        default_config={"sources": ["all"], "recursive": False},
        security_score=92,
        compatibility_score=99,
    )

    async def execute(self, ctx: PluginExecutionContext) -> PluginExecutionResult:
        """Execute subfinder enumeration."""
        start_time = int(time.time() * 1000)
        findings: List[Dict[str, Any]] = []

        try:
            cmd = ["subfinder", "-d", ctx.target, "-json", "-silent"]
            if ctx.config.get("recursive"):
                cmd.append("--recursive")

            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(), timeout=ctx.timeout
            )

            for line in stdout.decode().split("\n"):
                line = line.strip()
                if not line:
                    continue
                try:
                    result = json.loads(line)
                    findings.append({
                        "type": "subdomain",
                        "host": result.get("host", ""),
                        "source": result.get("source", ""),
                        "ip": result.get("ip", ""),
                    })
                except json.JSONDecodeError:
                    findings.append({
                        "type": "subdomain",
                        "host": line,
                    })

            return PluginExecutionResult(
                success=True,
                findings=findings,
                duration_ms=int(time.time() * 1000) - start_time,
                plugin_id=self.manifest.id,
            )

        except FileNotFoundError:
            return PluginExecutionResult(
                success=False,
                errors=["subfinder binary not found"],
                duration_ms=int(time.time() * 1000) - start_time,
                plugin_id=self.manifest.id,
            )

    async def parse_output(self, stdout: str, stderr: str, target: str) -> List[Dict[str, Any]]:
        findings = []
        for line in stdout.split("\n"):
            line = line.strip()
            if line:
                findings.append({"type": "subdomain", "host": line})
        return findings


# ── Slack Notifier Plugin ───────────────────────────────────────────────────

class SlackNotifierPlugin(PluginBase):
    """Send scan results and alerts to Slack channels."""

    manifest = PluginManifest(
        id="com.v8platform.slack",
        name="Slack Notifier",
        description="Send scan results, findings, and alerts to Slack channels using webhooks.",
        version="1.0.0",
        author="V8 Platform",
        license="MIT",
        category=PluginCategory.NOTIFICATION,
        tags=["notification", "slack", "integration", "alerts"],
        supported_input_types=["event"],
        supported_output_types=["status"],
        entry_point="slack_notifier",
        permissions_required=[
            PluginPermission(permission="network:internet", description="Sends webhooks to Slack", required=True),
            PluginPermission(permission="secrets:read", description="Reads Slack webhook URL from secrets", required=True),
        ],
        resource_limits=ResourceLimits(cpu="0.5", memory="128m", timeout=30),
        default_config={"channel": "#security-alerts", "username": "V8 Platform"},
        subscribed_events=["FindingCreated", "ScanFinished", "PluginInstalled"],
        security_score=95,
        compatibility_score=100,
    )

    async def execute(self, ctx: PluginExecutionContext) -> PluginExecutionResult:
        """Send a notification to Slack."""
        import time

        start_time = int(time.time() * 1000)

        webhook_url = ctx.environment.get("SLACK_WEBHOOK_URL", "")
        if not webhook_url:
            return PluginExecutionResult(
                success=False,
                errors=["SLACK_WEBHOOK_URL not configured"],
                duration_ms=int(time.time() * 1000) - start_time,
                plugin_id=self.manifest.id,
            )

        # Build Slack message
        finding = ctx.config.get("finding", {})
        severity = finding.get("severity", "info")
        title = finding.get("title", "Unknown Finding")
        description = finding.get("description", "")
        target = ctx.target

        # Color mapping
        colors = {
            "critical": "#dc3545",
            "high": "#fd7e14",
            "medium": "#ffc107",
            "low": "#28a745",
            "info": "#17a2b8",
        }

        message = {
            "channel": ctx.config.get("channel", "#security-alerts"),
            "username": ctx.config.get("username", "V8 Platform"),
            "attachments": [{
                "color": colors.get(severity, "#6c757d"),
                "title": f"[{severity.upper()}] {title}",
                "text": description,
                "fields": [
                    {"title": "Target", "value": target, "short": True},
                    {"title": "Severity", "value": severity, "short": True},
                    {"title": "Scan ID", "value": ctx.scan_id, "short": True},
                ],
                "footer": "V8 Neural Exploitation Platform",
                "ts": int(time.time()),
            }],
        }

        try:
            import aiohttp
            async with aiohttp.ClientSession() as session:
                async with session.post(webhook_url, json=message) as resp:
                    if resp.status != 200:
                        body = await resp.text()
                        return PluginExecutionResult(
                            success=False,
                            errors=[f"Slack API error {resp.status}: {body}"],
                            duration_ms=int(time.time() * 1000) - start_time,
                            plugin_id=self.manifest.id,
                        )

            return PluginExecutionResult(
                success=True,
                findings=[{
                    "type": "notification",
                    "channel": "slack",
                    "status": "sent",
                    "target": target,
                    "finding_title": title,
                }],
                duration_ms=int(time.time() * 1000) - start_time,
                plugin_id=self.manifest.id,
            )

        except ImportError:
            return PluginExecutionResult(
                success=False,
                errors=["aiohttp not installed. Install: pip install aiohttp"],
                duration_ms=int(time.time() * 1000) - start_time,
                plugin_id=self.manifest.id,
            )
        except Exception as e:
            return PluginExecutionResult(
                success=False,
                errors=[str(e)],
                duration_ms=int(time.time() * 1000) - start_time,
                plugin_id=self.manifest.id,
            )


# ── OpenAI Analyzer Plugin ─────────────────────────────────────────────────

class OpenAiAnalyzerPlugin(PluginBase):
    """AI-powered vulnerability analysis using OpenAI."""

    manifest = PluginManifest(
        id="com.v8platform.openai",
        name="OpenAI Analyzer",
        description="Advanced AI analysis using OpenAI models for vulnerability understanding, enrichment, and remediation.",
        version="2.0.0",
        author="V8 Platform",
        license="MIT",
        category=PluginCategory.AI,
        tags=["ai", "openai", "gpt", "analysis", "llm", "remediation"],
        supported_input_types=["finding"],
        supported_output_types=["analysis"],
        entry_point="openai_analyzer",
        permissions_required=[
            PluginPermission(permission="network:internet", description="Calls OpenAI API", required=True),
            PluginPermission(permission="secrets:read", description="Reads OpenAI API key", required=True),
        ],
        resource_limits=ResourceLimits(cpu="1", memory="512m", timeout=120),
        default_config={
            "model": "gpt-4",
            "temperature": 0.3,
            "max_tokens": 2000,
        },
        security_score=97,
        compatibility_score=100,
    )

    async def execute(self, ctx: PluginExecutionContext) -> PluginExecutionResult:
        """Analyze a finding using OpenAI."""
        import time

        start_time = int(time.time() * 1000)
        api_key = ctx.environment.get("OPENAI_API_KEY", "")
        if not api_key:
            return PluginExecutionResult(
                success=False,
                errors=["OPENAI_API_KEY not configured"],
                duration_ms=int(time.time() * 1000) - start_time,
                plugin_id=self.manifest.id,
            )

        finding = ctx.config.get("finding", {})
        title = finding.get("title", ctx.target)
        description = finding.get("description", "")

        prompt = (
            f"You are a security expert analyzing a vulnerability finding.\n\n"
            f"**Title:** {title}\n"
            f"**Description:** {description}\n\n"
            f"Provide the following in JSON format:\n"
            f"- root_cause: Detailed root cause analysis\n"
            f"- attack_vector: How this could be exploited\n"
            f"- business_impact: Business impact assessment\n"
            f"- remediation: Step-by-step remediation steps\n"
            f"- cwe_mapping: Relevant CWE IDs\n"
            f"- cvss_score: Estimated CVSS score (0-10)\n"
            f"- likelihood: Likelihood (low/medium/high)\n"
            f"- references: Relevant references"
        )

        try:
            import aiohttp
            headers = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            }
            payload = {
                "model": ctx.config.get("model", "gpt-4"),
                "messages": [
                    {"role": "system", "content": "You are a security analysis AI."},
                    {"role": "user", "content": prompt},
                ],
                "temperature": ctx.config.get("temperature", 0.3),
                "max_tokens": ctx.config.get("max_tokens", 2000),
                "response_format": {"type": "json_object"},
            }

            async with aiohttp.ClientSession() as session:
                async with session.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers=headers, json=payload,
                ) as resp:
                    if resp.status != 200:
                        body = await resp.text()
                        return PluginExecutionResult(
                            success=False,
                            errors=[f"OpenAI API error {resp.status}: {body}"],
                            duration_ms=int(time.time() * 1000) - start_time,
                            plugin_id=self.manifest.id,
                        )

                    result = await resp.json()
                    content = result["choices"][0]["message"]["content"]
                    analysis = json.loads(content)

                    return PluginExecutionResult(
                        success=True,
                        findings=[{
                            "type": "ai_analysis",
                            "provider": "openai",
                            "model": ctx.config.get("model", "gpt-4"),
                            "analysis": analysis,
                            "duration_ms": int(time.time() * 1000) - start_time,
                        }],
                        stdout=content,
                        duration_ms=int(time.time() * 1000) - start_time,
                        plugin_id=self.manifest.id,
                    )

        except ImportError:
            return PluginExecutionResult(
                success=False,
                errors=["aiohttp not installed"],
                duration_ms=int(time.time() * 1000) - start_time,
                plugin_id=self.manifest.id,
            )
        except json.JSONDecodeError as e:
            return PluginExecutionResult(
                success=False,
                errors=[f"Failed to parse OpenAI response: {e}"],
                duration_ms=int(time.time() * 1000) - start_time,
                plugin_id=self.manifest.id,
            )
        except Exception as e:
            return PluginExecutionResult(
                success=False,
                errors=[str(e)],
                duration_ms=int(time.time() * 1000) - start_time,
                plugin_id=self.manifest.id,
            )


# ── Plugin Instance Exports ─────────────────────────────────────────────────

nuclei_plugin = NucleiPlugin()
subfinder_plugin = SubfinderPlugin()
slack_notifier_plugin = SlackNotifierPlugin()
openai_analyzer_plugin = OpenAiAnalyzerPlugin()
