"""
Plugin SDK — Manifest Validator.

Finds and parses plugin manifest files, validates all fields,
computes checksums, verifies digital signatures, and generates
manifest templates.
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import re
from typing import Any, Dict, List, Optional, Tuple

from app.plugin.sdk.manifest import PluginManifest, PluginCategory

logger = logging.getLogger(__name__)

# Files to search for when looking for manifests
VALID_MANIFEST_FILES = ["v8-plugin.json", "plugin.json", ".v8-plugin.json", "manifest.json"]

# All valid plugin categories
VALID_CATEGORIES = [e.value for e in PluginCategory]


class ManifestValidationResult:
    """Result of manifest validation."""

    def __init__(
        self,
        valid: bool = False,
        errors: Optional[List[str]] = None,
        warnings: Optional[List[str]] = None,
        manifest: Optional[PluginManifest] = None,
    ):
        self.valid = valid
        self.errors = errors or []
        self.warnings = warnings or []
        self.manifest = manifest

    def to_dict(self) -> Dict[str, Any]:
        return {
            "valid": self.valid,
            "errors": self.errors,
            "warnings": self.warnings,
            "manifest": self.manifest.to_dict() if self.manifest else None,
        }


class ManifestValidator:
    """Validates plugin manifests and finds them in directories."""

    SEMVER_PATTERN = re.compile(
        r"^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.]+)?(?:\+[a-zA-Z0-9.]+)?$"
    )
    PLUGIN_ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9._-]{1,64}$")

    # ── Finding Manifests ───────────────────────────────────────────────────

    async def find_and_parse(
        self, plugin_dir: str
    ) -> ManifestValidationResult:
        """Find a manifest file in the directory and parse it."""
        errors: List[str] = []
        warnings: List[str] = []

        if not os.path.isdir(plugin_dir):
            return ManifestValidationResult(
                valid=False,
                errors=[f"Plugin directory not found: {plugin_dir}"],
            )

        manifest_path: Optional[str] = None
        for filename in VALID_MANIFEST_FILES:
            full_path = os.path.join(plugin_dir, filename)
            if os.path.isfile(full_path):
                manifest_path = full_path
                break

        if not manifest_path:
            return ManifestValidationResult(
                valid=False,
                errors=[
                    f"No manifest file found in {plugin_dir}. "
                    f"Expected one of: {', '.join(VALID_MANIFEST_FILES)}"
                ],
            )

        try:
            with open(manifest_path, "r", encoding="utf-8") as f:
                content = f.read()
            parsed = json.loads(content)

            if not isinstance(parsed, dict):
                return ManifestValidationResult(
                    valid=False,
                    errors=["Manifest must be a JSON object"],
                )

            result = self.validate(parsed)
            if result.valid:
                result.manifest = PluginManifest.from_dict(parsed)

            result.warnings.extend(warnings)
            return result

        except json.JSONDecodeError as e:
            return ManifestValidationResult(
                valid=False,
                errors=[f"Invalid JSON in manifest: {e}"],
            )
        except IOError as e:
            return ManifestValidationResult(
                valid=False,
                errors=[f"Failed to read manifest: {e}"],
            )

    # ── Validation ──────────────────────────────────────────────────────────

    def validate(
        self, manifest: Dict[str, Any]
    ) -> ManifestValidationResult:
        """Validate a parsed manifest dictionary."""
        errors: List[str] = []
        warnings: List[str] = []

        # Required fields
        required_fields = [
            ("id", "Plugin ID", str),
            ("name", "Plugin Name", str),
            ("version", "Version", str),
            ("description", "Description", str),
            ("author", "Author", str),
            ("license", "License", str),
            ("category", "Category", str),
            ("entryPoint", "Entry Point", str),
        ]

        for key, field_name, expected_type in required_fields:
            value = manifest.get(key)
            if value is None or value == "":
                errors.append(f"{field_name} is required but was not provided")
            elif not isinstance(value, expected_type):
                errors.append(
                    f"{field_name} must be a {expected_type.__name__}, "
                    f"got {type(value).__name__}"
                )

        # Semver validation for version
        version = manifest.get("version", "")
        if version and not self.SEMVER_PATTERN.match(str(version)):
            errors.append(
                f'Version "{version}" is not valid semver (expected format: X.Y.Z)'
            )

        # Semver for platform versions
        for key in ("minPlatformVersion", "maxPlatformVersion"):
            val = manifest.get(key)
            if val and not self.SEMVER_PATTERN.match(str(val)):
                errors.append(
                    f'{key} "{val}" is not valid semver (expected format: X.Y.Z)'
                )

        # Plugin ID format
        plugin_id = manifest.get("id", "")
        if plugin_id and not self.PLUGIN_ID_PATTERN.match(str(plugin_id)):
            errors.append(
                f'Plugin ID "{plugin_id}" is invalid. '
                f"Use lowercase alphanumeric with dots, hyphens, underscores "
                f"(2-64 characters)."
            )

        # Category validation
        category = manifest.get("category")
        if category and category not in VALID_CATEGORIES:
            warnings.append(
                f'Unknown category "{category}". '
                f"Valid categories include: "
                f'{", ".join(VALID_CATEGORIES[:10])}...'
            )

        # Permissions validation
        permissions = manifest.get("permissions")
        if isinstance(permissions, list):
            for perm in permissions:
                if not isinstance(perm.get("permission"), str):
                    warnings.append(
                        f"Permission entry missing or invalid 'permission' field"
                    )

        # Dependencies validation
        deps = manifest.get("dependencies")
        if isinstance(deps, list):
            for dep in deps:
                if not isinstance(dep, str) or len(dep) == 0:
                    errors.append("Dependency IDs must be non-empty strings")

        # Input/Output types
        input_types = manifest.get("inputTypes")
        if not isinstance(input_types, list) or len(input_types) == 0:
            warnings.append('No input types specified — defaulting to ["url"]')

        output_types = manifest.get("outputTypes")
        if not isinstance(output_types, list) or len(output_types) == 0:
            warnings.append('No output types specified — defaulting to ["json"]')

        # Entry point
        entry_point = manifest.get("entryPoint")
        if entry_point and not isinstance(entry_point, str):
            errors.append("Entry Point must be a string")

        # Resource limits validation
        resources = manifest.get("resourceLimits", {})
        if isinstance(resources, dict):
            for rkey in ("cpu", "memory", "timeout"):
                val = resources.get(rkey)
                if rkey == "cpu" and val is not None and not isinstance(val, str):
                    warnings.append(f"resourceLimits.cpu should be a string (e.g. '1', '500m')")
                elif rkey == "timeout" and val is not None and not isinstance(val, (int, float)):
                    warnings.append(f"resourceLimits.timeout should be a number")

        # Checksum verification
        checksum = manifest.get("checksum")
        digital_signature = manifest.get("digitalSignature")
        if checksum and digital_signature:
            try:
                payload = json.dumps(
                    {"id": plugin_id, "version": version, "checksum": checksum},
                    sort_keys=True,
                )
                sig_valid = self._verify_signature(payload, str(digital_signature))
                if not sig_valid:
                    warnings.append(
                        "Digital signature verification failed — "
                        "manifest may be tampered"
                    )
            except Exception as e:
                warnings.append(
                    f"Digital signature could not be verified: {e}"
                )

        # Supported platforms
        platforms = manifest.get("supportedPlatforms")
        if not isinstance(platforms, list) or len(platforms) == 0:
            warnings.append(
                'No supported platforms specified — '
                'defaulting to ["linux/amd64"]'
            )

        return ManifestValidationResult(
            valid=len(errors) == 0,
            errors=errors,
            warnings=warnings,
        )

    # ── Signature Verification ─────────────────────────────────────────────

    def _verify_signature(self, payload: str, signature: str) -> bool:
        """Verify a digital signature using the configured public key."""
        try:
            public_key = os.environ.get("V8_PLUGIN_SIGNING_PUBLIC_KEY")
            if not public_key:
                logger.warning(
                    "[MANIFEST-VALIDATOR] No V8_PLUGIN_SIGNING_PUBLIC_KEY set "
                    "- skipping signature verification"
                )
                return True

            from cryptography.hazmat.primitives import hashes, serialization
            from cryptography.hazmat.primitives.asymmetric import padding, rsa

            public_key_obj = serialization.load_pem_public_key(
                public_key.encode()
            )
            if not isinstance(public_key_obj, rsa.RSAPublicKey):
                return False

            public_key_obj.verify(
                signature.encode() if isinstance(signature, str) else signature,
                payload.encode(),
                padding.PKCS1v15(),
                hashes.SHA256(),
            )
            return True

        except ImportError:
            logger.warning(
                "[MANIFEST-VALIDATOR] cryptography package not available "
                "- skipping signature verification"
            )
            return True
        except Exception:
            return False

    # ── Checksum Computation ────────────────────────────────────────────────

    async def compute_checksum(self, file_path: str) -> str:
        """Compute SHA-256 checksum of a file."""
        sha256 = hashlib.sha256()
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(65536), b""):
                sha256.update(chunk)
        return sha256.hexdigest()

    # ── Manifest Template Generation ────────────────────────────────────────

    def generate_manifest_template(
        self, overrides: Optional[Dict[str, Any]] = None
    ) -> str:
        """Generate a complete manifest template."""
        template: Dict[str, Any] = {
            "id": overrides.get("id", "com.example.my-plugin") if overrides else "com.example.my-plugin",
            "name": overrides.get("name", "My Plugin") if overrides else "My Plugin",
            "version": overrides.get("version", "1.0.0") if overrides else "1.0.0",
            "description": overrides.get("description", "A V8 platform plugin") if overrides else "A V8 platform plugin",
            "author": overrides.get("author", "Plugin Developer") if overrides else "Plugin Developer",
            "license": overrides.get("license", "MIT") if overrides else "MIT",
            "repository": overrides.get("repository", "https://github.com/example/my-plugin") if overrides else "https://github.com/example/my-plugin",
            "homepage": overrides.get("homepage", "") if overrides else "",
            "documentation_url": overrides.get("documentation_url", "") if overrides else "",
            "category": overrides.get("category", "utility") if overrides else "utility",
            "supported_platforms": overrides.get("supported_platforms", ["linux/amd64", "darwin/amd64"]) if overrides else ["linux/amd64", "darwin/amd64"],
            "supported_architectures": overrides.get("supported_architectures", ["amd64"]) if overrides else ["amd64"],
            "min_platform_version": overrides.get("min_platform_version", "1.0.0") if overrides else "1.0.0",
            "dependencies": overrides.get("dependencies", []) if overrides else [],
            "optional_dependencies": overrides.get("optional_dependencies", []) if overrides else [],
            "permissions": overrides.get("permissions", [
                {"permission": "network:access", "reason": "Network scanning requires network access", "required": True},
            ]) if overrides else [
                {"permission": "network:access", "reason": "Network scanning requires network access", "required": True},
            ],
            "network_requirements": overrides.get("network_requirements", {
                "internet_access": True, "raw_sockets": False,
                "outbound_connections": True, "inbound_connections": False,
                "allowed_domains": [], "allowed_ports": [], "dns_resolution": True,
            }) if overrides else {
                "internet_access": True, "raw_sockets": False,
                "outbound_connections": True, "inbound_connections": False,
                "allowed_domains": [], "allowed_ports": [], "dns_resolution": True,
            },
            "resource_limits": overrides.get("resource_limits", {
                "cpu": "1", "memory": "512m", "timeout": 300,
                "max_disk": 104857600, "max_output": 1048576,
                "max_file_descriptors": 128, "max_processes": 10,
            }) if overrides else {
                "cpu": "1", "memory": "512m", "timeout": 300,
                "max_disk": 104857600, "max_output": 1048576,
                "max_file_descriptors": 128, "max_processes": 10,
            },
            "default_config": overrides.get("default_config", {}) if overrides else {},
            "health_check": overrides.get("health_check", {
                "interval": 60, "timeout": 10, "type": "command",
                "command": "echo 'ok'", "expected_exit_code": 0,
            }) if overrides else {
                "interval": 60, "timeout": 10, "type": "command",
                "command": "echo 'ok'", "expected_exit_code": 0,
            },
            "entry_point": overrides.get("entry_point", "index.js") if overrides else "index.js",
            "input_types": overrides.get("input_types", ["url", "domain"]) if overrides else ["url", "domain"],
            "output_types": overrides.get("output_types", ["json"]) if overrides else ["json"],
            "subscribed_events": overrides.get("subscribed_events", ["ScanStarted", "ScanFinished"]) if overrides else ["ScanStarted", "ScanFinished"],
            "published_events": overrides.get("published_events", []) if overrides else [],
            "tags": overrides.get("tags", []) if overrides else [],
            "enabled": True,
        }

        return json.dumps(template, indent=2)


# ── Singleton ───────────────────────────────────────────────────────────────

manifest_validator = ManifestValidator()
