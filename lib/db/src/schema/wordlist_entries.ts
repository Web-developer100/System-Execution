// ---------------------------------------------------------------------------
// wordlist_entries — Content Discovery Path Wordlist
// ---------------------------------------------------------------------------
//
// Stores known security-sensitive paths, files, and endpoints for use by
// fuzzing tools (ffuf, gobuster, dirsearch, feroxbuster) during the
// content_discovery stage of the scan pipeline.
//
// Pre-seeded with 200+ entries covering:
//   - Environment & config files
//   - Version control (git, svn, hg)
//   - Admin panels & auth pages
//   - API & documentation endpoints
//   - Backup & archive files
//   - Log files
//   - Cloud credentials
//   - Framework-specific paths (WordPress, Laravel, Drupal, etc.)
//   - Database dumps & migrations
//   - CI/CD & deployment configs
//
// Modelled after the Arsenal wordlist list provided in the specification.

import { pgTable, serial, text, varchar, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const wordlistEntriesTable = pgTable("wordlist_entries", {
  id: serial("id").primaryKey(),
  /** The URL path (e.g. /.env, /wp-admin/) — unique to prevent duplicate seeding */
  path: text("path").notNull().unique(),
  /** Category for grouping: config, admin, api, backup, log, vcs, cloud, framework, db, cicd, auth, docs */
  category: varchar("category", { length: 50 }).notNull().default("general"),
  /** Severity if found at this path: critical, high, medium, low, info */
  severity: varchar("severity", { length: 20 }).notNull().default("medium"),
  /** Description of what this path reveals */
  description: text("description"),
  /** Whether this entry is active for scanning */
  active: text("active").notNull().default("true"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertWordlistEntrySchema = createInsertSchema(wordlistEntriesTable).omit({ id: true, createdAt: true });
export type InsertWordlistEntry = z.infer<typeof insertWordlistEntrySchema>;
export type WordlistEntry = typeof wordlistEntriesTable.$inferSelect;

// ── Default Seed Data ─────────────────────────────────────────────────────
// Returns the complete wordlist as an array of InsertWordlistEntry objects.
// This is used by the database seed script to populate the table.

export const WORDLIST_SEED_DATA: InsertWordlistEntry[] = [
  // ── Environment & Config Files ──────────────────────────────────────────
  { path: "/.env",                              category: "config",   severity: "critical",  description: "Environment variables with API keys, DB credentials" },
  { path: "/.env.bak",                          category: "config",   severity: "critical",  description: "Backup of environment file" },
  { path: "/.env.local",                        category: "config",   severity: "critical",  description: "Local environment overrides" },
  { path: "/.env.development",                  category: "config",   severity: "critical",  description: "Development environment file" },
  { path: "/.env.production",                   category: "config",   severity: "critical",  description: "Production environment file" },
  { path: "/.env.old",                          category: "config",   severity: "critical",  description: "Old environment file copy" },
  { path: "/config.json",                       category: "config",   severity: "high",      description: "JSON configuration file" },
  { path: "/config.php",                        category: "config",   severity: "high",      description: "PHP configuration file" },
  { path: "/web.config",                        category: "config",   severity: "high",      description: "ASP.NET web configuration" },
  { path: "/appsettings.json",                  category: "config",   severity: "high",      description: ".NET application settings" },
  { path: "/appsettings.Development.json",      category: "config",   severity: "high",      description: ".NET dev settings" },
  { path: "/config/database.yml",               category: "config",   severity: "critical",  description: "Database configuration (YAML)" },
  { path: "/config/database.yaml",              category: "config",   severity: "critical",  description: "Database configuration" },
  { path: "/config/settings.py",                category: "config",   severity: "high",      description: "Python settings file" },
  { path: "/config/jwt.txt",                    category: "config",   severity: "critical",  description: "JWT secret or token" },
  { path: "/config/master.key",                 category: "config",   severity: "critical",  description: "Rails master key" },
  { path: "/propreties.ini",                    category: "config",   severity: "medium",    description: "Java properties file (typo variant)" },
  { path: "/configuration.php",                 category: "config",   severity: "high",      description: "PHP configuration file" },
  { path: "/configuration.php-dist",            category: "config",   severity: "medium",    description: "PHP config distribution file" },
  { path: "/settings.php",                      category: "config",   severity: "high",      description: "PHP settings file" },
  { path: "/local_settings.py",                 category: "config",   severity: "high",      description: "Python local settings" },
  { path: "/docker-compose.yml",                category: "config",   severity: "high",      description: "Docker Compose configuration" },
  { path: "/kubernetes.yaml",                   category: "config",   severity: "high",      description: "Kubernetes manifest" },
  { path: "/helm/values.yaml",                  category: "config",   severity: "high",      description: "Helm chart values" },
  { path: "/composer.lock",                     category: "config",   severity: "medium",    description: "PHP Composer lock file" },
  { path: "/package-lock.json",                 category: "config",   severity: "medium",    description: "npm lock file" },
  { path: "/FirebaseConfig.json",               category: "config",   severity: "critical",  description: "Firebase configuration with API keys" },
  { path: "/google-services.json",              category: "config",   severity: "critical",  description: "Google services config" },

  // ── Version Control (VCS) ───────────────────────────────────────────────
  { path: "/.git/HEAD",                         category: "vcs",      severity: "critical",  description: "Git HEAD ref — confirms .git exposure" },
  { path: "/.git/config",                       category: "vcs",      severity: "critical",  description: "Git config with remote URLs" },
  { path: "/.git/index",                        category: "vcs",      severity: "high",      description: "Git index file" },
  { path: "/.gitignore",                        category: "vcs",      severity: "medium",    description: "Git ignore rules" },
  { path: "/.git/logs/HEAD",                    category: "vcs",      severity: "high",      description: "Git reflog — commit history" },
  { path: "/.git/refs/heads/master",            category: "vcs",      severity: "high",      description: "Git branch head ref" },
  { path: "/.git_rebase/",                      category: "vcs",      severity: "medium",    description: "Git rebase in progress" },
  { path: "/.gitlab-ci.yml",                    category: "vcs",      severity: "medium",    description: "GitLab CI config" },
  { path: "/.github/workflows/",                category: "vcs",      severity: "medium",    description: "GitHub Actions workflows" },
  { path: "/.svn/entries",                      category: "vcs",      severity: "high",      description: "SVN entries file" },
  { path: "/.svn/wc.db",                        category: "vcs",      severity: "high",      description: "SVN working copy database" },
  { path: "/.svn/text-base/",                   category: "vcs",      severity: "medium",    description: "SVN text base files" },
  { path: "/.hg/",                              category: "vcs",      severity: "medium",    description: "Mercurial repository" },
  { path: "/.bazaar/",                          category: "vcs",      severity: "medium",    description: "Bazaar VCS directory" },
  { path: "/.cvsignore",                        category: "vcs",      severity: "low",       description: "CVS ignore file" },

  // ── Admin Panels & Auth Pages ───────────────────────────────────────────
  { path: "/administrator/",                    category: "admin",    severity: "high",      description: "Joomla admin panel" },
  { path: "/admin/index.php",                   category: "admin",    severity: "high",      description: "Admin index page" },
  { path: "/admin/",                            category: "admin",    severity: "high",      description: "Generic admin panel" },
  { path: "/cpanel/",                           category: "admin",    severity: "high",      description: "cPanel login" },
  { path: "/panel/",                            category: "admin",    severity: "high",      description: "Admin panel" },
  { path: "/dashboard/",                        category: "admin",    severity: "high",      description: "Dashboard admin" },
  { path: "/manage/",                           category: "admin",    severity: "high",      description: "Management panel" },
  { path: "/admin_login.aspx",                  category: "admin",    severity: "high",      description: "ASP.NET admin login" },
  { path: "/admin/controlpanel.php",            category: "admin",    severity: "high",      description: "PHP admin control panel" },
  { path: "/siteadmin/",                        category: "admin",    severity: "high",      description: "Site admin panel" },
  { path: "/wp-admin/",                         category: "admin",    severity: "high",      description: "WordPress admin" },
  { path: "/wp-login.php",                      category: "admin",    severity: "high",      description: "WordPress login" },
  { path: "/user/login",                        category: "auth",     severity: "medium",    description: "User login page" },
  { path: "/oauth/token",                       category: "auth",     severity: "high",      description: "OAuth token endpoint" },
  { path: "/identity/account/login",            category: "auth",     severity: "medium",    description: ".NET Identity login" },
  { path: "/ghost/",                            category: "admin",    severity: "medium",    description: "Ghost CMS admin" },
  { path: "/strapi/",                           category: "admin",    severity: "medium",    description: "Strapi admin" },
  { path: "/typo3/",                            category: "admin",    severity: "medium",    description: "TYPO3 backend" },
  { path: "/bitrix/admin/",                     category: "admin",    severity: "medium",    description: "Bitrix admin panel" },
  { path: "/magento/admin/",                    category: "admin",    severity: "medium",    description: "Magento admin panel" },

  // ── API & Documentation ─────────────────────────────────────────────────
  { path: "/api/v1/",                           category: "api",      severity: "medium",    description: "API v1 root" },
  { path: "/api/v2/auth",                       category: "api",      severity: "high",      description: "API v2 auth endpoint" },
  { path: "/api/v1/users",                      category: "api",      severity: "high",      description: "API users endpoint" },
  { path: "/swagger-ui.html",                   category: "docs",     severity: "medium",    description: "Swagger UI documentation" },
  { path: "/swagger/index.html",                category: "docs",     severity: "medium",    description: "Swagger docs index" },
  { path: "/swagger/v1/swagger.json",            category: "docs",     severity: "medium",    description: "Swagger JSON spec" },
  { path: "/swagger-resources",                  category: "docs",     severity: "low",       description: "Swagger resources" },
  { path: "/api/docs/",                         category: "docs",     severity: "medium",    description: "API documentation" },
  { path: "/api/swagger.json",                   category: "docs",     severity: "medium",    description: "API Swagger JSON" },
  { path: "/api/graphql",                       category: "api",      severity: "high",      description: "GraphQL API endpoint" },
  { path: "/graphql/schema",                    category: "api",      severity: "high",      description: "GraphQL schema introspection" },
  { path: "/graphiql",                          category: "api",      severity: "medium",    description: "GraphQL IDE" },
  { path: "/v1/api-docs/",                      category: "docs",     severity: "medium",    description: "API docs v1" },
  { path: "/actuator/",                         category: "docs",     severity: "high",      description: "Spring Actuator" },
  { path: "/actuator/env",                      category: "config",   severity: "critical",  description: "Spring env config" },
  { path: "/actuator/health",                   category: "docs",     severity: "medium",    description: "Spring health check" },
  { path: "/heapdump",                           category: "config",   severity: "critical",  description: "Java heap dump" },

  // ── Backup & Archive Files ──────────────────────────────────────────────
  { path: "/backup.zip",                        category: "backup",   severity: "critical",  description: "Backup archive" },
  { path: "/site.tar.gz",                       category: "backup",   severity: "critical",  description: "Site archive" },
  { path: "/www.zip",                           category: "backup",   severity: "critical",  description: "WWW backup" },
  { path: "/main.zip",                          category: "backup",   severity: "critical",  description: "Main backup" },
  { path: "/html.zip",                          category: "backup",   severity: "critical",  description: "HTML backup" },
  { path: "/public.tar.gz",                     category: "backup",   severity: "critical",  description: "Public directory archive" },
  { path: "/old.zip",                           category: "backup",   severity: "high",      description: "Old backup" },
  { path: "/project.zip",                       category: "backup",   severity: "critical",  description: "Project backup" },
  { path: "/archive.zip",                       category: "backup",   severity: "high",      description: "Archive file" },
  { path: "/bak.zip",                           category: "backup",   severity: "high",      description: "Bak file" },
  { path: "/db.tar.gz",                         category: "backup",   severity: "critical",  description: "Database backup" },

  // ── Log Files ─────────────────────────────────────────────────────────--
  { path: "/error.log",                         category: "log",      severity: "high",      description: "Server error log" },
  { path: "/debug.log",                         category: "log",      severity: "high",      description: "Debug log" },
  { path: "/access.log",                        category: "log",      severity: "high",      description: "Access log" },
  { path: "/logs/",                             category: "log",      severity: "medium",    description: "Logs directory" },
  { path: "/storage/logs/laravel.log",           category: "log",      severity: "high",      description: "Laravel log" },
  { path: "/php_errors.log",                    category: "log",      severity: "medium",    description: "PHP error log" },
  { path: "/exception.log",                     category: "log",      severity: "medium",    description: "Exception log" },
  { path: "/cron.log",                          category: "log",      severity: "low",       description: "Cron job log" },
  { path: "/mail.log",                          category: "log",      severity: "medium",    description: "Mail log" },
  { path: "/syslog",                            category: "log",      severity: "medium",    description: "System log" },

  // ── Cloud Credentials & Secrets ─────────────────────────────────────────
  { path: "/.aws/credentials",                  category: "cloud",    severity: "critical",  description: "AWS CLI credentials" },
  { path: "/.azure/credentials",                category: "cloud",    severity: "critical",  description: "Azure CLI credentials" },
  { path: "/.docker/config.json",               category: "cloud",    severity: "high",      description: "Docker registry auth" },
  { path: "/.npmrc",                            category: "config",   severity: "high",      description: "npm config with tokens" },
  { path: "/.secrets",                          category: "secrets",  severity: "critical",  description: "Secrets file" },
  { path: "/.ssh/id_rsa",                       category: "secrets",  severity: "critical",  description: "SSH private key" },
  { path: "/.ssh/id_rsa.pub",                   category: "secrets",  severity: "high",      description: "SSH public key" },
  { path: "/.ssh/authorized_keys",              category: "secrets",  severity: "high",      description: "SSH authorized keys" },
  { path: "/jwt.secret",                        category: "secrets",  severity: "critical",  description: "JWT secret key" },
  { path: "/private-key.pem",                   category: "secrets",  severity: "critical",  description: "SSL private key" },
  { path: "/server.key",                        category: "secrets",  severity: "critical",  description: "Server private key" },
  { path: "/credentials.xml",                   category: "secrets",  severity: "critical",  description: "Credentials XML" },
  { path: "/id_rsa",                            category: "secrets",  severity: "critical",  description: "SSH private key (root)" },
  { path: "/passwd",                            category: "secrets",  severity: "high",      description: "Password file" },

  // ── Database Dumps & Migrations ─────────────────────────────────────────
  { path: "/db.sql",                            category: "db",       severity: "critical",  description: "SQL database dump" },
  { path: "/backup.sql",                        category: "db",       severity: "critical",  description: "SQL backup" },
  { path: "/database.sqlite",                   category: "db",       severity: "critical",  description: "SQLite database" },
  { path: "/dump.sql",                          category: "db",       severity: "critical",  description: "SQL dump" },
  { path: "/data.sql",                          category: "db",       severity: "critical",  description: "Data SQL dump" },
  { path: "/dump.sql.gz",                       category: "db",       severity: "critical",  description: "Compressed SQL dump" },
  { path: "/backup.sql.bz2",                    category: "db",       severity: "critical",  description: "Compressed SQL backup" },
  { path: "/mysql.sql",                         category: "db",       severity: "critical",  description: "MySQL dump" },
  { path: "/users.sql",                         category: "db",       severity: "critical",  description: "Users table dump" },
  { path: "/migration.sql",                     category: "db",       severity: "high",      description: "Database migration" },
  { path: "/seed.sql",                          category: "db",       severity: "high",      description: "Database seed" },
  { path: "/db.sqlite3",                        category: "db",       severity: "critical",  description: "SQLite3 database" },
  { path: "/db.vdb",                            category: "db",       severity: "high",      description: "Verity database" },
  { path: "/db_backup.sql",                     category: "db",       severity: "critical",  description: "Database backup SQL" },
  { path: "/data.mdb",                          category: "db",       severity: "high",      description: "Access database" },
  { path: "/database.backup",                   category: "db",       severity: "critical",  description: "Database backup" },
  { path: "/postgres.sql",                      category: "db",       severity: "critical",  description: "PostgreSQL dump" },

  // ── Framework-Specific (WordPress, Laravel, etc.) ───────────────────────
  { path: "/wp-config.php.bak",                 category: "framework", severity: "critical",  description: "WordPress config backup" },
  { path: "/wp-config.php.old",                 category: "framework", severity: "critical",  description: "WordPress config old" },
  { path: "/wp-config.php.save",                category: "framework", severity: "critical",  description: "WordPress config save" },
  { path: "/.htaccess",                         category: "framework", severity: "high",      description: "Apache htaccess" },
  { path: "/.htpasswd",                         category: "framework", severity: "high",      description: "Apache htpasswd" },

  // ── IDE & Editor Files ─────────────────────────────────────────────────
  { path: "/.DS_Store",                         category: "config",   severity: "low",       description: "macOS folder metadata" },
  { path: "/Thumbs.db",                         category: "config",   severity: "low",       description: "Windows thumbnail cache" },
  { path: "/.idea/",                            category: "config",   severity: "low",       description: "IntelliJ IDEA project" },
  { path: "/.idea/workspace.xml",               category: "config",   severity: "medium",    description: "IDE workspace config" },
  { path: "/.vscode/",                          category: "config",   severity: "low",       description: "VS Code settings" },
  { path: "/.vscode/settings.json",             category: "config",   severity: "medium",    description: "VS Code settings file" },

  // ── Common Sensitive Paths ──────────────────────────────────────────────
  { path: "/admin.txt",                         category: "admin",    severity: "medium",    description: "Admin notes file" },
  { path: "/auth.txt",                          category: "auth",     severity: "high",      description: "Auth documentation" },
  { path: "/pass.txt",                          category: "secrets",  severity: "high",      description: "Password file" },
  { path: "/robots.txt",                        category: "config",   severity: "low",       description: "Robots exclusion" },
  { path: "/backend/",                          category: "admin",    severity: "medium",    description: "Backend directory" },
  { path: "/console/",                          category: "admin",    severity: "high",      description: "Console/terminal access" },
  { path: "/phpmyadmin/",                       category: "admin",    severity: "critical",  description: "phpMyAdmin interface" },
  { path: "/pma/",                              category: "admin",    severity: "critical",  description: "phpMyAdmin short URL" },

  // ── CI/CD & Deployment ──────────────────────────────────────────────────
  { path: "/.github/",                          category: "cicd",     severity: "medium",    description: "GitHub directory" },

  // ── Cross-Origin & Security ──────────────────────────────────────────────
  { path: "/crossdomain.xml",                   category: "config",   severity: "medium",    description: "Flash crossdomain policy" },
  { path: "/clientaccesspolicy.xml",             category: "config",   severity: "medium",    description: "Silverlight access policy" },
  { path: "/sitemap.xml",                       category: "config",   severity: "low",       description: "XML sitemap" },

  // ── GraphQL & API Discovery ──────────────────────────────────────────────
  { path: "/graphql",                           category: "api",      severity: "high",      description: "GraphQL endpoint" },
  { path: "/v1/graphql",                        category: "api",      severity: "high",      description: "GraphQL v1 endpoint" },
  { path: "/api",                               category: "api",      severity: "medium",    description: "API root" },
  { path: "/api/v2",                            category: "api",      severity: "medium",    description: "API v2 root" },
  { path: "/api/v3",                            category: "api",      severity: "medium",    description: "API v3 root" },
  { path: "/rest",                              category: "api",      severity: "medium",    description: "REST API root" },
  { path: "/api/rest",                          category: "api",      severity: "medium",    description: "REST API endpoint" },
  { path: "/api/health",                        category: "api",      severity: "low",       description: "API health check" },

  // ── Common Web Paths ─────────────────────────────────────────────────────
  { path: "/index.php",                         category: "general",  severity: "low",       description: "PHP index file" },
  { path: "/index.html",                        category: "general",  severity: "low",       description: "HTML index file" },
  { path: "/index.aspx",                        category: "general",  severity: "low",       description: "ASP.NET index file" },
  { path: "/index.jsp",                         category: "general",  severity: "low",       description: "JSP index file" },
  { path: "/default.aspx",                      category: "general",  severity: "low",       description: "ASP.NET default page" },
  { path: "/default.php",                       category: "general",  severity: "low",       description: "PHP default page" },
  { path: "/info.php",                          category: "config",   severity: "medium",    description: "PHP info disclosure" },
  { path: "/phpinfo.php",                       category: "config",   severity: "medium",    description: "PHP info page" },
  { path: "/test.php",                          category: "general",  severity: "low",       description: "Test PHP file" },
  { path: "/status",                            category: "general",  severity: "medium",    description: "Server status page" },
  { path: "/health",                            category: "general",  severity: "low",       description: "Health check endpoint" },
  { path: "/version",                           category: "general",  severity: "medium",    description: "Version info endpoint" },
  { path: "/server-status",                     category: "general",  severity: "medium",    description: "Apache server status" },
  { path: "/server-info",                       category: "general",  severity: "medium",    description: "Apache server info" },
];

export type WordlistCategory = (typeof WORDLIST_SEED_DATA)[number]["category"];
