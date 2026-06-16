# V8 Neural Exploitation Platform

منصة متقدمة لإدارة الثغرات الأمنية وتقييم الوضع الأمني — تصميم Cyberpunk/Hacker بأخضر فوسفوري على أسود.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080, proxied at /api)
- `pnpm --filter @workspace/v8-platform run dev` — run the frontend (port 25277, proxied at /)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Default Credentials

- **Admin:** username `admin` / password `admin123` (tier: Hyper_Core)
- **Operator:** username `operator` / password `operator` (tier: Node_X)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, Tailwind CSS, wouter, TanStack Query
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (zod/v4), drizzle-zod
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — source of truth for all API contracts
- `lib/db/src/schema/` — Drizzle ORM table definitions
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/v8-platform/src/` — React frontend (pages, components, i18n)

## Architecture decisions

- Token-based auth stored in localStorage under key `v8_token` — simple base64 encoding for demo
- Proxy enabled/disabled state is in-memory on the API server (not persisted to DB)
- Scan execution is simulated with setTimeout — no real tool execution in this environment
- Vulnerability stats computed at query time from the vulnerabilities table
- Boot loader splash runs on `/` route for ~3 seconds then redirects to `/login`

## Product

- Cyberpunk boot loader splash screen with kernel initialization simulation
- Bilingual Arabic (RTL) / English toggle — Arabic is default
- Login portal with admin authentication
- Dashboard with real-time stats and live terminal log feed
- Scan queue manager with SIGKILL force-stop capability
- Tools inventory panel with GitHub URL installer
- Proxy pool manager with IP verification and geolocation
- Vulnerability findings database with AI-validated badges
- PDF report generator

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- After OpenAPI spec changes, always run `pnpm --filter @workspace/api-spec run codegen` before touching frontend or backend
- The `v8_token` in localStorage must be cleared on logout — the auth route doesn't invalidate server-side
- Scan progress simulation runs via setTimeout in the route handler — works for demo, not for production

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
