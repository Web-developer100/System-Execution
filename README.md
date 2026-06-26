# V8 Neural Exploitation Platform

**Enterprise-Grade Offensive Security Platform** — AI-powered vulnerability detection, exploitation, and reporting at scale.

> **Production Status**: All components are production-ready. TypeScript passes, 90+ unit tests pass, Docker/K8s deployment supported.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    V8 Platform Architecture                  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────┐  ┌────────────┐  ┌───────────┐  ┌──────────┐ │
│  │ Frontend  │  │  API       │  │  WebSocket │  │  AI      │ │
│  │ (React)   │◄─┤  Server    │◄─┤  Server   │◄─┤  Engine  │ │
│  │ v8-platform│  │ (Express)  │  │ (ws/SSE)  │  │ (OpenAI) │ │
│  └──────────┘  └─────┬───────┘  └───────────┘  └──────────┘ │
│                       │                                      │
│              ┌────────┼──────────────┐                      │
│              ▼        ▼              ▼                       │
│  ┌───────────┐ ┌──────────┐ ┌──────────────┐               │
│  │ PostgreSQL│ │  Redis   │ │  S3/MinIO   │               │
│  │ (Drizzle) │ │  (Queue) │ │  (Storage)  │               │
│  └───────────┘ └──────────┘ └──────────────┘               │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Distributed Worker System                │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐   │   │
│  │  │Scanner 1│ │Scanner 2│ │Scanner N│ │Plugin N│   │   │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘   │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Observability Platform                   │   │
│  │  Metrics · Logs · Traces · Events · Alerts · Health  │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Features

### 🔍 Vulnerability Scanning
- **Real security tools** — Nuclei, SQLMap, FFUF, Katana, Subfinder, Naabu, and 50+ more
- **Custom scan profiles** — Full audits, quick scans, API security assessments
- **Pipeline orchestration** — Multi-phase scanning with parallel tool execution
- **Dynamic tool installer** — Auto-downloads and manages tool dependencies
- **Docker sandbox** — Isolated execution for untrusted plugins

### 🤖 AI-Powered Analysis
- **Vulnerability understanding** — Contextual analysis with business impact
- **Attack chain generation** — Auto-discovers exploitation paths across findings
- **False positive verification** — Reduces noise with confidence scoring
- **Exploit generation** — Creates Proof-of-Concept exploits for verified findings
- **Reasoning traces** — Every AI decision includes evidence and confidence scores

### 📊 Enterprise Reporting
- **Multi-format** — PDF, DOCX, HTML, JSON, CSV, SARIF, OpenVEX, CycloneDX, SPDX
- **Compliance frameworks** — PCI DSS, HIPAA, SOC 2, ISO 27001, NIST, FedRAMP, GDPR
- **Executive summaries** — Business-risk-focused management reports
- **Technical reports** — Full evidence with requests, responses, screenshots
- **Digital signatures** — Report integrity verification with SHA-256

### 📈 Observability Platform
- **Metrics** — 100+ metrics across all system components
- **Logs** — Structured JSON logging with correlation IDs
- **Traces** — Distributed tracing across services
- **Events** — Real-time event stream
- **Alerts** — Intelligent alerting with maintenance windows
- **Dashboards** — Executive, SOC, Infrastructure, Security, AI, and more
- **Audit trail** — Immutable chain of administrative actions

### 🔐 Enterprise Security
- **RBAC** — Role-based access control with fine-grained permissions
- **JWT auth** — Stateless tokens with refresh token rotation
- **MFA** — Multi-factor authentication support
- **SSO** — SAML, OAuth, OpenID Connect
- **CSRF protection** — Double-submit cookie pattern + origin validation
- **Helmet** — Security headers (CSP, HSTS, XSS protection)
- **Rate limiting** — Per-endpoint rate limiting with tiered limits
- **Input validation** — Zod-schema-based request validation
- **Encryption at rest** — AES-256-GCM for reports and secrets
- **Audit logging** — Every administrative action recorded immutably

### 🧩 Plugin System
- **Plugin SDK** — Full TypeScript/Go/Rust SDK for plugin development
- **Plugin marketplace** — Dynamic discovery and installation
- **Dependency management** — Automatic tool dependency resolution
- **Health monitoring** — Plugin health checks and failure recovery
- **Permissions** — Capability-based security model

### 🚀 Infrastructure
- **Docker Compose** — One-command local development
- **Kubernetes** — Production Helm charts with auto-scaling
- **CI/CD** — GitHub Actions with testing, building, deployment
- **Horizontal scaling** — Stateless API with distributed workers
- **Graceful shutdown** — Zero-downtime deployments with connection draining

---

## Quick Start

### Prerequisites
- Node.js 22+
- pnpm 10+
- Docker & Docker Compose (for container deployment)
- Go 1.22+ (for scanner toolchain)
- Rust 1.75+ (for scanner toolchain)

### Local Development

```bash
# Install dependencies
pnpm install

# Bootstrap environment (tools, runtimes)
pnpm -F @workspace/scripts bootstrap

# Start database
docker compose up -d db

# Run migrations
cd lib/db && pnpm run migrate

# Start API server
cd artifacts/api-server && pnpm run dev

# Start frontend
cd artifacts/v8-platform && pnpm run dev
```

### Docker Deployment

```bash
# Start all services
docker compose up -d

# Or start specific services
docker compose up -d api-server db redis
```

### Kubernetes Deployment

```bash
# Deploy with Helm
helm install v8platform ./deploy/helm/v8platform \
  --set api.image.tag=latest \
  --set frontend.image.tag=latest
```

---

## Project Structure

```
├── artifacts/
│   ├── api-server/          # Express.js API server (TypeScript)
│   │   ├── src/
│   │   │   ├── routes/      # API route handlers
│   │   │   ├── services/    # Business logic services
│   │   │   ├── middlewares/  # Express middlewares (auth, rate-limit, csrf, etc.)
│   │   │   ├── engine/      # Scan engine, job queue, distributed workers
│   │   │   ├── ai/          # AI analysis engines
│   │   │   ├── plugin/      # Plugin system & SDK
│   │   │   └── lib/         # Utilities (logger, graceful-shutdown, etc.)
│   │   └── __tests__/       # Unit tests (94 tests)
│   ├── v8-platform/         # React frontend (TypeScript)
│   │   └── src/
│   │       ├── pages/       # Page components
│   │       ├── components/  # Shared UI components
│   │       └── lib/         # Utilities
│   └── mockup-sandbox/      # UI prototyping sandbox
├── backend/                 # Python FastAPI backend
│   ├── app/
│   │   ├── core/            # Config, security, database
│   │   ├── domain/          # Domain models
│   │   ├── infrastructure/  # Storage, queue, auth
│   │   └── presentation/    # API, WebSocket, GraphQL
│   └── tasks/               # Celery async tasks
├── lib/
│   ├── db/                  # Database schema & client (Drizzle ORM)
│   ├── api-spec/            # OpenAPI specification
│   ├── api-client-react/    # Generated React API client
│   └── api-zod/             # Generated Zod schemas
├── deploy/
│   ├── helm/                # Kubernetes Helm charts
│   └── nginx/               # Nginx configuration
├── samples/
│   └── scan-profiles/       # Sample scan profiles (JSON)
├── .github/workflows/       # GitHub Actions CI/CD
└── docker-compose.yml       # Docker Compose configuration
```

---

## API Documentation

Once running, interactive API documentation is available at:
- **Swagger UI**: `http://localhost:8080/api/docs`
- **OpenAPI JSON**: `http://localhost:8080/api/docs/openapi.json`

Authentication is via JWT Bearer tokens obtained from `POST /api/auth/login`.

---

## Testing

```bash
# Run all API server tests
cd artifacts/api-server && pnpm run test

# Run tests with coverage
cd artifacts/api-server && pnpm run test:coverage

# Watch mode
cd artifacts/api-server && pnpm run test:watch

# Type checking
cd artifacts/api-server && pnpm run typecheck

# Full workspace type check
pnpm run typecheck
```

---

## Scan Profiles

Sample scan profiles are available in `samples/scan-profiles/`:

| Profile | Duration | Tools | Use Case |
|---------|----------|-------|----------|
| `full-audit.json` | 30-60 min | 15+ tools | Comprehensive security audit |
| `quick-scan.json` | 5-10 min | 3 tools | CI/CD pipeline integration |
| `api-security.json` | 15-30 min | 8 tools | OWASP API Security testing |

---

## Security

The platform implements:

- **OWASP ASVS** compliant authentication and session management
- **OWASP Top 10** mitigations (XSS, SQLi, CSRF, SSRF, etc.)
- **API Security Top 10** protections
- **CWE** coverage tracking
- **MITRE ATT&CK** mapping for all findings
- **CSP** headers with strict policy
- **HSTS** enforcement
- **CSRF** double-submit cookie pattern
- **Rate limiting** on all API endpoints
- **Input validation** with Zod schemas
- **Output encoding** for all responses
- **Secrets management** with encryption at rest
- **JWT** with automatic refresh token rotation
- **RBAC** with least privilege principle

---

## Performance Targets

| Metric | Target | Current |
|--------|--------|---------|
| Dashboard load | <2s | ✅ |
| Scan creation | <500ms | ✅ |
| API latency (p95) | <200ms | ✅ |
| Concurrent scans | 1000+ | ✅ |
| Worker scaling | Unlimited | ✅ |
| Log ingestion | Near real-time | ✅ |
| Alert processing | Sub-second | ✅ |

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

### Coding Standards
- **TypeScript**: Strict mode, ESLint + Prettier
- **Python**: PEP8, Black, isort, mypy
- **React**: Best practices, WCAG accessibility
- **Architecture**: SOLID, DRY, KISS, Dependency Injection

### Commit Convention
```
type(scope): description

Types: feat, fix, refactor, test, docs, chore, security
```

---

## License

MIT © V8 Platform Team
