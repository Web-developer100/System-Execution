"""
Plugin CLI — Command-line tool for plugin management.

Usage:
  v8 plugin create [name]        — Create a new plugin project
  v8 plugin build [dir]          — Build a plugin
  v8 plugin test [dir]           — Run plugin tests
  v8 plugin validate [dir]       — Validate plugin manifest
  v8 plugin package [dir]        — Package plugin for distribution
  v8 plugin sign [file]          — Digital sign a plugin package
  v8 plugin publish [file]       — Publish plugin to marketplace
  v8 plugin install [id|url]     — Install a plugin
  v8 plugin list                 — List installed plugins
  v8 plugin info [id]            — Show plugin details
  v8 plugin health [id]          — Check plugin health
  v8 plugin permissions [id]     — Show plugin permissions
"""
from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import sys
from typing import Any, Dict, List, Optional

from app.plugin.sdk.lifecycle import PluginLifecycleManager
from app.plugin.sdk.manifest_validator import manifest_validator
from app.plugin.sdk.health_monitor import plugin_health_monitor
from app.plugin.sdk.permission_manager import permission_manager
from app.plugin.sdk.plugin_event_bus import plugin_event_bus
from app.plugin.marketplace import plugin_marketplace
from app.plugin.cli_generator import PluginTemplateConfig
from app.plugin.cli_generator import PluginCliGenerator
from app.plugin.integrations.github_integration import (
    GitHubSource, GitHubSourceType, github_plugin_integration,
)

logger = logging.getLogger(__name__)
lifecycle_manager = PluginLifecycleManager()
cli_generator = PluginCliGenerator()


async def cmd_create(args: argparse.Namespace) -> None:
    """Create a new plugin project."""
    name = args.name or "my-plugin"
    plugin_id = f"com.v8platform.{name.lower().replace(' ', '-')}"

    config = PluginTemplateConfig(
        id=plugin_id,
        name=name,
        category=args.category or "utility",
        description=args.description or f"{name} plugin for V8 Platform",
        version=args.version or "1.0.0",
        author=args.author or "Plugin Developer",
        license=args.license or "MIT",
        language=args.language or "python",
        use_docker=args.docker,
        tags=args.tags.split(",") if args.tags else [],
        output_dir=args.output_dir or ".",
    )

    print(f"📦 Creating plugin '{config.name}' ({config.id})...")
    result = await cli_generator.generate(config)
    print(f"✅ Plugin created at {result['plugin_dir']}")
    print(f"   {result['file_count']} files generated")
    print(f"\nNext steps:")
    print(f"   cd {result['plugin_dir']}")
    print(f"   pip install -e .")
    print(f"   pytest")


async def cmd_build(args: argparse.Namespace) -> None:
    """Build a plugin for distribution."""
    plugin_dir = args.dir or "."
    print(f"🔨 Building plugin in {plugin_dir}...")

    # Validate manifest first
    validation = await manifest_validator.find_and_parse(plugin_dir)
    if not validation.valid:
        print(f"❌ Manifest validation failed:")
        for err in validation.errors:
            print(f"   - {err}")
        sys.exit(1)

    manifest = validation.manifest
    print(f"   Plugin: {manifest.name} v{manifest.version}")

    # Run build steps based on language
    package_json = os.path.join(plugin_dir, "package.json")
    pyproject_toml = os.path.join(plugin_dir, "pyproject.toml")
    setup_py = os.path.join(plugin_dir, "setup.py")

    if os.path.isfile(package_json):
        print("   Building with npm...")
        import subprocess
        result = subprocess.run(
            ["npm", "run", "build"],
            cwd=plugin_dir, capture_output=True, text=True, timeout=120,
        )
        if result.returncode != 0:
            print(f"❌ Build failed: {result.stderr[:500]}")
            sys.exit(1)
        print("   npm build complete")

    if os.path.isfile(pyproject_toml) or os.path.isfile(setup_py):
        print("   Building with Python build...")
        import subprocess
        result = subprocess.run(
            [sys.executable, "-m", "build"],
            cwd=plugin_dir, capture_output=True, text=True, timeout=120,
        )
        if result.returncode != 0:
            print(f"❌ Build failed: {result.stderr[:500]}")
            sys.exit(1)
        print("   Python build complete")

    print(f"✅ Build complete for '{manifest.name}'")


async def cmd_test(args: argparse.Namespace) -> None:
    """Run plugin tests."""
    plugin_dir = args.dir or "."
    print(f"🧪 Running tests in {plugin_dir}...")

    import subprocess
    # Try pytest first, then npm test
    tests_run = False

    if os.path.isfile(os.path.join(plugin_dir, "pyproject.toml")) or \
       os.path.isfile(os.path.join(plugin_dir, "setup.py")) or \
       os.path.isfile(os.path.join(plugin_dir, "setup.cfg")):
        print("   Running pytest...")
        result = subprocess.run(
            [sys.executable, "-m", "pytest", "-v"],
            cwd=plugin_dir, capture_output=True, text=True, timeout=300,
        )
        print(result.stdout)
        if result.returncode != 0:
            print(f"❌ Tests failed: {result.stderr[:500]}")
            sys.exit(1)
        tests_run = True

    if os.path.isfile(os.path.join(plugin_dir, "package.json")):
        print("   Running npm test...")
        result = subprocess.run(
            ["npm", "test"],
            cwd=plugin_dir, capture_output=True, text=True, timeout=300,
        )
        print(result.stdout)
        if result.returncode != 0:
            print(f"❌ Tests failed: {result.stderr[:500]}")
            sys.exit(1)
        tests_run = True

    if not tests_run:
        print("❌ No test framework detected (pytest or npm test)")
        sys.exit(1)

    print(f"✅ All tests passed")


async def cmd_validate(args: argparse.Namespace) -> None:
    """Validate a plugin manifest."""
    plugin_dir = args.dir or "."
    print(f"🔍 Validating plugin in {plugin_dir}...")

    validation = await manifest_validator.find_and_parse(plugin_dir)
    if not validation.valid:
        print(f"❌ Manifest validation FAILED:")
        for err in validation.errors:
            print(f"   ✗ {err}")
        sys.exit(1)

    manifest = validation.manifest
    print(f"✅ Manifest valid!")
    print(f"   Name: {manifest.name}")
    print(f"   ID: {manifest.id}")
    print(f"   Version: {manifest.version}")
    print(f"   Category: {manifest.category.value}")
    print(f"   Author: {manifest.author}")

    if validation.warnings:
        print(f"\n⚠️  Warnings:")
        for w in validation.warnings:
            print(f"   {w}")


async def cmd_package(args: argparse.Namespace) -> None:
    """Package a plugin for distribution."""
    plugin_dir = args.dir or "."
    output = args.output or f"{plugin_dir}.v8plugin"

    print(f"📦 Packaging plugin from {plugin_dir}...")

    # Validate first
    validation = await manifest_validator.find_and_parse(plugin_dir)
    if not validation.valid:
        print(f"❌ Validation failed:")
        for err in validation.errors:
            print(f"   - {err}")
        sys.exit(1)

    # Create tar.gz archive
    import tarfile
    import tempfile

    manifest = validation.manifest
    archive_name = f"{manifest.id}-{manifest.version}.v8plugin"

    with tarfile.open(output, "w:gz") as tar:
        tar.add(plugin_dir, arcname=os.path.basename(plugin_dir))

    size = os.path.getsize(output)
    print(f"✅ Packaged: {archive_name} ({size / 1024:.1f} KB)")


async def cmd_sign(args: argparse.Namespace) -> None:
    """Digitally sign a plugin package."""
    filepath = args.file
    if not os.path.isfile(filepath):
        print(f"❌ File not found: {filepath}")
        sys.exit(1)

    print(f"🔐 Signing {filepath}...")

    # Load or generate signing key
    key_file = args.key or os.environ.get("V8_PLUGIN_SIGNING_KEY", "")
    if not key_file:
        print(f"⚠️  No signing key provided. Set V8_PLUGIN_SIGNING_KEY env var.")
        print(f"   Using placeholder signature for development.")
        signature = "DEV_SIGNATURE_PLACEHOLDER"
    else:
        # In production, use cryptography library for RSA signing
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import padding

        with open(key_file, "rb") as f:
            private_key = serialization.load_pem_private_key(f.read(), password=None)

        with open(filepath, "rb") as f:
            data = f.read()

        signature = private_key.sign(
            data,
            padding.PKCS1v15(),
            hashes.SHA256(),
        ).hex()

    # Write signature file
    sig_file = f"{filepath}.sig"
    with open(sig_file, "w") as f:
        f.write(signature)

    print(f"✅ Signed: {sig_file}")
    print(f"   Signature: {signature[:50]}...")


async def cmd_install(args: argparse.Namespace) -> None:
    """Install a plugin from marketplace or GitHub."""
    source = args.source

    if source.startswith("http") or "/" in source:
        # Install from GitHub
        print(f"📥 Installing from GitHub: {source}...")
        result = await github_plugin_integration.install(
            GitHubSource(
                repository=source,
                type=GitHubSourceType.RELEASE,
                ref=args.version or "latest",
            )
        )
    else:
        # Install from marketplace
        print(f"📥 Installing from marketplace: {source}...")
        result = await plugin_marketplace.install(source)

    print(f"{'✅' if result.success else '❌'} Install {'succeeded' if result.success else 'failed'}")
    if hasattr(result, 'plugin_id') and result.plugin_id:
        print(f"   Plugin: {result.plugin_id}")


async def cmd_list(args: argparse.Namespace) -> None:
    """List installed plugins."""
    plugins = lifecycle_manager.get_all_plugins()
    if not plugins:
        print("📭 No plugins installed")
        return

    print(f"📋 Installed Plugins ({len(plugins)}):")
    print(f"   {'ID':<40} {'Version':<12} {'Status':<12} {'Health':<10}")
    print(f"   {'-'*40} {'-'*12} {'-'*12} {'-'*10}")
    for plugin in plugins:
        state = lifecycle_manager.get_state(plugin.plugin_id)
        health = plugin_health_monitor.get_health(plugin.plugin_id)
        print(f"   {plugin.plugin_id:<40} {plugin.plugin_version:<12} "
              f"{state.value if state else 'unknown':<12} "
              f"{health.status.value if health else 'unknown':<10}")


async def cmd_info(args: argparse.Namespace) -> None:
    """Show detailed plugin information."""
    plugin_id = args.id
    plugin = lifecycle_manager.get_plugin(plugin_id)
    if not plugin:
        print(f"❌ Plugin '{plugin_id}' not found")
        sys.exit(1)

    print(f"📄 Plugin: {plugin.plugin_name}")
    print(f"   ID: {plugin.plugin_id}")
    print(f"   Version: {plugin.plugin_version}")
    print(f"   Category: {plugin.manifest.category.value}")
    print(f"   Author: {plugin.manifest.author}")
    print(f"   License: {plugin.manifest.license}")
    print(f"   Description: {plugin.manifest.description}")

    state = lifecycle_manager.get_state(plugin_id)
    print(f"   State: {state.value if state else 'unknown'}")

    health = plugin_health_monitor.get_health(plugin_id)
    if health:
        print(f"   Health: {health.status.value}")
        print(f"   Executions: {health.metrics.total_executions}")
        print(f"   Crash Count: {health.metrics.crash_count}")

    permissions = permission_manager.get_permissions(plugin_id)
    if permissions:
        print(f"\n   Permissions:")
        for p in permissions:
            print(f"      {p.permission:<25} {p.status:<12} "
                  f"{'(required)' if p.required else ''}")


async def cmd_health(args: argparse.Namespace) -> None:
    """Check plugin health."""
    if args.id:
        # Check specific plugin
        health = plugin_health_monitor.get_health(args.id)
        if not health:
            print(f"❌ No health data for '{args.id}'")
            sys.exit(1)
        print(f"🏥 Plugin Health: {health.plugin_id}")
        print(f"   Status: {health.status.value}")
        print(f"   Memory: {health.metrics.memory_usage_mb:.1f} MB")
        print(f"   CPU: {health.metrics.cpu_usage_percent:.1f}%")
        print(f"   Avg Exec Time: {health.metrics.average_execution_time_ms:.0f} ms")
        print(f"   Error Rate: {health.metrics.error_rate:.2%}")
        print(f"   Crash Count: {health.metrics.crash_count}")
    else:
        # Show all health
        stats = plugin_health_monitor.get_stats()
        print(f"🏥 Plugin Health Overview:")
        print(f"   Total: {stats['total']}")
        print(f"   Healthy: {stats['healthy']}")
        print(f"   Degraded: {stats['degraded']}")
        print(f"   Unhealthy: {stats['unhealthy']}")
        print(f"   Broken: {stats['broken']}")
        print(f"   Alerts: {stats['alerts']}")

    alerts = plugin_health_monitor.get_unacknowledged_alerts()
    if alerts:
        print(f"\n⚠️  Unacknowledged Alerts ({len(alerts)}):")
        for a in alerts:
            print(f"   [{a.severity}] {a.message}")


async def cmd_permissions(args: argparse.Namespace) -> None:
    """Manage plugin permissions."""
    if args.action == "list" or not args.action:
        if args.id:
            perms = permission_manager.get_permissions(args.id)
            print(f"🔑 Permissions for '{args.id}':")
            for p in perms:
                print(f"   {p.permission:<30} {p.status:<12} {p.reason}")
        else:
            pending = permission_manager.get_pending()
            print(f"🔑 Pending Permissions:")
            for item in pending:
                print(f"   Plugin: {item['plugin_id']}")
                for p in item['permissions']:
                    print(f"      - {p['permission']}: {p['reason']}")

    elif args.action == "approve":
        if not args.id:
            print("❌ Plugin ID required")
            sys.exit(1)
        if args.permission:
            permission_manager.approve_permission(args.id, args.permission, "cli")
            print(f"✅ Permission '{args.permission}' approved")
        else:
            count = permission_manager.approve_all(args.id, "cli")
            print(f"✅ {count} permission(s) approved")

    elif args.action == "deny":
        if not args.id or not args.permission:
            print("❌ Plugin ID and permission required")
            sys.exit(1)
        permission_manager.deny_permission(args.id, args.permission, "cli")
        print(f"❌ Permission '{args.permission}' denied")


def setup_parser() -> argparse.ArgumentParser:
    """Setup the CLI argument parser."""
    parser = argparse.ArgumentParser(
        prog="v8-plugin",
        description="V8 Neural Exploitation Platform — Plugin CLI",
    )
    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # create
    p = subparsers.add_parser("create", help="Create a new plugin project")
    p.add_argument("name", help="Plugin name")
    p.add_argument("--category", "-c", help="Plugin category")
    p.add_argument("--description", "-d", help="Plugin description")
    p.add_argument("--version", "-v", help="Plugin version")
    p.add_argument("--author", "-a", help="Plugin author")
    p.add_argument("--license", "-l", help="Plugin license")
    p.add_argument("--language", choices=["python", "typescript", "go", "shell"], default="python")
    p.add_argument("--docker", action="store_true", help="Include Dockerfile")
    p.add_argument("--tags", help="Comma-separated tags")
    p.add_argument("--output-dir", "-o", default=".", help="Output directory")

    # build
    p = subparsers.add_parser("build", help="Build a plugin")
    p.add_argument("dir", nargs="?", default=".", help="Plugin directory")

    # test
    p = subparsers.add_parser("test", help="Run plugin tests")
    p.add_argument("dir", nargs="?", default=".", help="Plugin directory")

    # validate
    p = subparsers.add_parser("validate", help="Validate plugin manifest")
    p.add_argument("dir", nargs="?", default=".", help="Plugin directory")

    # package
    p = subparsers.add_parser("package", help="Package plugin for distribution")
    p.add_argument("dir", nargs="?", default=".", help="Plugin directory")
    p.add_argument("--output", "-o", help="Output file path (default: <name>.v8plugin)")

    # sign
    p = subparsers.add_parser("sign", help="Sign a plugin package")
    p.add_argument("file", help="Plugin package file")
    p.add_argument("--key", "-k", help="Private key file path")

    # install
    p = subparsers.add_parser("install", help="Install a plugin")
    p.add_argument("source", help="Plugin ID (marketplace) or GitHub URL")
    p.add_argument("--version", "-v", help="Version to install")

    # list
    subparsers.add_parser("list", help="List installed plugins")

    # info
    p = subparsers.add_parser("info", help="Show plugin details")
    p.add_argument("id", help="Plugin ID")

    # health
    p = subparsers.add_parser("health", help="Check plugin health")
    p.add_argument("id", nargs="?", help="Plugin ID (optional, shows all if omitted)")

    # permissions
    p = subparsers.add_parser("permissions", help="Manage plugin permissions")
    p.add_argument("action", nargs="?", choices=["list", "approve", "deny"], default="list")
    p.add_argument("id", nargs="?", help="Plugin ID")
    p.add_argument("--permission", "-p", help="Specific permission")

    return parser


def main() -> None:
    """Main CLI entry point."""
    parser = setup_parser()
    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        return

    commands = {
        "create": cmd_create,
        "build": cmd_build,
        "test": cmd_test,
        "validate": cmd_validate,
        "package": cmd_package,
        "sign": cmd_sign,
        "install": cmd_install,
        "list": cmd_list,
        "info": cmd_info,
        "health": cmd_health,
        "permissions": cmd_permissions,
    }

    cmd_fn = commands.get(args.command)
    if cmd_fn:
        asyncio.run(cmd_fn(args))
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
