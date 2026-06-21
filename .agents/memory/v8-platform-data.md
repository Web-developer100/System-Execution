---
name: V8 Platform Data & Architecture
description: Seeded data state, key conventions, and non-obvious quirks for V8 Neural Exploitation Platform
---

## DB Seed State (as of June 2026)
- 25 vulnerabilities: 7 critical, 8 high, 8 medium, 2 low — seeded via `lib/db/src/seed.ts`
- 10 scans (all completed) — seeded in seed.ts
- 27 tools — seeded with `WHERE NOT EXISTS` guard (tools table has NO unique constraint on name)
- 5 proxies, 5 reports, 2 users (admin + analyst)
- 177 wordlist entries

## Schedules
- Stored in-memory (Map) in `artifacts/api-server/src/routes/scheduling.ts`
- `seedDefaultSchedules()` called before `startScheduleChecker()` at boot — adds 4 schedules (3 active)
- Schedules reset on backend restart (in-memory, not persisted)

## Vulnerability Enrichment
- `enrichVuln()` in `artifacts/api-server/src/routes/vulnerabilities.ts`
- Adds CVSS score, CWE, CVE, OWASP, MITRE via keyword matching — computed at API response time (no DB changes)

## Tool Categories
- `inferCategory()` in `artifacts/api-server/src/routes/tools.ts`
- Returns category from DB column if set; otherwise infers from tool name via `TOOL_CATEGORY_MAP`
- `formatTool()` now includes: category, author, license fields

## Reports
- `formatReport()` in `artifacts/api-server/src/routes/reports.ts`
- Maps report IDs 1-5 to hardcoded titles/types (executive, technical, compliance, etc.)

## Key Quirks
- `scans.tools` stored as TEXT JSON string (not array) — parse with JSON.parse
- `scan_type` column does NOT exist in scans table
- Workflow "artifacts/api-server: API Server" always fails (port 8080 conflict with "Start Backend") — normal, ignore it
- Vite proxy: `/api` → `http://localhost:8080`
- `authFetch` at `artifacts/v8-platform/src/lib/auth-fetch.ts`
