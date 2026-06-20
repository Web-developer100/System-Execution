import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";
import { EventEmitter } from "node:events";
import { createHash } from "node:crypto";
import * as schema from "./schema";

let db: ReturnType<typeof drizzle>;
let pool: Pool | null = null;

if (process.env.DATABASE_URL) {
  const { Pool } = await import("pg");
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  db = drizzle(pool as any, { schema });
} else {
  // ── Development mode: pg-mem (in-memory PostgreSQL) ───────────────────
  // pg-mem does NOT support $1-style parameterized queries through its
  // public.query() method. We inline parameters into SQL before execution.
  console.warn("[DB] DATABASE_URL not set — using pg-mem in-memory PostgreSQL.");
  console.warn("[DB] Data will not persist between restarts.");

  try {
    const { newDb } = await import("pg-mem");
    const memDb = newDb();

    function escapePgString(s: string): string {
      return s.replace(/'/g, "''");
    }

    function formatValue(value: unknown): string {
      if (value === null || value === undefined) return "NULL";
      if (typeof value === "boolean") return value ? "true" : "false";
      if (typeof value === "number") return String(value);
      if (value instanceof Date) return `'${value.toISOString().replace(/T/, " ").replace(/\.\d{3}Z$/, "")}'`;
      if (Array.isArray(value)) return `'${escapePgString(JSON.stringify(value))}'`;
      if (typeof value === "object") return `'${escapePgString(JSON.stringify(value))}'`;
      return `'${escapePgString(String(value))}'`;
    }

    // Substitute $1, $2 params into SQL. pg-mem's query() doesn't support
    // parameterized queries directly, but works perfectly with inlined values.
    function substituteParams(sql: string, values?: any[]): string {
      if (!values || values.length === 0) return sql;
      let result = sql;
      // Iterate REVERSE so $10 is replaced before $1 (prevents $10 corruption)
      for (let i = values.length - 1; i >= 0; i--) {
        const regex = new RegExp(`\\$${i + 1}\\b`, "g");
        result = result.replace(regex, formatValue(values[i]));
      }
      return result;
    }

    // ── Create all tables ───────────────────────────────────────────────
    const ddl = `
      CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'operator', tier TEXT NOT NULL DEFAULT 'Node_01', created_at TIMESTAMP DEFAULT NOW() NOT NULL);
      CREATE TABLE IF NOT EXISTS organizations (id SERIAL PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, description TEXT, tier TEXT NOT NULL DEFAULT 'free', max_projects INTEGER DEFAULT 5, max_members INTEGER DEFAULT 10, features JSONB DEFAULT '{}', is_active BOOLEAN DEFAULT true, stripe_customer_id TEXT, stripe_subscription_id TEXT, created_at TIMESTAMP DEFAULT NOW() NOT NULL, updated_at TIMESTAMP DEFAULT NOW() NOT NULL);
      CREATE TABLE IF NOT EXISTS projects (id SERIAL PRIMARY KEY, organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, name TEXT NOT NULL, description TEXT, risk_score INTEGER DEFAULT 0, color TEXT DEFAULT '#22d3ee', is_archived BOOLEAN DEFAULT false, created_at TIMESTAMP DEFAULT NOW() NOT NULL, updated_at TIMESTAMP DEFAULT NOW() NOT NULL);
      CREATE TABLE IF NOT EXISTS teams (id SERIAL PRIMARY KEY, organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, name TEXT NOT NULL, description TEXT, created_at TIMESTAMP DEFAULT NOW() NOT NULL);
      CREATE TABLE IF NOT EXISTS members (id SERIAL PRIMARY KEY, organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL, role TEXT NOT NULL DEFAULT 'member', permissions JSONB DEFAULT '[]', is_active BOOLEAN DEFAULT true, last_active_at TIMESTAMP, joined_at TIMESTAMP DEFAULT NOW() NOT NULL);
      CREATE TABLE IF NOT EXISTS scans (id SERIAL PRIMARY KEY, target TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued', tools TEXT NOT NULL DEFAULT '[]', progress INTEGER DEFAULT 0, use_proxy BOOLEAN DEFAULT false, started_at TIMESTAMP, completed_at TIMESTAMP, created_at TIMESTAMP DEFAULT NOW() NOT NULL);
      CREATE TABLE IF NOT EXISTS scan_logs (id SERIAL PRIMARY KEY, scan_id INTEGER NOT NULL, message TEXT NOT NULL, level TEXT NOT NULL DEFAULT 'info', timestamp TIMESTAMP DEFAULT NOW() NOT NULL);
      CREATE TABLE IF NOT EXISTS tools (id SERIAL PRIMARY KEY, name TEXT NOT NULL, description TEXT, github_url TEXT, status TEXT NOT NULL DEFAULT 'active', version TEXT, language TEXT, category TEXT, capabilities TEXT, author TEXT, license TEXT, topics TEXT, docker_image TEXT, install_commands TEXT, build_commands TEXT, run_command TEXT, sandbox_profile TEXT, local_path TEXT, default_branch TEXT, installed_commit TEXT, latest_commit TEXT, repo_created_at TIMESTAMP, repo_updated_at TIMESTAMP, install_log TEXT, install_started_at TIMESTAMP, install_completed_at TIMESTAMP, last_update_message TEXT, last_checked TIMESTAMP, health_score INTEGER DEFAULT 100, created_at TIMESTAMP DEFAULT NOW() NOT NULL);
      CREATE TABLE IF NOT EXISTS proxies (id SERIAL PRIMARY KEY, ip TEXT NOT NULL, port INTEGER NOT NULL, protocol TEXT NOT NULL DEFAULT 'http', username TEXT, password TEXT, status TEXT NOT NULL DEFAULT 'active', latency INTEGER, country TEXT, isp TEXT, health_score INTEGER DEFAULT 100, created_at TIMESTAMP DEFAULT NOW() NOT NULL);
      CREATE TABLE IF NOT EXISTS vulnerabilities (id SERIAL PRIMARY KEY, scan_id INTEGER NOT NULL, title TEXT NOT NULL, severity TEXT NOT NULL DEFAULT 'info', url TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', description TEXT, evidence TEXT, fix TEXT, ai_validated BOOLEAN DEFAULT false, discovered_at TIMESTAMP DEFAULT NOW() NOT NULL);
      CREATE TABLE IF NOT EXISTS reports (id SERIAL PRIMARY KEY, scan_id INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'generating', download_url TEXT, created_at TIMESTAMP DEFAULT NOW() NOT NULL);
      CREATE TABLE IF NOT EXISTS audit_logs (id SERIAL PRIMARY KEY, user_id INTEGER, username TEXT, method TEXT NOT NULL, path TEXT NOT NULL, status_code INTEGER NOT NULL, action TEXT NOT NULL, ip TEXT, user_agent TEXT, duration_ms INTEGER, metadata TEXT, created_at TIMESTAMP DEFAULT NOW() NOT NULL);
      CREATE TABLE IF NOT EXISTS ai_analyses (id SERIAL PRIMARY KEY, vulnerability_id INTEGER NOT NULL, scan_id INTEGER NOT NULL, classification TEXT NOT NULL DEFAULT 'needs_verification', confidence INTEGER NOT NULL DEFAULT 0, cvss_version TEXT DEFAULT '4.0', cvss_score TEXT, cvss_vector TEXT, cvss_severity TEXT, epss_probability TEXT, cwe_ids JSONB DEFAULT '[]', capec_ids JSONB DEFAULT '[]', mitre_technique_ids JSONB DEFAULT '[]', mitre_tactic_ids JSONB DEFAULT '[]', root_cause TEXT, attack_vector TEXT, exploitability_level TEXT, real_world_impact TEXT, business_impact TEXT, attack_complexity TEXT, preconditions TEXT, exploit_probability INTEGER, remediation_summary TEXT, remediation_code_patch TEXT, remediation_language TEXT, remediation_config TEXT, remediation_waf_rule TEXT, remediation_before_code TEXT, remediation_after_code TEXT, attack_chain_id INTEGER, attack_chain_step INTEGER, verification_status TEXT DEFAULT 'unverified', verification_method TEXT, poc_request TEXT, poc_response TEXT, cross_tool_validated BOOLEAN DEFAULT false, cross_tool_count INTEGER DEFAULT 0, correlated_tool_count INTEGER DEFAULT 0, correlated_tool_names JSONB DEFAULT '[]', analysis_provider TEXT DEFAULT 'ai-engine', analysis_duration_ms INTEGER, is_learning_feedback BOOLEAN DEFAULT false, created_at TIMESTAMP DEFAULT NOW() NOT NULL, updated_at TIMESTAMP DEFAULT NOW() NOT NULL);
      CREATE TABLE IF NOT EXISTS attack_chains (id SERIAL PRIMARY KEY, scan_id INTEGER NOT NULL, name TEXT NOT NULL, description TEXT, chain_type TEXT NOT NULL, risk_score INTEGER DEFAULT 0, entry_vulnerability TEXT NOT NULL, entry_vulnerability_id INTEGER, exit_vulnerability TEXT, exit_vulnerability_id INTEGER, steps JSONB DEFAULT '[]', visualization_data JSONB, total_steps INTEGER DEFAULT 0, attack_complexity TEXT DEFAULT 'medium', prerequisites JSONB DEFAULT '[]', mitigations JSONB DEFAULT '[]', status TEXT DEFAULT 'detected', created_at TIMESTAMP DEFAULT NOW() NOT NULL);
      CREATE TABLE IF NOT EXISTS pipeline_stages (id SERIAL PRIMARY KEY, scan_id INTEGER NOT NULL, stage_number INTEGER NOT NULL, stage_name TEXT NOT NULL, phase INTEGER DEFAULT 0, status TEXT NOT NULL DEFAULT 'pending', started_at TIMESTAMP, completed_at TIMESTAMP, duration_ms INTEGER, tools_executed JSONB DEFAULT '[]', findings_count INTEGER DEFAULT 0, tools_count INTEGER DEFAULT 0, error TEXT, retry_count INTEGER DEFAULT 0, is_fallback BOOLEAN DEFAULT false, created_at TIMESTAMP DEFAULT NOW() NOT NULL);
      CREATE TABLE IF NOT EXISTS verification_results (id SERIAL PRIMARY KEY, vulnerability_id INTEGER NOT NULL, scan_id INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', confidence INTEGER DEFAULT 0, retest_performed BOOLEAN DEFAULT false, retest_payloads JSONB DEFAULT '[]', retest_request TEXT, retest_response TEXT, retest_status_code INTEGER, retest_duration_ms INTEGER, retest_method TEXT, cross_tool_performed BOOLEAN DEFAULT false, cross_tool_results JSONB DEFAULT '[]', cross_tool_confirmed BOOLEAN DEFAULT false, cross_tool_count INTEGER DEFAULT 0, poc_generated BOOLEAN DEFAULT false, poc_payload TEXT, poc_request TEXT, poc_response TEXT, poc_minimal_exploit TEXT, poc_safe_validation_steps JSONB DEFAULT '[]', poc_reproducible BOOLEAN DEFAULT false, final_decision TEXT, decision_rationale TEXT, verified_by TEXT DEFAULT 'ai-engine', total_verification_duration_ms INTEGER, created_at TIMESTAMP DEFAULT NOW() NOT NULL, updated_at TIMESTAMP DEFAULT NOW() NOT NULL)
    `;

    const stmts = ddl.split(";").map(s => s.trim()).filter(s => s.length > 0 && !s.startsWith("--"));
    for (const stmt of stmts) {
      try {
        memDb.public.none(stmt + ";");
      } catch (err: any) {
        // "already exists" is expected on re-init; other errors are bugs
        if (err?.message?.includes("already exists")) continue;
        console.warn("[DB] DDL warning:", err?.message ?? String(err));
      }
    }

    // ── Seed admin user ─────────────────────────────────────────────────
    const userRow = memDb.public.one("SELECT COUNT(*) as cnt FROM users");
    if (Number(userRow?.cnt ?? 0) === 0) {
      const pwdHash = createHash("sha256").update("Admin@123").digest("hex");
      const insertSql = `INSERT INTO users (username, password_hash, role, tier) VALUES ('admin', '${pwdHash}', 'super_admin', 'Enterprise')`;
      memDb.public.none(insertSql);

      // Verify immediately after INSERT
      const verifyRow = memDb.public.one("SELECT id, username, password_hash FROM users WHERE username = 'admin'");
      const hashLen = verifyRow?.password_hash ? String(verifyRow.password_hash).length : 0;
      if (hashLen > 0) {
        console.log(`[DB] Verified admin user: password_hash length = ${hashLen}`);
      } else {
        throw new Error("[DB] CRITICAL: admin user password_hash is EMPTY after seed INSERT. Login will never succeed. Check table schema and INSERT statement.");
      }
      console.log('[DB] Seeded default admin user: admin / Admin@123');
    }

    // ── Seed organization ───────────────────────────────────────────────
    const orgRow = memDb.public.one("SELECT COUNT(*) as cnt FROM organizations");
    if (Number(orgRow?.cnt ?? 0) === 0) {
      memDb.public.none("INSERT INTO organizations (name, slug, description, tier) VALUES ('Default Organization', 'default', 'Auto-created development organization', 'enterprise')");
      memDb.public.none("INSERT INTO members (organization_id, user_id, role, is_active) VALUES (1, 1, 'owner', true)");
      console.log("[DB] Seeded default organization with admin as owner");
    }

    // ── Pool wrapper ─────────────────────────────────────────────────────
    const memPool = Object.assign(new EventEmitter(), {
      totalCount: 0, idleCount: 0, waitingCount: 0,

      query: (textOrConfig: string | { text: string; values?: any[]; name?: string }, params?: any[], callback?: any): Promise<any> => {
        try {
          const sql = typeof textOrConfig === "string" ? textOrConfig : textOrConfig.text;
          const values = typeof textOrConfig === "string" ? (params ?? []) : (textOrConfig.values ?? params ?? []);
          const substitutedSql = substituteParams(sql, values);
          const result = memDb.public.query(substitutedSql);
          const rawRows = result.rows ?? [];
          const fields = ((result.fields ?? []) as any[]).map((f: any) => ({
            name: f.name ?? "", tableID: 0, columnID: 0,
            dataTypeID: f.dataTypeID ?? 25, dataTypeSize: -1,
            dataTypeModifier: -1, format: "text" as const,
          }));

          // pg-mem returns rows as plain objects {col: val} but the real pg
          // library returns rows that are ALSO array-like (indexable by position).
          // Drizzle-orm iterates rows by INDEX, not by key name, so we need
          // to convert plain objects to array-like objects.
          const rows: any[] = [];
          for (const rawRow of rawRows) {
            const row: any = [];
            for (let i = 0; i < fields.length; i++) {
              const colName = fields[i].name;
              row[i] = rawRow[colName] ?? null;
              row[colName] = rawRow[colName] ?? null;
            }
            rows.push(row);
          }

          const queryResult = {
            rows: rows as QueryResultRow[],
            fields,
            rowCount: result.rowCount ?? rawRows.length ?? 0,
            command: result.command ?? "", oid: 0,
          } satisfies QueryResult;

          if (callback) callback(null, queryResult);
          return Promise.resolve(queryResult);
        } catch (err) {
          if (callback) callback(err);
          return Promise.reject(err);
        }
      },

      connect: () => {
        const client = {
          query: (textOrConfig: any, params?: any[], callback?: any) => memPool.query(textOrConfig, params, callback),
          release: () => {}, on: () => client, off: () => client,
        };
        return Promise.resolve(client as any as PoolClient);
      },

      end: () => Promise.resolve(),
    });

    Object.setPrototypeOf(memPool, EventEmitter.prototype);
    pool = memPool as any as Pool;
    db = drizzle(pool, { schema });
  } catch (err) {
    console.error("[DB] Failed to initialize pg-mem:", err);
    throw err;
  }
}

export { db, pool };
export * from "./schema";
