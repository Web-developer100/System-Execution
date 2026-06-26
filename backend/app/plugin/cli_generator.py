"""
Plugin SDK — CLI Generator.

Generates complete plugin project scaffolding:
  - Plugin directory structure
  - Manifest file
  - Base class implementation
  - Configuration schema
  - Documentation (README, API docs)
  - Unit tests
  - Build scripts and CI/CD config
  - Dockerfile (optional)
  - .gitignore

The generated plugin is immediately ready for the V8 platform.
"""
from __future__ import annotations

import json
import logging
import os
import shutil
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.plugin.sdk.manifest import PluginCategory, PluginManifest, PluginPermissions

logger = logging.getLogger(__name__)


@dataclass
class PluginTemplateConfig:
    """Configuration for generating a new plugin project."""
    id: str = "com.example.my-plugin"
    name: str = "My Plugin"
    category: str = "utility"
    description: str = "A V8 platform plugin"
    version: str = "1.0.0"
    author: str = "Plugin Developer"
    license: str = "MIT"
    repository: str = "https://github.com/example/my-plugin"
    entry_point: str = "src/main.py"
    language: str = "python"  # python, typescript, go, rust, shell
    use_docker: bool = False
    permissions: List[Dict[str, Any]] = field(default_factory=lambda: [
        {"permission": "network:access", "reason": "Network scanning requires network access", "required": True},
    ])
    input_types: List[str] = field(default_factory=lambda: ["url", "domain"])
    output_types: List[str] = field(default_factory=lambda: ["json"])
    tags: List[str] = field(default_factory=list)
    output_dir: str = "."


class PluginCliGenerator:
    """Generates complete plugin projects."""

    async def generate(
        self, config: PluginTemplateConfig
    ) -> Dict[str, Any]:
        """Generate a complete plugin project from a template."""
        plugin_dir = os.path.join(
            config.output_dir,
            config.id.replace("/", "-").replace(".", "-"),
        )

        if os.path.exists(plugin_dir):
            raise FileExistsError(f"Plugin directory already exists: {plugin_dir}")

        # Create directory structure
        dirs = [
            os.path.join(plugin_dir, "src"),
            os.path.join(plugin_dir, "tests"),
            os.path.join(plugin_dir, "docs"),
        ]
        for d in dirs:
            os.makedirs(d, exist_ok=True)

        generated_files = []

        # Generate files based on language
        if config.language == "python":
            files = self._generate_python_files(config, plugin_dir)
        elif config.language == "typescript":
            files = self._generate_typescript_files(config, plugin_dir)
        elif config.language == "go":
            files = self._generate_go_files(config, plugin_dir)
        elif config.language == "shell":
            files = self._generate_shell_files(config, plugin_dir)
        else:
            files = self._generate_python_files(config, plugin_dir)

        # Common files (manifest, docs, tests, CI/CD)
        files.extend(self._generate_common_files(config, plugin_dir))

        if config.use_docker:
            docker_file = (os.path.join(plugin_dir, "Dockerfile"),
                           self._generate_dockerfile(config))
            files.append(docker_file)

        # Write all files
        for file_path, content in files:
            os.makedirs(os.path.dirname(file_path), exist_ok=True)
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(content)
            generated_files.append(file_path)

        logger.info(
            f"[PLUGIN-CLI] Generated plugin at {plugin_dir} "
            f"({len(generated_files)} files)"
        )

        return {
            "plugin_dir": plugin_dir,
            "files": generated_files,
            "file_count": len(generated_files),
        }

    # ── Python Plugin Files ──────────────────────────────────────────────────

    def _generate_python_files(
        self, config: PluginTemplateConfig, plugin_dir: str
    ) -> List[tuple]:
        """Generate Python plugin files."""
        srcdir = os.path.join(plugin_dir, "src")
        class_name = self._to_pascal_case(config.name)

        # __init__.py
        init_py = self._generate_python_init(config, class_name)
        main_py = self._generate_python_main(config, class_name)
        config_py = self._generate_python_config(config, class_name)
        types_py = self._generate_python_types(config, class_name)
        setup_cfg = self._generate_setup_cfg(config)
        pyproject = self._generate_pyproject_toml(config)

        return [
            (os.path.join(srcdir, "__init__.py"), init_py),
            (os.path.join(srcdir, "main.py"), main_py),
            (os.path.join(srcdir, "config.py"), config_py),
            (os.path.join(srcdir, "types.py"), types_py),
            (os.path.join(plugin_dir, "setup.cfg"), setup_cfg),
            (os.path.join(plugin_dir, "pyproject.toml"), pyproject),
        ]

    def _generate_python_init(
        self, config: PluginTemplateConfig, class_name: str
    ) -> str:
        return f'''"""
{config.name} — V8 Platform Plugin
Auto-generated by V8 Plugin CLI Generator
"""

from src.main import {class_name}Plugin

__all__ = ["{class_name}Plugin"]
'''

    def _generate_python_main(
        self, config: PluginTemplateConfig, class_name: str
    ) -> str:
        manifest_json = json.dumps(self._build_manifest_dict(config), indent=2)
        return f'''"""
{config.name} Plugin — {config.description}
"""
from __future__ import annotations

import logging
import time
from typing import Any, Dict, List, Optional

from app.plugin.sdk.plugin_base import PluginBase
from app.plugin.sdk.context import PluginExecutionContext, PluginExecutionResult
from app.plugin.sdk.manifest import PluginManifest, PluginCategory

logger = logging.getLogger(__name__)


class {class_name}Plugin(PluginBase):
    \"\"\"{config.name} plugin for the V8 platform.\"\"\"

    manifest = PluginManifest.from_dict({manifest_json})

    # ── Lifecycle Hooks ─────────────────────────────────────────────────────

    async def on_install(self) -> None:
        self.logger.info("Installing {config.name} plugin...")
        # TODO: Download required assets, install dependencies
        await super().on_install()

    async def on_configure(self, config_data: Dict[str, Any]) -> None:
        self.logger.info("Configuring {config.name} plugin", extra={{"config": config_data}})
        await super().on_configure(config_data)

    async def on_health_check(self) -> Dict[str, Any]:
        \"\"\"Return plugin health status.\"\"\"
        # TODO: Implement actual health check
        return {{"healthy": True, "message": "{config.name} plugin is operational"}}

    # ── Main Execution ──────────────────────────────────────────────────────

    async def execute(self, ctx: PluginExecutionContext) -> PluginExecutionResult:
        \"\"\"Execute the plugin against a target.\"\"\"
        await self.log(f"Starting {{self.manifest.id}} execution against {{ctx.target}}")

        start_time = int(time.time() * 1000)
        errors: List[str] = []
        warnings: List[str] = []

        try:
            # TODO: Implement plugin logic here
            await self.progress(25)

            if self.get_config_value("verbose", False):
                await self.log(f"Scanning {{ctx.target}} with {config.name}")

            await self.progress(50)
            await self.progress(75)

            duration_ms = int(time.time() * 1000) - start_time

            await self.log(f"{config.name} scan completed in {{duration_ms}}ms")
            await self.progress(100)

            return PluginExecutionResult(
                success=True,
                findings=[],
                duration_ms=duration_ms,
                plugin_id=self.manifest.id,
                plugin_version=self.manifest.version,
            )

        except Exception as e:
            error_msg = str(e)
            errors.append(error_msg)
            await self.log(f"{config.name} execution failed: {{error_msg}}", level="error")

            return PluginExecutionResult(
                success=False,
                findings=[],
                duration_ms=int(time.time() * 1000) - start_time,
                error_message=error_msg,
                errors=errors,
                warnings=warnings,
                plugin_id=self.manifest.id,
                plugin_version=self.manifest.version,
            )

    async def parse_output(self, tool_name: str, stdout: str, stderr: str) -> List[Dict[str, Any]]:
        \"\"\"Parse raw tool output into structured findings.\"\"\"
        findings: List[Dict[str, Any]] = []
        # TODO: Implement tool-specific output parsing
        return findings


# ── Plugin Instance ─────────────────────────────────────────────────────────

plugin = {class_name}Plugin()
'''

    def _generate_python_config(
        self, config: PluginTemplateConfig, class_name: str
    ) -> str:
        return f'''"""
Configuration schema for {config.name} plugin.
"""
from typing import Any, Dict, List, Optional


CONFIG_SCHEMA = [
    {{
        "key": "timeout",
        "label": "Execution Timeout (seconds)",
        "type": "number",
        "description": "Maximum execution time before the plugin is terminated",
        "required": False,
        "default": 300,
        "validation": {{"min": 10, "max": 3600}},
    }},
    {{
        "key": "max_concurrency",
        "label": "Max Concurrent Targets",
        "type": "number",
        "description": "Maximum number of targets to scan simultaneously",
        "required": False,
        "default": 5,
        "validation": {{"min": 1, "max": 50}},
    }},
    {{
        "key": "verbose",
        "label": "Verbose Logging",
        "type": "boolean",
        "description": "Enable detailed debug logging",
        "required": False,
        "default": False,
    }},
    {{
        "key": "proxy",
        "label": "Proxy URL",
        "type": "string",
        "description": "Optional proxy URL for outbound connections",
        "required": False,
    }},
]
'''

    def _generate_python_types(
        self, config: PluginTemplateConfig, class_name: str
    ) -> str:
        return f'''"""
Plugin-specific types for {config.name} plugin.
"""
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class {self._to_pascal_case(config.name)}Config:
    timeout: int = 300
    max_concurrency: int = 5
    verbose: bool = False
    proxy: Optional[str] = None


@dataclass
class {self._to_pascal_case(config.name)}Result:
    target: str = ""
    findings: List[Dict[str, Any]] = field(default_factory=list)
    duration_ms: int = 0
    errors: List[str] = field(default_factory=list)
'''

    # ── TypeScript Plugin Files ──────────────────────────────────────────────

    def _generate_typescript_files(
        self, config: PluginTemplateConfig, plugin_dir: str
    ) -> List[tuple]:
        class_name = self._to_pascal_case(config.name)
        srcdir = os.path.join(plugin_dir, "src")

        files = [
            (os.path.join(srcdir, "index.ts"), self._generate_ts_main(config, class_name)),
            (os.path.join(srcdir, "config.ts"), self._generate_ts_config(config, class_name)),
            (os.path.join(srcdir, "types.ts"), self._generate_ts_types(config, class_name)),
            (os.path.join(plugin_dir, "package.json"), self._generate_package_json(config)),
            (os.path.join(plugin_dir, "tsconfig.json"), self._generate_tsconfig()),
        ]
        return files

    def _generate_ts_main(
        self, config: PluginTemplateConfig, class_name: str
    ) -> str:
        manifest_json = json.dumps(self._build_manifest_dict(config), indent=2)
        return f'''// -----------------------------------------------------------------------
// {config.name} — V8 Platform Plugin
// -----------------------------------------------------------------------
// Auto-generated by V8 Plugin CLI Generator
// Generated: {datetime.now(timezone.utc).isoformat()}

import {{ PluginBase }} from "@workspace/api-server/plugin/sdk/plugin-base";
import type {{
  PluginManifest, PluginExecutionContext, PluginExecutionResult,
}} from "@workspace/api-server/plugin/sdk/types";

const manifest: PluginManifest = {manifest_json} as PluginManifest;

export class {class_name}Plugin extends PluginBase {{
  readonly manifest: PluginManifest = manifest;

  async onInstall(): Promise<void> {{
    this.log("info", "Installing {config.name} plugin...");
    await super.onInstall();
  }}

  async onConfigure(config: Record<string, unknown>): Promise<void> {{
    this.log("info", "Configuring {config.name} plugin", {{ config }});
    await super.onConfigure(config);
  }}

  async execute(ctx: PluginExecutionContext): Promise<PluginExecutionResult> {{
    const startTime = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];

    try {{
      // TODO: Implement plugin logic
      return {{
        success: true, findings: [], toolResult: null,
        metrics: {{ durationMs: Date.now() - startTime, cpuUsage: 0, memoryUsage: 0, outputSize: 0 }},
        errors, warnings,
      }};
    }} catch (err) {{
      const message = err instanceof Error ? err.message : String(err);
      errors.push(message);
      return {{
        success: false, findings: [], toolResult: null,
        metrics: {{ durationMs: Date.now() - startTime, cpuUsage: 0, memoryUsage: 0, outputSize: 0 }},
        errors, warnings,
      }};
    }}
  }}
}}

const plugin = new {class_name}Plugin();
export default plugin;
'''

    def _generate_ts_config(
        self, config: PluginTemplateConfig, class_name: str
    ) -> str:
        return f'''// Configuration schema for {config.name}
import type {{ ConfigField }} from "@workspace/api-server/plugin/sdk/types";

export const configSchema: ConfigField[] = [
  {{
    key: "timeout", label: "Execution Timeout (seconds)",
    type: "number", defaultValue: 300,
    description: "Maximum execution time before the plugin is terminated",
    validation: {{ min: 10, max: 3600 }},
  }},
  {{
    key: "verbose", label: "Verbose Logging",
    type: "boolean", defaultValue: false,
    description: "Enable detailed debug logging",
  }},
];
'''

    def _generate_ts_types(
        self, config: PluginTemplateConfig, class_name: str
    ) -> str:
        return f'''// Plugin-specific types for {config.name}
export interface {class_name}Config {{
  timeout: number;
  maxConcurrency: number;
  verbose: boolean;
  proxy?: string;
}}
'''

    def _generate_package_json(self, config: PluginTemplateConfig) -> str:
        return json.dumps({
            "name": config.id,
            "version": config.version,
            "description": config.description,
            "main": config.entry_point,
            "scripts": {
                "build": "tsc",
                "test": "vitest run",
                "test:watch": "vitest",
            },
            "dependencies": {
                "@workspace/api-server": "*",
            },
            "devDependencies": {
                "typescript": "^5.5.0",
                "vitest": "^2.0.0",
                "@types/node": "^20.0.0",
            },
        }, indent=2)

    def _generate_tsconfig(self) -> str:
        return json.dumps({
            "compilerOptions": {
                "target": "ES2022",
                "module": "ESNext",
                "moduleResolution": "bundler",
                "esModuleInterop": True,
                "strict": True,
                "outDir": "dist",
                "rootDir": "src",
                "declaration": True,
                "declarationMap": True,
                "sourceMap": True,
            },
            "include": ["src/**/*"],
        }, indent=2)

    # ── Go Plugin Files ────────────────────────────────────────────────────

    def _generate_go_files(
        self, config: PluginTemplateConfig, plugin_dir: str
    ) -> List[tuple]:
        class_name = self._to_pascal_case(config.name)
        srcdir = os.path.join(plugin_dir, "src")
        go_mod_content = f'''module github.com/example/{config.id.replace(".", "-")}

go 1.22

require github.com/v8platform/sdk v1.0.0
'''
        main_go = f'''package main

import (
    "log"
    sdk "github.com/v8platform/sdk"
)

type {class_name}Plugin struct {{
    sdk.PluginBase
}}

func (p *{class_name}Plugin) Execute(ctx *sdk.ExecutionContext) *sdk.ExecutionResult {{
    log.Printf("Starting {config.name} execution against %s", ctx.Target)
    // TODO: Implement plugin logic
    return &sdk.ExecutionResult{{
        Success:   true,
        Findings:  []sdk.Finding{{}},
        DurationMs: 0,
    }}
}}

var Plugin = &{class_name}Plugin{{}}
'''
        return [
            (os.path.join(plugin_dir, "go.mod"), go_mod_content),
            (os.path.join(srcdir, "main.go"), main_go),
        ]

    # ── Shell Plugin Files ─────────────────────────────────────────────────

    def _generate_shell_files(
        self, config: PluginTemplateConfig, plugin_dir: str
    ) -> List[tuple]:
        srcdir = os.path.join(plugin_dir, "src")
        script_content = '''#!/bin/bash
# {name} — V8 Platform Plugin
# Auto-generated by V8 Plugin CLI Generator

set -euo pipefail

TARGET="${{1:-}}"
if [ -z "$TARGET" ]; then
    echo '{{"success": false, "error": "No target provided"}}'
    exit 1
fi

echo "Starting {name} scan: $TARGET"

# TODO: Implement plugin scanning logic

echo '{{"success": true, "findings": []}}'
'''.replace("{name}", config.name)

        return [
            (os.path.join(srcdir, "run.sh"), script_content),
        ]

    # ── Common Files ────────────────────────────────────────────────────────

    def _generate_common_files(
        self, config: PluginTemplateConfig, plugin_dir: str
    ) -> List[tuple]:
        return [
            (os.path.join(plugin_dir, "v8-plugin.json"),
             self._generate_manifest(config)),
            (os.path.join(plugin_dir, "tests", "test_plugin.py"),
             self._generate_unit_test(config)),
            (os.path.join(plugin_dir, "tests", "test_integration.py"),
             self._generate_integration_test(config)),
            (os.path.join(plugin_dir, "docs", "README.md"),
             self._generate_readme(config)),
            (os.path.join(plugin_dir, "docs", "API.md"),
             self._generate_api_docs(config)),
            (os.path.join(plugin_dir, ".gitignore"),
             self._generate_gitignore()),
            (os.path.join(plugin_dir, ".github", "workflows", "ci.yml"),
             self._generate_ci_workflow(config)),
        ]

    def _generate_manifest(self, config: PluginTemplateConfig) -> str:
        """Generate the plugin manifest JSON."""
        return json.dumps(self._build_manifest_dict(config), indent=2)

    def _build_manifest_dict(self, config: PluginTemplateConfig) -> Dict[str, Any]:
        """Build a complete manifest dictionary."""
        return {
            "id": config.id,
            "name": config.name,
            "version": config.version,
            "description": config.description,
            "author": config.author,
            "license": config.license,
            "repository": config.repository,
            "homepage": "",
            "documentation_url": "",
            "category": config.category,
            "supported_platforms": ["linux/amd64", "darwin/amd64", "windows/amd64"],
            "supported_architectures": ["amd64", "arm64"],
            "min_platform_version": "1.0.0",
            "dependencies": [],
            "optional_dependencies": [],
            "permissions": config.permissions,
            "network_requirements": {
                "internet_access": config.category in ("scanner", "recon", "network"),
                "raw_sockets": config.category == "network",
                "outbound_connections": True,
                "inbound_connections": False,
                "allowed_domains": [],
                "allowed_ports": [],
                "dns_resolution": config.category == "recon",
            },
            "resource_limits": {
                "cpu": "1",
                "memory": "512m",
                "timeout": 300,
                "max_disk": 104857600,
                "max_output": 1048576,
                "max_file_descriptors": 128,
                "max_processes": 10,
            },
            "default_config": {
                "timeout": 300,
                "max_concurrency": 5,
                "verbose": False,
            },
            "health_check": {
                "interval": 60,
                "timeout": 10,
                "type": "command",
                "command": "echo 'ok'",
                "expected_exit_code": 0,
            },
            "entry_point": config.entry_point,
            "input_types": config.input_types,
            "output_types": config.output_types,
            "subscribed_events": ["ScanStarted", "ScanFinished"],
            "published_events": [],
            "tags": config.tags,
            "enabled": True,
        }

    def _generate_unit_test(self, config: PluginTemplateConfig) -> str:
        class_name = self._to_pascal_case(config.name)
        return f'''"""
Unit tests for {config.name} plugin.
Auto-generated by V8 Plugin CLI Generator.
"""
import pytest
from src.main import {class_name}Plugin


def test_manifest_is_valid():
    \"\"\"Plugin should have a valid manifest.\"\"\"
    plugin = {class_name}Plugin()
    assert plugin.manifest is not None
    assert plugin.manifest.id == "{config.id}"
    assert plugin.manifest.version == "{config.version}"
    assert plugin.manifest.name == "{config.name}"


@pytest.mark.asyncio
async def test_on_validate():
    \"\"\"Plugin validation should pass.\"\"\"
    plugin = {class_name}Plugin()
    # Validation should not raise
    await plugin.on_validate()


@pytest.mark.asyncio
async def test_execute_returns_result():
    \"\"\"Plugin execution should return a result.\"\"\"
    plugin = {class_name}Plugin()
    from app.plugin.sdk.context import PluginExecutionContext

    ctx = PluginExecutionContext(
        target="https://example.com",
        scan_id="test-scan-1",
        config={{"verbose": False}},
        timeout=30,
    )
    result = await plugin.execute(ctx)
    assert result is not None
    assert isinstance(result.success, bool)
'''

    def _generate_integration_test(self, config: PluginTemplateConfig) -> str:
        return f'''"""
Integration tests for {config.name} plugin.
Auto-generated by V8 Plugin CLI Generator.
''' + '"""\n\n\ndef test_plugin_installable():\n    """Plugin should be installable via the registry."""\n    # This test requires a running V8 platform instance\n    # TODO: Implement integration test with test harness\n    assert True\n'

    def _generate_readme(self, config: PluginTemplateConfig) -> str:
        perm_table = "\n".join(
            f"| {p['permission']} | {'Yes' if p.get('required') else 'No'} | {p.get('reason', '')} |"
            for p in config.permissions
        )
        return f'''# {config.name}

{config.description}

## Overview

{config.name} is a V8 Neural Exploitation Platform plugin in the "{config.category}" category.

## Installation

```bash
v8 plugin install {config.id}
```

## Configuration

| Field | Default | Description |
|-------|---------|-------------|
| timeout | 300 | Maximum execution time (seconds) |
| max_concurrency | 5 | Max concurrent targets |
| verbose | false | Enable debug logging |

## Permissions

| Permission | Required | Reason |
|------------|----------|--------|
{perm_table}

## Usage

```bash
# Scan a target
v8 scan --target https://example.com --tools {config.id}
```

## Development

```bash
# Install dependencies
pip install -e .

# Test
pytest

# Build
python -m build
```

## License

{config.license}
'''

    def _generate_api_docs(self, config: PluginTemplateConfig) -> str:
        return f'''# {config.name} Plugin API

## Methods

### execute(ctx)
Main execution method. Called by the V8 orchestrator.

**Parameters:**
- ctx.target — Target URL/domain/IP
- ctx.scan_id — Scan identifier
- ctx.config — Plugin configuration
- ctx.timeout — Execution timeout (seconds)

**Returns:** PluginExecutionResult

### parse_output(tool_name, stdout, stderr)
Parse raw tool output into structured findings.

**Parameters:**
- tool_name — Name of the tool
- stdout — Standard output
- stderr — Standard error

**Returns:** List[Dict]

## Events

### Subscribed Events
- ScanStarted
- ScanFinished

### Published Events
None
'''

    def _generate_setup_cfg(self, config: PluginTemplateConfig) -> str:
        return f'''[metadata]
name = {config.id}
version = {config.version}
description = {config.description}
author = {config.author}
license = {config.license}

[options]
packages = find:
install_requires =
    v8-plugin-sdk>=1.0.0

[options.extras_require]
test =
    pytest>=7.0
    pytest-asyncio>=0.21
'''

    def _generate_pyproject_toml(self, config: PluginTemplateConfig) -> str:
        return f'''[build-system]
requires = ["setuptools>=68.0", "wheel"]
build-backend = "setuptools.build_meta"

[project]
name = "{config.id}"
version = "{config.version}"
description = "{config.description}"
authors = [{{name = "{config.author}"}}]
license = {{text = "{config.license}"}}
requires-python = ">=3.12"
dependencies = [
    "v8-plugin-sdk>=1.0.0",
]

[project.optional-dependencies]
test = [
    "pytest>=7.0",
    "pytest-asyncio>=0.21",
]

[tool.pytest.ini_options]
asyncio_mode = "auto"
'''

    def _generate_ci_workflow(self, config: PluginTemplateConfig) -> str:
        return f'''name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - name: Install dependencies
        run: |
          pip install -e .
          pip install pytest pytest-asyncio
      - name: Run tests
        run: pytest
'''

    def _generate_dockerfile(self, config: PluginTemplateConfig) -> str:
        return f'''# {config.name} Plugin Dockerfile
FROM python:3.12-slim

WORKDIR /plugin

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY src/ ./src/
COPY v8-plugin.json .

ENTRYPOINT ["python", "src/main.py"]
'''

    def _generate_gitignore(self) -> str:
        return '''# Python
__pycache__/
*.py[cod]
*.egg-info/
dist/
build/

# Node
node_modules/
dist/

# IDE
.vscode/
.idea/
*.swp

# Environment
.env
.env.local

# OS
.DS_Store
Thumbs.db
'''

    # ── Utilities ───────────────────────────────────────────────────────────

    def _to_pascal_case(self, name: str) -> str:
        """Convert a name to PascalCase."""
        import re
        words = re.sub(r"[^a-zA-Z0-9]+", " ", name).split()
        return "".join(w[0].upper() + w[1:].lower() if w else "" for w in words)


# ── Singleton ───────────────────────────────────────────────────────────────

plugin_cli_generator = PluginCliGenerator()
