import { spawn } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { access, mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { db, toolsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_LOG_CHARS = 60_000;

export interface ParsedGitHubUrl {
  owner: string;
  repo: string;
  normalizedUrl: string;
  apiRepoPath: string;
}

interface GitHubRepoMetadata {
  description?: string | null;
  default_branch?: string;
  created_at?: string | null;
  updated_at?: string | null;
  pushed_at?: string | null;
  language?: string | null;
  owner?: { login?: string };
  license?: { spdx_id?: string | null; name?: string | null } | null;
  topics?: string[];
}

interface CommandResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

interface DetectionResult {
  language: string;
  category: string;
  capabilities: string[];
  dockerImage: string | null;
  runCommand: string | null;
  sandboxProfile: string;
  buildCommands: Array<{ command: string; args: string[]; cwd: string }>;
}

export function getToolsRoot(): string {
  return path.resolve(process.env.TOOLS_DIR ?? path.join(process.cwd(), "tools"));
}

export function sanitizeToolName(name: string): string | null {
  const clean = name.trim();
  if (!/^[a-z0-9][a-z0-9_.-]{0,62}[a-z0-9]$/i.test(clean)) return null;
  return clean.toLowerCase();
}

export function parseGitHubUrl(url: string): ParsedGitHubUrl | null {
  const trimmed = url.trim();
  const httpsMatch = trimmed.match(/^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/);
  const sshMatch = trimmed.match(/^(?:[A-Za-z0-9_.-]+@)?github\.com:([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/);
  const match = httpsMatch ?? sshMatch;
  if (!match) return null;

  const owner = match[1];
  const repo = match[2];
  return {
    owner,
    repo,
    normalizedUrl: `https://github.com/${owner}/${repo}.git`,
    apiRepoPath: `/repos/${owner}/${repo}`,
  };
}

export async function fetchGitHubJson<T>(pathName: string): Promise<T | null> {
  try {
    const res = await fetch(`https://api.github.com${pathName}`, {
      headers: {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "V8-Platform/2.1",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return await res.json() as T;
  } catch {
    return null;
  }
}

export async function fetchGitHubMetadata(parsed: ParsedGitHubUrl): Promise<GitHubRepoMetadata | null> {
  return fetchGitHubJson<GitHubRepoMetadata>(parsed.apiRepoPath);
}

export async function fetchLatestCommit(parsed: ParsedGitHubUrl, branch?: string | null): Promise<string | null> {
  const ref = branch ? encodeURIComponent(branch) : "HEAD";
  const commit = await fetchGitHubJson<{ sha?: string }>(`${parsed.apiRepoPath}/commits/${ref}`);
  return commit?.sha ?? null;
}

export async function fetchVersion(parsed: ParsedGitHubUrl): Promise<string> {
  const latestRelease = await fetchGitHubJson<{ tag_name?: string }>(`${parsed.apiRepoPath}/releases/latest`);
  if (latestRelease?.tag_name) return latestRelease.tag_name;

  const tags = await fetchGitHubJson<Array<{ name?: string }>>(`${parsed.apiRepoPath}/tags`);
  if (tags?.[0]?.name) return tags[0].name;

  const latestCommit = await fetchLatestCommit(parsed);
  return latestCommit ? latestCommit.slice(0, 12) : "unknown";
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function runCommand(command: string, args: string[], cwd: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell: false,
      windowsHide: true,
      env: process.env,
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Command timed out: ${command} ${args.join(" ")}`));
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout = (stdout + chunk.toString()).slice(-MAX_LOG_CHARS);
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-MAX_LOG_CHARS);
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

async function git(args: string[], cwd: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<CommandResult> {
  return runCommand("git", args, cwd, timeoutMs);
}

async function getLocalCommit(repoPath: string): Promise<string | null> {
  try {
    const result = await git(["rev-parse", "HEAD"], repoPath, 30_000);
    if (result.code !== 0) return null;
    return result.stdout.trim();
  } catch {
    return null;
  }
}

async function readPackageManager(repoPath: string): Promise<"pnpm" | "yarn" | "npm"> {
  if (await exists(path.join(repoPath, "pnpm-lock.yaml"))) return "pnpm";
  if (await exists(path.join(repoPath, "yarn.lock"))) return "yarn";
  return "npm";
}

async function readTextIfExists(filePath: string): Promise<string> {
  try {
    return await import("node:fs/promises").then((fs) => fs.readFile(filePath, "utf8"));
  } catch {
    return "";
  }
}

async function inferCapabilities(repoPath: string, repoName: string): Promise<{ category: string; capabilities: string[] }> {
  const readme = [
    await readTextIfExists(path.join(repoPath, "README.md")),
    await readTextIfExists(path.join(repoPath, "readme.md")),
  ].join("\n").toLowerCase();
  const haystack = `${repoName} ${readme}`;
  const caps = new Set<string>();

  const addWhen = (needle: RegExp, cap: string) => {
    if (needle.test(haystack)) caps.add(cap);
  };

  addWhen(/subdomain|dns|asset discovery|recon/, "recon");
  addWhen(/port scan|tcp|udp|nmap|naabu/, "network");
  addWhen(/vulnerab|cve|template|scanner|nuclei/, "scanner");
  addWhen(/fuzz|dirsearch|gobuster|ffuf|wordlist|content discovery/, "fuzzer");
  addWhen(/sast|static analysis|semgrep|code scan/, "source_code");
  addWhen(/container|image|docker|trivy/, "container");
  addWhen(/cloud|aws|azure|gcp|kubernetes|k8s/, "cloud");
  addWhen(/mobile|android|ios|apk|ipa/, "mobile");
  addWhen(/xss|sql injection|sqli|ssrf|rce|exploit/, "active_testing");

  const capabilities = Array.from(caps);
  const category = capabilities[0] ?? "tool";
  return { category, capabilities };
}

function withMetadata(
  base: Pick<DetectionResult, "language" | "buildCommands">,
  repoPath: string,
  toolName: string,
): Promise<DetectionResult> {
  return inferCapabilities(repoPath, toolName).then(({ category, capabilities }) => ({
    ...base,
    category,
    capabilities,
    dockerImage: null,
    runCommand: null,
    sandboxProfile: JSON.stringify({
      engine: "docker",
      network: "restricted",
      cpu: "1",
      memory: "1024m",
      filesystem: "temporary",
      cleanup: true,
    }),
  }));
}

async function detectTool(repoPath: string, toolName: string): Promise<DetectionResult> {
  const commands: DetectionResult["buildCommands"] = [];

  if (await exists(path.join(repoPath, "go.mod"))) {
    commands.push({ command: "go", args: ["mod", "download"], cwd: repoPath });
    commands.push({ command: "go", args: ["build", "./..."], cwd: repoPath });
    return withMetadata({ language: "Go", buildCommands: commands }, repoPath, toolName);
  }

  if (await exists(path.join(repoPath, "Cargo.toml"))) {
    commands.push({ command: "cargo", args: ["build", "--release"], cwd: repoPath });
    return withMetadata({ language: "Rust", buildCommands: commands }, repoPath, toolName);
  }

  if (await exists(path.join(repoPath, "requirements.txt")) || await exists(path.join(repoPath, "pyproject.toml"))) {
    const venvPath = path.join(repoPath, ".venv");
    const pythonBin = process.platform === "win32" ? path.join(venvPath, "Scripts", "python.exe") : path.join(venvPath, "bin", "python");
    commands.push({ command: "python", args: ["-m", "venv", ".venv"], cwd: repoPath });
    commands.push({ command: pythonBin, args: ["-m", "pip", "install", "--upgrade", "pip"], cwd: repoPath });
    if (await exists(path.join(repoPath, "requirements.txt"))) {
      commands.push({ command: pythonBin, args: ["-m", "pip", "install", "-r", "requirements.txt"], cwd: repoPath });
    } else {
      commands.push({ command: pythonBin, args: ["-m", "pip", "install", "."], cwd: repoPath });
    }
    return withMetadata({ language: "Python", buildCommands: commands }, repoPath, toolName);
  }

  if (await exists(path.join(repoPath, "package.json"))) {
    const manager = await readPackageManager(repoPath);
    const installArgs = manager === "npm" ? ["install"] : ["install", "--frozen-lockfile"];
    commands.push({ command: manager, args: installArgs, cwd: repoPath });
    return withMetadata({ language: "Node.js", buildCommands: commands }, repoPath, toolName);
  }

  if (await exists(path.join(repoPath, "composer.json"))) {
    commands.push({ command: "composer", args: ["install", "--no-interaction", "--prefer-dist"], cwd: repoPath });
    return withMetadata({ language: "PHP", buildCommands: commands }, repoPath, toolName);
  }

  if (await exists(path.join(repoPath, "Gemfile"))) {
    commands.push({ command: "bundle", args: ["install"], cwd: repoPath });
    return withMetadata({ language: "Ruby", buildCommands: commands }, repoPath, toolName);
  }

  if (await exists(path.join(repoPath, "pom.xml"))) {
    commands.push({ command: "mvn", args: ["package", "-DskipTests"], cwd: repoPath });
    return withMetadata({ language: "Java", buildCommands: commands }, repoPath, toolName);
  }

  if (await exists(path.join(repoPath, "build.gradle")) || await exists(path.join(repoPath, "build.gradle.kts"))) {
    const gradleCommand = await exists(path.join(repoPath, "gradlew")) ? (process.platform === "win32" ? "gradlew.bat" : "./gradlew") : "gradle";
    commands.push({ command: gradleCommand, args: ["build", "-x", "test"], cwd: repoPath });
    return withMetadata({ language: "Java", buildCommands: commands }, repoPath, toolName);
  }

  if ((await exists(path.join(repoPath, "Makefile"))) || (await exists(path.join(repoPath, "makefile")))) {
    commands.push({ command: "make", args: [], cwd: repoPath });
    return withMetadata({ language: "C/C++", buildCommands: commands }, repoPath, toolName);
  }

  const entries = await import("node:fs/promises").then((fs) => fs.readdir(repoPath).catch(() => []));
  if (entries.some((entry) => entry.endsWith(".csproj") || entry.endsWith(".sln"))) {
    commands.push({ command: "dotnet", args: ["restore"], cwd: repoPath });
    commands.push({ command: "dotnet", args: ["build", "--configuration", "Release"], cwd: repoPath });
    return withMetadata({ language: ".NET", buildCommands: commands }, repoPath, toolName);
  }

  if (entries.some((entry) => entry.endsWith(".pl"))) {
    return withMetadata({ language: "Perl", buildCommands: commands }, repoPath, toolName);
  }

  if (entries.some((entry) => entry.endsWith(".sh"))) {
    return withMetadata({ language: "Shell", buildCommands: commands }, repoPath, toolName);
  }

  if (await exists(path.join(repoPath, "Dockerfile"))) {
    const metadata = await withMetadata({
      language: "Docker",
      buildCommands: process.env.ENABLE_DOCKER_BUILDS === "true"
        ? [{ command: "docker", args: ["build", "-t", `v8-tool-${toolName}`, "."], cwd: repoPath }]
        : [],
    }, repoPath, toolName);
    return { ...metadata, dockerImage: `v8-tool-${toolName}` };
  }

  return withMetadata({ language: "Unknown", buildCommands: [] }, repoPath, toolName);
}

function appendLog(current: string | null | undefined, next: string): string {
  return `${current ?? ""}\n${next}`.trim().slice(-MAX_LOG_CHARS);
}

async function updateToolLog(toolId: number, message: string) {
  const [tool] = await db.select().from(toolsTable).where(eq(toolsTable.id, toolId));
  await db.update(toolsTable)
    .set({ installLog: appendLog(tool?.installLog, message), lastUpdateMessage: message })
    .where(eq(toolsTable.id, toolId));
}

export async function removeToolDirectory(localPath: string | null) {
  if (!localPath) return;
  const toolsRoot = getToolsRoot();
  const resolved = path.resolve(localPath);
  if (!resolved.startsWith(`${toolsRoot}${path.sep}`)) {
    throw new Error("Refusing to remove a path outside the tools directory");
  }
  await rm(resolved, { recursive: true, force: true });
}

export async function installToolFromGitHub(toolId: number) {
  const [tool] = await db.select().from(toolsTable).where(eq(toolsTable.id, toolId));
  if (!tool?.githubUrl) return;

  const parsed = parseGitHubUrl(tool.githubUrl);
  const slug = sanitizeToolName(tool.name);
  if (!parsed || !slug) {
    await db.update(toolsTable).set({ status: "error", lastUpdateMessage: "Invalid tool name or GitHub URL." }).where(eq(toolsTable.id, toolId));
    return;
  }

  const toolsRoot = getToolsRoot();
  const repoPath = path.join(toolsRoot, slug);
  const startedAt = new Date();

  try {
    await mkdir(toolsRoot, { recursive: true });
    await db.update(toolsTable)
      .set({
        status: "installing",
        localPath: repoPath,
        installStartedAt: startedAt,
        installCompletedAt: null,
        healthScore: 5,
        installLog: "INIT: starting GitHub installation pipeline",
      })
      .where(eq(toolsTable.id, toolId));

    if (await exists(repoPath)) {
      const repoStat = await stat(repoPath);
      if (repoStat.isDirectory()) await rm(repoPath, { recursive: true, force: true });
    }

    await updateToolLog(toolId, `CLONE: git clone ${parsed.normalizedUrl}`);
    const clone = await git(["clone", "--depth", "1", parsed.normalizedUrl, repoPath], toolsRoot, 180_000);
    if (clone.code !== 0) throw new Error(clone.stderr || "git clone failed");

    const detected = await detectTool(repoPath, slug);
    await db.update(toolsTable)
      .set({
        language: detected.language,
        category: detected.category,
        capabilities: JSON.stringify(detected.capabilities),
        dockerImage: detected.dockerImage,
        buildCommands: JSON.stringify(detected.buildCommands.map((cmd) => `${cmd.command} ${cmd.args.join(" ")}`.trim())),
        runCommand: detected.runCommand,
        sandboxProfile: detected.sandboxProfile,
        healthScore: 35,
        lastUpdateMessage: `DETECT: ${detected.language}`,
      })
      .where(eq(toolsTable.id, toolId));

    for (const build of detected.buildCommands) {
      await updateToolLog(toolId, `BUILD: ${build.command} ${build.args.join(" ")}`);
      const result = await runCommand(build.command, build.args, build.cwd, 240_000);
      await updateToolLog(toolId, [result.stdout, result.stderr].filter(Boolean).join("\n"));
      if (result.code !== 0) throw new Error(`${build.command} failed with exit code ${result.code}`);
    }

    const localCommit = await getLocalCommit(repoPath);
    const metadata = await fetchGitHubMetadata(parsed);
    const latestCommit = await fetchLatestCommit(parsed, metadata?.default_branch);
    const version = await fetchVersion(parsed);

    await db.update(toolsTable)
      .set({
        status: "active",
        version,
        description: metadata?.description ?? tool.description,
        author: metadata?.owner?.login ?? null,
        license: metadata?.license?.spdx_id ?? metadata?.license?.name ?? null,
        topics: metadata?.topics ? JSON.stringify(metadata.topics) : null,
        defaultBranch: metadata?.default_branch ?? null,
        installedCommit: localCommit,
        latestCommit,
        repoCreatedAt: metadata?.created_at ? new Date(metadata.created_at) : null,
        repoUpdatedAt: metadata?.updated_at ? new Date(metadata.updated_at) : null,
        installCompletedAt: new Date(),
        lastChecked: new Date(),
        healthScore: 100,
        lastUpdateMessage: localCommit === latestCommit ? "System is 100% up to date." : "Installed successfully. Remote update may be available.",
      })
      .where(eq(toolsTable.id, toolId));
  } catch (err) {
    logger.error({ err, toolId }, "Tool install failed");
    await updateToolLog(toolId, `ERROR: ${err instanceof Error ? err.message : String(err)}`);
    await db.update(toolsTable)
      .set({
        status: "error",
        installCompletedAt: new Date(),
        lastChecked: new Date(),
        healthScore: 0,
        lastUpdateMessage: err instanceof Error ? err.message : "Installation failed",
      })
      .where(eq(toolsTable.id, toolId));
  }
}

export async function updateInstalledTool(toolId: number) {
  const [tool] = await db.select().from(toolsTable).where(eq(toolsTable.id, toolId));
  if (!tool?.githubUrl || !tool.localPath) throw new Error("Tool has no local installation path");

  const parsed = parseGitHubUrl(tool.githubUrl);
  if (!parsed) throw new Error("Invalid GitHub URL");

  const metadata = await fetchGitHubMetadata(parsed);
  if (!metadata) {
    const [updated] = await db.update(toolsTable)
      .set({
        status: "error",
        healthScore: 0,
        lastChecked: new Date(),
        lastUpdateMessage: "Repository is offline, private, deleted, or unavailable.",
      })
      .where(eq(toolsTable.id, toolId))
      .returning();
    return updated;
  }

  await db.update(toolsTable)
    .set({ status: "updating", lastChecked: new Date(), lastUpdateMessage: "Checking remote GitHub repository..." })
    .where(eq(toolsTable.id, toolId));

  const latestCommit = await fetchLatestCommit(parsed, metadata.default_branch);
  const localCommit = await getLocalCommit(tool.localPath);
  if (latestCommit && localCommit === latestCommit) {
    const [updated] = await db.update(toolsTable)
      .set({
        status: "active",
        latestCommit,
        installedCommit: localCommit,
        version: await fetchVersion(parsed),
        description: metadata.description ?? tool.description,
        repoUpdatedAt: metadata.updated_at ? new Date(metadata.updated_at) : null,
        lastChecked: new Date(),
        healthScore: 100,
        lastUpdateMessage: "System is 100% up to date.",
      })
      .where(eq(toolsTable.id, toolId))
      .returning();
    return updated;
  }

  await updateToolLog(toolId, "UPDATE: git pull --ff-only");
  const pull = await git(["pull", "--ff-only"], tool.localPath, 180_000);
  if (pull.code !== 0) throw new Error(pull.stderr || "git pull failed");

  const detected = await detectTool(tool.localPath, sanitizeToolName(tool.name) ?? tool.name);
  for (const build of detected.buildCommands) {
    await updateToolLog(toolId, `REBUILD: ${build.command} ${build.args.join(" ")}`);
    const result = await runCommand(build.command, build.args, build.cwd, 240_000);
    await updateToolLog(toolId, [result.stdout, result.stderr].filter(Boolean).join("\n"));
    if (result.code !== 0) throw new Error(`${build.command} failed with exit code ${result.code}`);
  }

  const newLocalCommit = await getLocalCommit(tool.localPath);
  const [updated] = await db.update(toolsTable)
    .set({
      status: "active",
      language: detected.language,
      category: detected.category,
      capabilities: JSON.stringify(detected.capabilities),
      dockerImage: detected.dockerImage,
      buildCommands: JSON.stringify(detected.buildCommands.map((cmd) => `${cmd.command} ${cmd.args.join(" ")}`.trim())),
      runCommand: detected.runCommand,
      sandboxProfile: detected.sandboxProfile,
      version: await fetchVersion(parsed),
      installedCommit: newLocalCommit,
      latestCommit,
      description: metadata.description ?? tool.description,
      repoUpdatedAt: metadata.updated_at ? new Date(metadata.updated_at) : null,
      lastChecked: new Date(),
      healthScore: 100,
      lastUpdateMessage: "Update applied and dependencies rebuilt successfully.",
    })
    .where(eq(toolsTable.id, toolId))
    .returning();
  return updated;
}
