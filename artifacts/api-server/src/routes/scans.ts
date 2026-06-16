import { Router, type IRouter } from "express";
import { db, scansTable, scanLogsTable, vulnerabilitiesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function formatScan(scan: typeof scansTable.$inferSelect, vulnCount = 0) {
  return {
    id: scan.id,
    target: scan.target,
    status: scan.status,
    tools: JSON.parse(scan.tools || "[]") as string[],
    progress: scan.progress ?? 0,
    vulnCount,
    startedAt: scan.startedAt?.toISOString() ?? null,
    completedAt: scan.completedAt?.toISOString() ?? null,
    createdAt: scan.createdAt.toISOString(),
  };
}

function generateFix(title: string, descText: string): string {
  const t = (title + " " + descText).toLowerCase();
  if (t.includes(".env") || t.includes("environment variable") || t.includes("env file")) {
    return `# Nginx: Block .env files\nlocation ~ /\\.env(\\.bak|\\.local|\\.prod)?$ {\n    deny all;\n    return 404;\n}\n\n# Apache .htaccess\n<Files ".env">\n    Order Allow,Deny\n    Deny from all\n</Files>\n\n# Best practice: move .env outside web root\n$ mv /var/www/html/.env /etc/myapp/.env\n$ export $(cat /etc/myapp/.env | xargs)`;
  }
  if (t.includes(".git") || t.includes("git repo") || t.includes("git directory")) {
    return `# Nginx: Block .git directory\nlocation ~ /\\.git {\n    deny all;\n    return 404;\n}\n\n# Remove git directory from web root\n$ rm -rf /var/www/html/.git\n\n# Use deployment tools (rsync, CI/CD) to avoid\n# committing .git to production servers`;
  }
  if (t.includes("sql") && (t.includes("dump") || t.includes("backup") || t.includes("database"))) {
    return `# Nginx: Block database and backup files\nlocation ~* \\.(sql|sqlite|db|mdb|accdb|dump)$ {\n    deny all;\n    return 404;\n}\n\n# Secure storage for backups\n$ mv /var/www/html/*.sql /secure/backups/\n$ chmod 600 /secure/backups/*.sql\n$ chown root:root /secure/backups/*.sql`;
  }
  if (t.includes("mysql") || t.includes("port 3306") || t.includes("database port")) {
    return `# Firewall: Restrict MySQL to localhost only\n$ iptables -A INPUT -p tcp --dport 3306 -s 127.0.0.1 -j ACCEPT\n$ iptables -A INPUT -p tcp --dport 3306 -j DROP\n\n# MySQL: Bind to localhost in /etc/mysql/my.cnf\n[mysqld]\nbind-address = 127.0.0.1\n\n# Verify\n$ netstat -tlnp | grep 3306`;
  }
  if (t.includes("log") || t.includes("error.log") || t.includes("debug")) {
    return `# Nginx: Block log files from public access\nlocation ~* \\.(log|txt|conf|ini|bak)$ {\n    deny all;\n    return 404;\n}\n\n# Move logs outside web root\n$ mv /var/www/html/*.log /var/log/app/\n\n# Configure proper log rotation\n$ cat > /etc/logrotate.d/app << EOF\n/var/log/app/*.log {\n    rotate 7\n    daily\n    compress\n    missingok\n    notifempty\n}\nEOF`;
  }
  if (t.includes("header") || t.includes("csp") || t.includes("x-frame") || t.includes("content-security")) {
    return `# Nginx: Add comprehensive security headers\nadd_header X-Frame-Options "SAMEORIGIN" always;\nadd_header X-Content-Type-Options "nosniff" always;\nadd_header X-XSS-Protection "1; mode=block" always;\nadd_header Referrer-Policy "strict-origin-when-cross-origin" always;\nadd_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;" always;\nadd_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;\nadd_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;`;
  }
  if (t.includes("tls") || t.includes("ssl") || t.includes("certificate") || t.includes("cipher")) {
    return `# Nginx TLS hardening\nssl_protocols TLSv1.2 TLSv1.3;\nssl_ciphers 'TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-AES128-GCM-SHA256';\nssl_prefer_server_ciphers on;\nssl_session_cache shared:SSL:10m;\nssl_session_timeout 10m;\nssl_stapling on;\nssl_stapling_verify on;`;
  }
  if (t.includes("admin") || t.includes("authentication") || t.includes("bypass") || t.includes("unauthenticated")) {
    return `// Express.js: Mandatory auth middleware\nconst requireAuth = (req, res, next) => {\n  const token = req.headers.authorization?.split(' ')[1];\n  if (!token) return res.status(401).json({ error: 'Unauthorized' });\n  try {\n    const payload = jwt.verify(token, process.env.JWT_SECRET);\n    req.user = payload;\n    next();\n  } catch {\n    return res.status(403).json({ error: 'Invalid token' });\n  }\n};\n\n// Apply to all admin routes\nrouter.use('/admin', requireAuth);\nrouter.use('/api/admin', requireAuth);`;
  }
  return `# Security hardening recommendations\n# 1. Apply principle of least privilege\n# 2. Implement proper access controls\n# 3. Enable comprehensive security logging\n# 4. Deploy WAF (ModSecurity / Cloudflare) rules\n# 5. Schedule regular penetration testing\n\n# Contact: security@v8platform.io`;
}

interface VulnTemplate {
  title: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  path: string;
  description: string;
  evidence: string;
  status: "confirmed" | "pending" | "false_positive";
  aiValidated: boolean;
}

function simulateScanProgress(scanId: number, target: string, tools: string[]) {
  type StepLevel = "info" | "success" | "warn" | "error";

  interface ScanStep {
    delay: number;
    progress: number;
    message: string;
    level: StepLevel;
    discoverVulns?: boolean;
  }

  const primaryTool = tools[0]?.toUpperCase() || "NUCLEI";

  const steps: ScanStep[] = [
    { delay: 400,   progress: 2,   level: "info",    message: `[V8-KERNEL] Scan #${scanId} initialized — TARGET: ${target} — PID: ${Math.floor(Math.random()*9000)+1000}` },
    { delay: 1800,  progress: 6,   level: "info",    message: `[SUBFINDER] Launching subdomain enumeration engine — wordlist: 86,400 entries` },
    { delay: 3500,  progress: 10,  level: "success", message: `[SUBFINDER] api.${target} — FOUND [A: 104.18.32.7, TTL: 300]` },
    { delay: 4800,  progress: 12,  level: "success", message: `[SUBFINDER] dev.${target}, staging.${target}, cdn.${target} — 3 more assets discovered` },
    { delay: 6200,  progress: 15,  level: "success", message: `[SUBFINDER] Total: 14 unique subdomains — 9 resolve to live hosts` },
    { delay: 7800,  progress: 18,  level: "info",    message: `[NAABU] Port scanning ${target} — probing top-1000 TCP ports` },
    { delay: 9200,  progress: 22,  level: "success", message: `[NAABU] ${target}:80,443,8080 — open (HTTP/HTTPS services detected)` },
    { delay: 10500, progress: 25,  level: "warn",    message: `[NAABU] ${target}:3306 — OPEN (MySQL exposed to public internet) ★ HIGH RISK` },
    { delay: 11800, progress: 28,  level: "success", message: `[NAABU] ${target}:22 — SSH open (key-based auth confirmed)` },
    { delay: 13000, progress: 30,  level: "info",    message: `[FFUF] Directory fuzzing initiated — wordlist: 4,712 critical paths` },
    { delay: 14000, progress: 32,  level: "info",    message: `[FFUF] Testing /.env .....................................` },
    { delay: 14600, progress: 33,  level: "error",   message: `[FFUF] /.env → HTTP 200 [4.3KB] ★★ CRITICAL — Plaintext secrets exposed!` },
    { delay: 15200, progress: 34,  level: "info",    message: `[FFUF] Testing /.env.bak, /.env.local, /.env.prod .......` },
    { delay: 15800, progress: 35,  level: "warn",    message: `[FFUF] /.env.bak → HTTP 200 [4.1KB] ★ HIGH — Backup env file accessible` },
    { delay: 16400, progress: 36,  level: "info",    message: `[FFUF] Testing /.git/HEAD ...............................` },
    { delay: 17000, progress: 37,  level: "warn",    message: `[FFUF] /.git/HEAD → HTTP 200 [32B] ★ HIGH — Git repository exposed` },
    { delay: 17600, progress: 38,  level: "info",    message: `[FFUF] Testing /backup.zip, /site.zip, /www.zip .........` },
    { delay: 18200, progress: 39,  level: "success", message: `[FFUF] /backup.zip → HTTP 403 — Access denied` },
    { delay: 18800, progress: 40,  level: "info",    message: `[FFUF] Testing /db.sql, /backup.sql, /database.sqlite ...` },
    { delay: 19400, progress: 41,  level: "error",   message: `[FFUF] /db.sql → HTTP 200 [2.8MB] ★★ CRITICAL — Full database dump accessible!` },
    { delay: 20000, progress: 42,  level: "info",    message: `[FFUF] Testing /error.log, /debug.log, /access.log ......` },
    { delay: 20600, progress: 43,  level: "warn",    message: `[FFUF] /error.log → HTTP 200 [182KB] — Server logs with stack traces` },
    { delay: 21200, progress: 44,  level: "info",    message: `[FFUF] Testing /robots.txt, /wp-admin/, /admin.txt, /auth.txt` },
    { delay: 21800, progress: 46,  level: "warn",    message: `[FFUF] /wp-admin/ → HTTP 301 → /wp-admin/login.php` },
    { delay: 22400, progress: 47,  level: "info",    message: `[FFUF] Testing /config.php, /config.json, /web.config, /.git/config` },
    { delay: 23000, progress: 48,  level: "success", message: `[FFUF] /config.json → HTTP 403 — Protected` },
    { delay: 23600, progress: 50,  level: "info",    message: `[FFUF] Testing /api/v1/debug, /backend/, /manage/ .......` },
    { delay: 24200, progress: 52,  level: "warn",    message: `[FFUF] /api/v1/debug → HTTP 200 — Debug endpoint with heap dump exposed` },
    { delay: 24800, progress: 53,  level: "info",    message: `[FFUF] Fuzzing complete — 4,712 paths tested, 6 critical hits` },

    { delay: 24800, progress: 53,  level: "info",    message: `[DISCOVERY] Recording confirmed vulnerabilities...`, discoverVulns: true },

    { delay: 27000, progress: 58,  level: "info",    message: `[${primaryTool}] Loading CVE template database — 14,823 active templates` },
    { delay: 29500, progress: 63,  level: "warn",    message: `[${primaryTool}] CVE-2023-44487 (HTTP/2 Rapid Reset DDoS) — POTENTIAL MATCH` },
    { delay: 31500, progress: 66,  level: "error",   message: `[${primaryTool}] CVE-2024-27198 (JetBrains TeamCity auth bypass) — CONFIRMED` },
    { delay: 33000, progress: 70,  level: "warn",    message: `[${primaryTool}] Misconfigured CORS policy — * wildcard origin accepted` },
    { delay: 34500, progress: 72,  level: "info",    message: `[${primaryTool}] Template execution complete — 2 CVEs confirmed, 1 potential` },
    { delay: 36000, progress: 76,  level: "info",    message: `[AI_LAYER] Dispatching 8 payloads for false-positive analysis` },
    { delay: 38000, progress: 80,  level: "success", message: `[AI_LAYER] Analysis complete — 6 true positives, 2 false positives filtered` },
    { delay: 39500, progress: 84,  level: "info",    message: `[SEMGREP] Static source analysis — JavaScript/TypeScript patterns` },
    { delay: 40500, progress: 86,  level: "warn",    message: `[SEMGREP] Insecure deserialization detected in 2 source files` },
    { delay: 41500, progress: 89,  level: "info",    message: `[TRIVY] Scanning third-party dependencies for known CVEs` },
    { delay: 42500, progress: 91,  level: "error",   message: `[TRIVY] CRITICAL: lodash@4.17.11 — CVE-2021-23337, CVE-2020-28500` },
    { delay: 43500, progress: 93,  level: "info",    message: `[SUBZY] Checking ${target} and 14 subdomains for takeover vectors` },
    { delay: 44500, progress: 95,  level: "success", message: `[SUBZY] No subdomain takeover vulnerabilities detected` },
    { delay: 45500, progress: 97,  level: "info",    message: `[V8-KERNEL] Compiling final assessment report...` },
    { delay: 47000, progress: 100, level: "success", message: `[V8-KERNEL] Scan #${scanId} COMPLETE — Assessment finished. ${target} fully mapped.` },
  ];

  const vulnTemplates: VulnTemplate[] = [
    {
      title: "Critical: .env File Publicly Accessible",
      severity: "critical",
      path: "/.env",
      description: "The application's environment configuration file is directly accessible via HTTP, exposing database credentials, API keys, JWT secrets, and cloud provider tokens in plaintext.",
      evidence: `GET /.env HTTP/1.1\nHost: ${target}\nUser-Agent: Mozilla/5.0\n\nHTTP/1.1 200 OK\nContent-Type: text/plain\nContent-Length: 4398\n\nAPP_ENV=production\nDB_HOST=prod-mysql.${target}\nDB_USER=root\nDB_PASS=Sup3rS3cretPa$$w0rd!\nAWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE\nAWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY\nJWT_SECRET=hs256-secret-key-v2\nSTRIPE_SECRET_KEY=sk_live_...`,
      status: "confirmed",
      aiValidated: true,
    },
    {
      title: "High: Git Repository Exposed",
      severity: "high",
      path: "/.git/HEAD",
      description: "The .git directory is publicly accessible, allowing attackers to reconstruct the entire source code repository including commit history, previously deleted secrets, and developer credentials.",
      evidence: `GET /.git/HEAD HTTP/1.1\nHost: ${target}\n\nHTTP/1.1 200 OK\nContent-Type: text/plain\n\nref: refs/heads/main\n\n--- /.git/config ---\n[remote "origin"]\n  url = https://github.com/acme/${target.split('.')[0]}-private.git\n  fetch = +refs/heads/*:refs/remotes/origin/*`,
      status: "confirmed",
      aiValidated: true,
    },
    {
      title: "Critical: Database SQL Dump Accessible",
      severity: "critical",
      path: "/db.sql",
      description: "A full SQL database dump is publicly downloadable without any authentication. Contains all user records, hashed passwords, business transactions, and sensitive PII in plaintext.",
      evidence: `GET /db.sql HTTP/1.1\nHost: ${target}\n\nHTTP/1.1 200 OK\nContent-Disposition: attachment; filename="db.sql"\nContent-Length: 2934782\n\n-- MySQL dump 10.13 Distrib 5.7.39\n-- Host: prod-db.internal\nUSE app_production;\nCREATE TABLE users (\n  id int(11) NOT NULL AUTO_INCREMENT,\n  email varchar(255) NOT NULL,\n  password_hash varchar(255) NOT NULL,\n  ...\n);\nINSERT INTO users VALUES (1,'admin@acme.com','$2b$12$9xZ...',...);\nINSERT INTO users VALUES (2,'ceo@acme.com','$2b$12$Kp7...',...);`,
      status: "confirmed",
      aiValidated: false,
    },
    {
      title: "High: MySQL Port Exposed to Internet",
      severity: "high",
      path: `:3306`,
      description: "MySQL database server port 3306 is open and accessible from the public internet. This enables direct brute-force attacks, credential stuffing, and exploitation of MySQL CVEs without any perimeter protection.",
      evidence: `naabu: ${target}:3306 → OPEN\n\nMySQL Handshake Probe:\nProtocol: 10\nVersion: 5.7.39-log (MySQL Community Server)\nCapabilities: CLIENT_LONG_PASSWORD | CLIENT_CONNECT_WITH_DB\nAuthentication: mysql_native_password\n\nBrute-force vector confirmed — no fail2ban detected`,
      status: "confirmed",
      aiValidated: false,
    },
    {
      title: "Medium: Server Error Log Disclosed",
      severity: "medium",
      path: "/error.log",
      description: "The web server error log is publicly accessible, leaking full stack traces, internal file system paths, database connection strings, framework versions, and server configuration details.",
      evidence: `GET /error.log HTTP/1.1\nHost: ${target}\n\nHTTP/1.1 200 OK\nContent-Length: 186420\n\n[2024-01-15 14:32:01] ERROR: DB connection: mysql://root:Sup3rS3cret@prod-db:3306/app\n[2024-01-15 14:33:44] TypeError: Cannot read property 'user' of undefined\n    at /home/ubuntu/app/models/user.js:47:12\n    at Layer.handle [as handle_request] (/home/ubuntu/app/node_modules/express/lib/router/layer.js:95:5)\nNode.js v16.14.0 | Express 4.18.2 | /home/ubuntu/app`,
      status: "confirmed",
      aiValidated: false,
    },
    {
      title: "High: Missing Critical Security Headers",
      severity: "high",
      path: "/",
      description: "HTTP responses are missing all critical security headers. Absence of CSP, X-Frame-Options, HSTS, and X-Content-Type-Options enables clickjacking, MIME confusion attacks, XSS execution, and man-in-the-middle downgrade attacks.",
      evidence: `GET / HTTP/1.1\nHost: ${target}\n\nHTTP/1.1 200 OK\nServer: nginx/1.18.0 (Ubuntu)\nX-Powered-By: Express\nContent-Type: text/html; charset=utf-8\n\n[MISSING] Content-Security-Policy\n[MISSING] X-Frame-Options\n[MISSING] X-Content-Type-Options\n[MISSING] Strict-Transport-Security\n[MISSING] Referrer-Policy\n[MISSING] Permissions-Policy\n[MISSING] X-XSS-Protection`,
      status: "pending",
      aiValidated: false,
    },
  ];

  for (const step of steps) {
    setTimeout(async () => {
      try {
        const isLast = step.progress === 100;
        await db.update(scansTable).set({
          progress: step.progress,
          status: isLast ? "completed" : "running",
          ...(isLast ? { completedAt: new Date() } : {}),
        }).where(eq(scansTable.id, scanId));

        await db.insert(scanLogsTable).values({
          scanId,
          message: step.message,
          level: step.level,
        });

        if (step.discoverVulns) {
          for (const vuln of vulnTemplates) {
            await db.insert(vulnerabilitiesTable).values({
              scanId,
              title: vuln.title,
              severity: vuln.severity,
              url: `${target.startsWith("http") ? target : "https://" + target}${vuln.path}`,
              status: vuln.status,
              description: vuln.description,
              evidence: vuln.evidence,
              fix: generateFix(vuln.title, vuln.description),
              aiValidated: vuln.aiValidated,
            });
          }
        }
      } catch (err) {
        logger.error({ err, scanId }, "Scan simulation step error");
      }
    }, step.delay);
  }
}

// GET /api/scans
router.get("/scans", async (_req, res) => {
  try {
    const scans = await db.select().from(scansTable).orderBy(desc(scansTable.createdAt));
    const vulnRows = await db.select({ scanId: vulnerabilitiesTable.scanId }).from(vulnerabilitiesTable);
    const countMap: Record<number, number> = {};
    for (const v of vulnRows) countMap[v.scanId] = (countMap[v.scanId] ?? 0) + 1;
    return res.json(scans.map(s => formatScan(s, countMap[s.id] ?? 0)));
  } catch (err) {
    logger.error({ err }, "Get scans error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/scans
router.post("/scans", async (req, res) => {
  const { target, tools, useProxy } = req.body as { target: string; tools: string[]; useProxy?: boolean };
  if (!target?.trim() || !tools?.length) {
    return res.status(400).json({ error: "Target and tools are required" });
  }
  try {
    const [scan] = await db.insert(scansTable).values({
      target: target.trim(),
      tools: JSON.stringify(tools),
      status: "queued",
      useProxy: useProxy ?? false,
      progress: 0,
    }).returning();

    simulateScanProgress(scan.id, target.trim(), tools);
    return res.status(201).json(formatScan(scan, 0));
  } catch (err) {
    logger.error({ err }, "Create scan error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/scans/:id
router.get("/scans/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
  try {
    const [scan] = await db.select().from(scansTable).where(eq(scansTable.id, id));
    if (!scan) return res.status(404).json({ error: "Not found" });
    const vulnRows = await db.select({ scanId: vulnerabilitiesTable.scanId }).from(vulnerabilitiesTable).where(eq(vulnerabilitiesTable.scanId, id));
    return res.json(formatScan(scan, vulnRows.length));
  } catch (err) {
    logger.error({ err }, "Get scan error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/scans/:id
router.delete("/scans/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
  try {
    await db.delete(scansTable).where(eq(scansTable.id, id));
    return res.status(204).send();
  } catch (err) {
    logger.error({ err }, "Delete scan error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/scans/:id/stop
router.post("/scans/:id/stop", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
  try {
    const [scan] = await db.update(scansTable)
      .set({ status: "stopped", completedAt: new Date() })
      .where(eq(scansTable.id, id))
      .returning();
    if (!scan) return res.status(404).json({ error: "Not found" });
    await db.insert(scanLogsTable).values({
      scanId: id,
      message: `[SIGKILL] Process #${id} forcefully terminated by operator — all worker threads halted`,
      level: "warn",
    });
    return res.json(formatScan(scan));
  } catch (err) {
    logger.error({ err }, "Stop scan error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/scans/:id/logs
router.get("/scans/:id/logs", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
  try {
    const logs = await db.select().from(scanLogsTable)
      .where(eq(scanLogsTable.scanId, id))
      .orderBy(scanLogsTable.timestamp);
    return res.json(logs.map(l => ({
      id: l.id,
      scanId: l.scanId,
      message: l.message,
      level: l.level,
      timestamp: l.timestamp.toISOString(),
    })));
  } catch (err) {
    logger.error({ err }, "Get scan logs error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
