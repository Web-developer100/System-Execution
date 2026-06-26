"""
Dynamic GitHub Plugin Integration.

Supports cloning, fetching, checking out repos, verifying checksums,
building plugins, and checking for updates from GitHub.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import re
import shutil
import tempfile
import time
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from app.plugin.sdk.manifest import PluginManifest
from app.plugin.sdk.lifecycle import PluginLifecycleManager

logger = logging.getLogger(__name__)


class GitHubSourceType(str, Enum):
    RELEASE = "release"
    TAG = "tag"
    BRANCH = "branch"
    COMMIT = "commit"


@dataclass
class GitHubSource:
    repository: str
    type: GitHubSourceType = GitHubSourceType.RELEASE
    ref: str = "latest"
    is_private: bool = False
    token: Optional[str] = None
    enterprise_url: Optional[str] = None
    expected_checksum: Optional[str] = None
    expected_signature: Optional[str] = None


@dataclass
class GitHubInstallationResult:
    success: bool = False
    plugin_id: Optional[str] = None
    manifest: Optional[PluginManifest] = None
    install_dir: str = ""
    version: str = "unknown"
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    duration_ms: int = 0


VALID_MANIFEST_FILES = ["v8-plugin.json", "plugin.json", ".v8-plugin.json", "manifest.json"]


class GitHubPluginIntegration:
    """GitHub integration for installing, updating, and managing plugins."""

    def __init__(self, workspaces_dir: Optional[str] = None):
        self.workspaces_dir = workspaces_dir or os.path.join(
            os.getcwd(), ".plugins", "workspaces"
        )
        self.github_token: Optional[str] = os.environ.get("GITHUB_TOKEN")
        os.makedirs(self.workspaces_dir, exist_ok=True)
        logger.info(f"[GITHUB-INTEGRATION] Initialized. Workspace: {self.workspaces_dir}")

    # ── Main Install ────────────────────────────────────────────────────────

    async def install(self, source: GitHubSource) -> GitHubInstallationResult:
        """Install a plugin from a GitHub source."""
        start_time = time.monotonic() * 1000
        errors: List[str] = []
        warnings: List[str] = []
        repo_dir = os.path.join(
            self.workspaces_dir, self._sanitize_repo_name(source.repository)
        )

        try:
            logger.info(
                f"[GITHUB-INTEGRATION] Installing plugin from {source.repository} @ {source.ref}"
            )

            # Clone or fetch the repo
            if not os.path.isdir(repo_dir):
                await self._clone_repo(source, repo_dir)
            else:
                await self._fetch_repo(repo_dir)

            # Checkout the requested ref
            await self._checkout_ref(repo_dir, source.ref)

            # Find and parse manifest
            manifest_data = await self._find_and_parse_manifest(repo_dir)
            if manifest_data is None:
                errors.append(
                    f"No valid manifest found in {repo_dir}. "
                    f"Expected one of: {', '.join(VALID_MANIFEST_FILES)}"
                )
                return GitHubInstallationResult(
                    success=False, install_dir=repo_dir, errors=errors,
                    warnings=warnings, duration_ms=int(time.monotonic() * 1000 - start_time),
                )

            manifest_path, manifest = manifest_data

            # Build plugin if needed
            try:
                await self._build_plugin(repo_dir, manifest)
            except Exception as e:
                warnings.append(f"Build skipped: {e}")

            # Verify checksum if expected
            if source.expected_checksum:
                computed = await self._compute_checksum(manifest_path)
                if computed != source.expected_checksum:
                    errors.append(
                        f"Checksum mismatch: expected {source.expected_checksum}, got {computed}"
                    )
                    return GitHubInstallationResult(
                        success=False, plugin_id=manifest.get("id"),
                        manifest=PluginManifest.from_dict(manifest),
                        install_dir=repo_dir, version=manifest.get("version", "unknown"),
                        errors=errors, warnings=warnings,
                        duration_ms=int(time.monotonic() * 1000 - start_time),
                    )

            logger.info(
                f"[GITHUB-INTEGRATION] Plugin '{manifest.get('id')}' v{manifest.get('version')} "
                f"installed successfully from {source.repository}"
            )

            return GitHubInstallationResult(
                success=True,
                plugin_id=manifest.get("id"),
                manifest=PluginManifest.from_dict(manifest) if manifest else None,
                install_dir=repo_dir,
                version=manifest.get("version", "unknown"),
                errors=errors,
                warnings=warnings,
                duration_ms=int(time.monotonic() * 1000 - start_time),
            )

        except Exception as e:
            err_msg = str(e)
            errors.append(err_msg)
            logger.error(f"[GITHUB-INTEGRATION] Installation failed: {err_msg}")
            return GitHubInstallationResult(
                success=False, install_dir=repo_dir, errors=errors,
                warnings=warnings, duration_ms=int(time.monotonic() * 1000 - start_time),
            )

    async def install_from_release(
        self, repository: str, version: str
    ) -> GitHubInstallationResult:
        """Install from a GitHub release."""
        return await self.install(
            GitHubSource(
                repository=repository,
                type=GitHubSourceType.RELEASE,
                ref=version,
            )
        )

    async def install_from_github_url(self, url: str) -> GitHubInstallationResult:
        """Install from a full GitHub URL."""
        repo = self._parse_github_url(url)
        if not repo:
            return GitHubInstallationResult(
                success=False, errors=[f"Invalid GitHub URL: {url}"],
            )
        return await self.install(
            GitHubSource(
                repository=repo,
                type=GitHubSourceType.RELEASE,
                ref="latest",
            )
        )

    # ── Update Checking ─────────────────────────────────────────────────────

    async def check_for_updates(
        self, repo_dir: str
    ) -> Dict[str, Any]:
        """Check if updates are available for a cloned plugin."""
        try:
            manifest_data = await self._find_and_parse_manifest(repo_dir)
            current_version = (
                manifest_data[1].get("version") if manifest_data else None
            )

            # Fetch latest tags
            proc = await asyncio.create_subprocess_exec(
                "git", "fetch", "--tags",
                cwd=repo_dir,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            try:
                await asyncio.wait_for(proc.communicate(), timeout=30)
            except asyncio.TimeoutError:
                proc.kill()

            proc2 = await asyncio.create_subprocess_exec(
                "git", "tag", "--list", "--sort=-version:refname",
                cwd=repo_dir,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            try:
                stdout, _ = await asyncio.wait_for(proc2.communicate(), timeout=10)
            except asyncio.TimeoutError:
                proc2.kill()
                stdout = b""
            tags = [t.strip() for t in stdout.decode().split("\n") if t.strip()]
            latest_version = tags[0] if tags else None

            has_update = (
                latest_version is not None
                and current_version is not None
                and latest_version != current_version
            )

            return {
                "has_update": has_update,
                "latest_version": latest_version,
                "current_version": current_version,
            }

        except Exception as e:
            logger.error(f"[GITHUB-INTEGRATION] Update check failed for {repo_dir}: {e}")
            return {"has_update": False, "latest_version": None, "current_version": None}

    # ── Git Operations ──────────────────────────────────────────────────────

    async def _clone_repo(self, source: GitHubSource, target_dir: str) -> None:
        """Clone a git repository."""
        url = self._build_clone_url(source)
        args = ["clone", "--depth", "1"]

        if source.type == GitHubSourceType.BRANCH and source.ref:
            args.extend(["--branch", source.ref])

        args.extend([url, target_dir])

        proc = await asyncio.create_subprocess_exec(
            "git", *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=120)
        except asyncio.TimeoutError:
            proc.kill()
            raise RuntimeError(f"Git clone timed out after 120s")

        if proc.returncode != 0:
            raise RuntimeError(
                f"Git clone failed: {stderr.decode()[:500]}"
            )

        logger.info(f"[GITHUB-INTEGRATION] Cloned {source.repository} -> {target_dir}")

    async def _fetch_repo(self, target_dir: str) -> None:
        """Fetch latest changes for an existing clone."""
        proc = await asyncio.create_subprocess_exec(
            "git", "fetch", "--all", "--tags",
            cwd=target_dir,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            await asyncio.wait_for(proc.communicate(), timeout=60)
        except asyncio.TimeoutError:
            proc.kill()
            raise RuntimeError("Git fetch timed out after 60s")

    async def _checkout_ref(self, target_dir: str, ref: str) -> None:
        """Checkout a specific ref."""
        if ref == "latest":
            # Get the latest tag
            proc = await asyncio.create_subprocess_exec(
                "git", "tag", "--list", "--sort=-version:refname",
                cwd=target_dir,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            try:
                stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=10)
            except asyncio.TimeoutError:
                proc.kill()
                stdout = b""
            tags = [t.strip() for t in stdout.decode().split("\n") if t.strip()]
            ref = tags[0] if tags else "main"

        proc = await asyncio.create_subprocess_exec(
            "git", "checkout", ref,
            cwd=target_dir,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=30)
        except asyncio.TimeoutError:
            proc.kill()
            raise RuntimeError(f"Git checkout timed out for ref '{ref}'")

        if proc.returncode != 0:
            raise RuntimeError(
                f"Git checkout failed for ref '{ref}': {stderr.decode()[:500]}"
            )

    def _build_clone_url(self, source: GitHubSource) -> str:
        """Build a clone URL with authentication if available."""
        token = source.token or self.github_token

        if source.repository.startswith("http"):
            base = source.repository
        else:
            base_url = source.enterprise_url or "https://github.com"
            base = f"{base_url}/{source.repository}.git"

        if token:
            # Inject token into URL
            base = base.replace("https://", f"https://x-access-token:{token}@")

        return base

    # ── Manifest Handling ───────────────────────────────────────────────────

    async def _find_and_parse_manifest(
        self, plugin_dir: str
    ) -> Optional[Tuple[str, Dict[str, Any]]]:
        """Find and parse a plugin manifest file."""
        for filename in VALID_MANIFEST_FILES:
            full_path = os.path.join(plugin_dir, filename)
            if os.path.isfile(full_path):
                try:
                    with open(full_path, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    if isinstance(data, dict) and "id" in data:
                        return (full_path, data)
                except (json.JSONDecodeError, IOError) as e:
                    logger.warning(f"[GITHUB-INTEGRATION] Failed to parse {full_path}: {e}")
        return None

    async def _compute_checksum(self, file_path: str) -> str:
        """Compute SHA-256 checksum of a file."""
        sha256 = hashlib.sha256()
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(65536), b""):
                sha256.update(chunk)
        return sha256.hexdigest()

    # ── Build Support ───────────────────────────────────────────────────────

    async def _build_plugin(
        self, plugin_dir: str, manifest: Dict[str, Any]
    ) -> None:
        """Build a plugin if it has build scripts."""
        package_json_path = os.path.join(plugin_dir, "package.json")
        if not os.path.isfile(package_json_path):
            logger.info(f"[GITHUB-INTEGRATION] No package.json — build skipped")
            return

        try:
            with open(package_json_path, "r") as f:
                pkg = json.load(f)

            build_script = pkg.get("scripts", {}).get("build")
            if not build_script:
                logger.info(f"[GITHUB-INTEGRATION] No build script — build skipped")
                return

            logger.info(f"[GITHUB-INTEGRATION] Building plugin '{manifest.get('id')}'...")
            proc = await asyncio.create_subprocess_exec(
                "npm", "run", "build",
                cwd=plugin_dir,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            try:
                stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=120)
            except asyncio.TimeoutError:
                proc.kill()
                raise RuntimeError("npm build timed out after 120s")

            if proc.returncode != 0:
                raise RuntimeError(f"npm build failed: {stderr.decode()[:500]}")

            logger.info(f"[GITHUB-INTEGRATION] Build complete for '{manifest.get('id')}'")

        except (json.JSONDecodeError, IOError) as e:
            logger.warning(f"[GITHUB-INTEGRATION] Build check error: {e}")

    # ── Utilities ──────────────────────────────────────────────────────────

    async def cleanup(self, repo_dir: Optional[str] = None) -> None:
        """Remove a cloned repository."""
        target = repo_dir or self.workspaces_dir
        if os.path.isdir(target):
            shutil.rmtree(target, ignore_errors=True)
            logger.info(f"[GITHUB-INTEGRATION] Cleaned up {target}")

    async def list_installed(self) -> List[str]:
        """List all installed plugin directories."""
        try:
            return [
                entry for entry in os.listdir(self.workspaces_dir)
                if os.path.isdir(os.path.join(self.workspaces_dir, entry))
            ]
        except OSError:
            return []

    def _sanitize_repo_name(self, repo: str) -> str:
        """Sanitize a repository name for filesystem use."""
        return re.sub(r"[^a-zA-Z0-9._-]", "_", repo).lower()

    def _parse_github_url(self, url: str) -> Optional[str]:
        """Parse a GitHub URL into owner/repo format."""
        patterns = [
            r"github\.com[:/]([^/]+/[^/]+?)(?:\.git)?$",
            r"github\.com[:/]([^/]+/[^/]+?)/?$",
        ]
        for pattern in patterns:
            match = re.search(pattern, url)
            if match:
                return match.group(1)
        return None


# ── Singleton ───────────────────────────────────────────────────────────────

github_plugin_integration = GitHubPluginIntegration()
