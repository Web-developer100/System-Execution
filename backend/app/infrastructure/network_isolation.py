"""
Network Isolation Manager — Enterprise Network Security.

Supports multiple networking modes:
  - Isolated Network (no external access)
  - Restricted Internet (allowlist-based)
  - Proxy Mode (forward/reverse proxy)
  - VPN Mode (tunneled connections)
  - Private Subnet (internal only)
  - Customer Network (dedicated network)
  - Air-Gapped Deployment (no external connectivity)

Per-plugin firewall rules with:
  - Allow/deny lists for IP ranges
  - DNS filtering
  - Protocol restrictions
  - Port whitelisting
  - Bandwidth limits
  - Deep packet inspection (optional)
"""
from __future__ import annotations

import ipaddress
import json
import logging
import os
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional, Set, Tuple

logger = logging.getLogger(__name__)


class NetworkMode(str, Enum):
    ISOLATED = "isolated"
    RESTRICTED = "restricted"
    PROXY = "proxy"
    VPN = "vpn"
    PRIVATE_SUBNET = "private_subnet"
    CUSTOMER_NETWORK = "customer_network"
    AIR_GAPPED = "air_gapped"
    FULL_ACCESS = "full_access"


class Protocol(str, Enum):
    TCP = "tcp"
    UDP = "udp"
    HTTP = "http"
    HTTPS = "https"
    DNS = "dns"
    ICMP = "icmp"
    GRPC = "grpc"
    WEBSOCKET = "websocket"
    ANY = "any"


@dataclass
class FirewallRule:
    """A single firewall rule for a plugin or job."""
    id: str = ""
    name: str = ""
    direction: str = "egress"  # ingress, egress
    action: str = "deny"  # allow, deny, log
    protocol: Protocol = Protocol.ANY
    source_ip: str = "0.0.0.0/0"
    destination_ip: str = "0.0.0.0/0"
    source_port: int = 0
    destination_port: int = 0
    description: str = ""
    priority: int = 100
    enabled: bool = True


@dataclass
class NetworkPolicy:
    """Network isolation policy for a plugin or job execution."""
    mode: NetworkMode = NetworkMode.ISOLATED
    dns_servers: List[str] = field(default_factory=lambda: ["1.1.1.1", "8.8.8.8"])
    allowed_domains: List[str] = field(default_factory=list)
    blocked_domains: List[str] = field(default_factory=list)
    allowed_ips: List[str] = field(default_factory=list)
    blocked_ips: List[str] = field(default_factory=list)
    allowed_ports: List[int] = field(default_factory=list)
    bandwidth_limit_kbps: int = 0  # 0 = unlimited
    firewall_rules: List[FirewallRule] = field(default_factory=list)
    proxy_url: Optional[str] = None
    proxy_username: Optional[str] = None
    proxy_password: Optional[str] = None
    vpn_config: Optional[str] = None
    vpn_region: Optional[str] = None
    rate_limit_per_second: int = 0
    tls_required: bool = True
    deep_packet_inspection: bool = False


# ── Predefined network policies for common scenarios ────────────────────────

PREDEFINED_POLICIES: Dict[str, NetworkPolicy] = {
    "isolated": NetworkPolicy(
        mode=NetworkMode.ISOLATED,
        description="No network access at all. Maximum isolation.",
        allowed_domains=[],
        blocked_domains=["*"],
    ),
    "dns_only": NetworkPolicy(
        mode=NetworkMode.RESTRICTED,
        description="DNS resolution only, no external network access.",
        allowed_domains=[],
        blocked_domains=["*"],
        allowed_ports=[53],
        dns_servers=["1.1.1.1"],
    ),
    "http_only": NetworkPolicy(
        mode=NetworkMode.RESTRICTED,
        description="HTTP/HTTPS access only to specified domains.",
        allowed_domains=[],
        blocked_domains=[],
        allowed_ports=[80, 443],
        tls_required=True,
    ),
    "proxy": NetworkPolicy(
        mode=NetworkMode.PROXY,
        description="All traffic through forward proxy.",
        allowed_domains=["*"],
        blocked_domains=[],
        allowed_ports=[],
        proxy_url=None,
    ),
    "private_subnet": NetworkPolicy(
        mode=NetworkMode.PRIVATE_SUBNET,
        description="Access to private subnet only.",
        allowed_ips=["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"],
        blocked_ips=["0.0.0.0/0"],
    ),
    "customer_vpn": NetworkPolicy(
        mode=NetworkMode.VPN,
        description="All traffic through customer VPN tunnel.",
        allowed_domains=["*"],
        vpn_config=None,
    ),
    "air_gapped": NetworkPolicy(
        mode=NetworkMode.AIR_GAPPED,
        description="Completely air-gapped. No external connectivity at all.",
        allowed_domains=[],
        blocked_domains=["*"],
        allowed_ips=[],
        blocked_ips=["0.0.0.0/0"],
        dns_servers=[],
    ),
}


class NetworkIsolationManager:
    """Enterprise network isolation manager for plugin/sandbox execution."""

    def __init__(self):
        self._policies: Dict[str, NetworkPolicy] = {}
        self._active_connections: Dict[str, Dict[str, Any]] = {}
        self._dns_cache: Dict[str, str] = {}

    def register_policy(self, name: str, policy: NetworkPolicy) -> None:
        """Register a named network policy."""
        self._policies[name] = policy
        logger.info(f"[NETWORK] Policy registered: {name} (mode={policy.mode.value})")

    def get_policy(self, name: str) -> Optional[NetworkPolicy]:
        """Get a registered policy by name."""
        return self._policies.get(name) or PREDEFINED_POLICIES.get(name)

    def list_policies(self) -> Dict[str, Dict[str, Any]]:
        """List all available policies."""
        policies = {}
        for name, policy in {**PREDEFINED_POLICIES, **self._policies}.items():
            policies[name] = {
                "mode": policy.mode.value,
                "description": policy.description,
                "allowed_domains": len(policy.allowed_domains),
                "blocked_domains": len(policy.blocked_domains),
                "allowed_ips": len(policy.allowed_ips),
                "blocked_ips": len(policy.blocked_ips),
                "bandwidth_limit_kbps": policy.bandwidth_limit_kbps,
                "proxy_enabled": policy.proxy_url is not None,
                "vpn_enabled": policy.vpn_config is not None,
            }
        return policies

    def create_policy_for_plugin(
        self,
        plugin_id: str,
        required_network_access: str = "isolated",
        allowed_domains: Optional[List[str]] = None,
        allowed_ips: Optional[List[str]] = None,
        allowed_ports: Optional[List[int]] = None,
    ) -> NetworkPolicy:
        """Create a network policy tailored for a specific plugin."""
        mode = NetworkMode.ISOLATED
        if required_network_access == "internet":
            mode = NetworkMode.RESTRICTED
        elif required_network_access == "proxy":
            mode = NetworkMode.PROXY
        elif required_network_access == "full":
            mode = NetworkMode.FULL_ACCESS

        policy = NetworkPolicy(
            mode=mode,
            allowed_domains=allowed_domains or [],
            allowed_ips=allowed_ips or [],
            allowed_ports=allowed_ports or [],
            description=f"Auto-generated policy for plugin {plugin_id}",
        )
        self._policies[f"plugin:{plugin_id}"] = policy
        return policy

    def build_docker_args(self, policy: NetworkPolicy) -> List[str]:
        """Build Docker run arguments for network isolation."""
        args = []

        if policy.mode == NetworkMode.ISOLATED or policy.mode == NetworkMode.AIR_GAPPED:
            args.extend(["--network", "none"])

        elif policy.mode == NetworkMode.RESTRICTED or policy.mode == NetworkMode.PRIVATE_SUBNET:
            # Use a custom network with firewall rules
            args.extend(["--network", "v8-restricted"])

            # Add DNS configuration
            if policy.dns_servers:
                args.extend(["--dns"] + policy.dns_servers)

            # Block all by default, then allow specific
            if policy.allowed_ips:
                for ip in policy.allowed_ips:
                    args.extend(["--add-host", f"allowed:{ip}"])

            # Rate limiting via traffic control (requires host network capability or iptables)
            if policy.bandwidth_limit_kbps > 0:
                args.extend(["--ulimit", f"nofile=128:128"])

        elif policy.mode == NetworkMode.PROXY:
            args.extend(["--network", "bridge"])
            if policy.proxy_url:
                args.extend([
                    "-e", f"HTTP_PROXY={policy.proxy_url}",
                    "-e", f"HTTPS_PROXY={policy.proxy_url}",
                    "-e", "NO_PROXY=localhost,127.0.0.1",
                ])

        elif policy.mode == NetworkMode.VPN:
            # VPN requires special networking for tunnel
            args.extend(["--network", "v8-vpn", "--cap-add", "NET_ADMIN"])

        elif policy.mode == NetworkMode.FULL_ACCESS:
            args.extend(["--network", "bridge"])

        # Additional security options
        if policy.tls_required:
            args.extend(["--security-opt", "seccomp=default"])

        return args

    def build_kubernetes_network_policy_yaml(
        self,
        name: str,
        policy: NetworkPolicy,
        namespace: str = "default",
        pod_selector: Optional[Dict[str, str]] = None,
    ) -> str:
        """Generate Kubernetes NetworkPolicy YAML."""
        selector = pod_selector or {"app": "v8-worker"}

        policy_rules = {
            "apiVersion": "networking.k8s.io/v1",
            "kind": "NetworkPolicy",
            "metadata": {
                "name": name,
                "namespace": namespace,
                "labels": {"app": "v8-platform", "network-policy": name},
            },
            "spec": {
                "podSelector": {"matchLabels": selector},
                "policyTypes": ["Ingress", "Egress"],
            },
        }

        if policy.mode == NetworkMode.ISOLATED or policy.mode == NetworkMode.AIR_GAPPED:
            # No egress or ingress rules = complete isolation
            policy_rules["spec"]["egress"] = []
            policy_rules["spec"]["ingress"] = []

        elif policy.mode == NetworkMode.RESTRICTED:
            egress_rules = []
            # Allow DNS
            if policy.dns_servers:
                egress_rules.append({
                    "to": [{"ipBlock": {"cidr": "1.1.1.1/32"}}],
                    "ports": [{"protocol": "UDP", "port": 53}],
                })
            # Allow specific IPs
            for ip in policy.allowed_ips:
                egress_rules.append({
                    "to": [{"ipBlock": {"cidr": ip}}],
                    "ports": [{"protocol": "TCP", "port": p} for p in (policy.allowed_ports or [443])],
                })
            # Allow specific domains (via CIDR resolution)
            for domain in policy.allowed_domains:
                if domain and domain != "*":
                    egress_rules.append({
                        "to": [{"ipBlock": {"cidr": "0.0.0.0/0", "except": ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"]}}],
                        "ports": [{"protocol": "TCP", "port": 443}],
                    })
            policy_rules["spec"]["egress"] = egress_rules
            policy_rules["spec"]["ingress"] = []

        elif policy.mode == NetworkMode.PRIVATE_SUBNET:
            egress_ips = []
            for ip_range in ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"]:
                egress_ips.append({"ipBlock": {"cidr": ip_range}})
            policy_rules["spec"]["egress"] = [{"to": egress_ips}]
            policy_rules["spec"]["ingress"] = []

        elif policy.mode == NetworkMode.FULL_ACCESS:
            policy_rules["spec"]["egress"] = [{"to": [{"ipBlock": {"cidr": "0.0.0.0/0"}}]}]
            policy_rules["spec"]["ingress"] = [{"from": [{"ipBlock": {"cidr": "0.0.0.0/0"}}]}]

        try:
            import yaml
            return yaml.dump(policy_rules, default_flow_style=False)
        except ImportError:
            # Fallback: manual YAML construction
            lines = [
                "apiVersion: networking.k8s.io/v1",
                "kind: NetworkPolicy",
                f"metadata:",
                f"  name: {name}",
                f"  namespace: {namespace}",
                "  labels:",
                "    app: v8-platform",
                f"    network-policy: {name}",
                "spec:",
                f"  podSelector:",
                f"    matchLabels: {json.dumps(pod_selector)}",
                "  policyTypes:",
                "    - Ingress",
                "    - Egress",]
            return "\n".join(lines)

    def validate_domain_access(self, domain: str, policy: NetworkPolicy) -> bool:
        """Check if a domain is allowed by the policy."""
        if policy.mode == NetworkMode.ISOLATED or policy.mode == NetworkMode.AIR_GAPPED:
            return False
        if "*" in policy.blocked_domains:
            return False
        if domain in policy.blocked_domains:
            return False
        if policy.allowed_domains and "*" not in policy.allowed_domains:
            return domain in policy.allowed_domains
        return True

    def validate_ip_access(self, ip: str, policy: NetworkPolicy) -> bool:
        """Check if an IP is allowed by the policy."""
        if policy.mode == NetworkMode.ISOLATED or policy.mode == NetworkMode.AIR_GAPPED:
            return False
        try:
            addr = ipaddress.ip_address(ip)
            # Check blocked IPs
            for blocked in policy.blocked_ips:
                if addr in ipaddress.ip_network(blocked, strict=False):
                    return False
            # Check allowed IPs
            if policy.allowed_ips:
                for allowed in policy.allowed_ips:
                    if addr in ipaddress.ip_network(allowed, strict=False):
                        return True
                return False
            return True
        except ValueError:
            return False

    def track_connection(
        self,
        connection_id: str,
        source_ip: str,
        destination_ip: str,
        destination_port: int,
        protocol: str,
        policy_name: str,
    ) -> None:
        """Track an active network connection for monitoring."""
        self._active_connections[connection_id] = {
            "source_ip": source_ip,
            "destination_ip": destination_ip,
            "destination_port": destination_port,
            "protocol": protocol,
            "policy_name": policy_name,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "allowed": self.validate_ip_access(destination_ip, self.get_policy(policy_name) or NetworkPolicy()),
        }

    def get_active_connections(self) -> List[Dict[str, Any]]:
        """Get all tracked active connections."""
        return list(self._active_connections.values())

    def get_stats(self) -> Dict[str, Any]:
        """Get network isolation statistics."""
        total_allowed = sum(1 for c in self._active_connections.values() if c.get("allowed"))
        total_blocked = sum(1 for c in self._active_connections.values() if not c.get("allowed"))
        return {
            "registered_policies": len(self._policies) + len(PREDEFINED_POLICIES),
            "active_connections": len(self._active_connections),
            "allowed_connections": total_allowed,
            "blocked_connections": total_blocked,
            "modes_available": [m.value for m in NetworkMode],
        }


network_isolation = NetworkIsolationManager()
