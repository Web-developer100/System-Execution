import { Router, type IRouter } from "express";
import { spawn } from "node:child_process";

const router: IRouter = Router();

const bootTime = Date.now();
let requestCount = 0;

router.use((_req, _res, next) => {
  requestCount++;
  next();
});

// GET /api/system/metrics
router.get("/system/metrics", (_req, res) => {
  const uptimeSeconds = Math.floor(process.uptime());
  const h = Math.floor(uptimeSeconds / 3600);
  const m = Math.floor((uptimeSeconds % 3600) / 60);
  const s = uptimeSeconds % 60;
  const mem = process.memoryUsage();

  return res.json({
    uptime: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`,
    uptimeSeconds,
    memoryUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
    memoryTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
    rss: Math.round(mem.rss / 1024 / 1024),
    nodeVersion: process.version,
    platform: process.platform,
    requestCount,
    bootTime,
  });
});

function checkBinary(binary: string, args = ["--version"]): Promise<{ name: string; available: boolean; version: string | null }> {
  return new Promise((resolve) => {
    const child = spawn(binary, args, { shell: false, windowsHide: true });
    let output = "";

    child.stdout?.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.on("error", () => {
      resolve({ name: binary, available: false, version: null });
    });
    child.on("close", (code) => {
      resolve({
        name: binary,
        available: code === 0,
        version: code === 0 ? output.split(/\r?\n/)[0]?.trim() || null : null,
      });
    });
  });
}

// GET /api/system/toolchain
router.get("/system/toolchain", async (_req, res) => {
  const checks = await Promise.all([
    checkBinary("git"),
    checkBinary("python", ["--version"]),
    checkBinary("pip", ["--version"]),
    checkBinary("go", ["version"]),
    checkBinary("rustc", ["--version"]),
    checkBinary("cargo", ["--version"]),
    checkBinary("node", ["--version"]),
    checkBinary("npm", ["--version"]),
    checkBinary("docker", ["--version"]),
  ]);

  return res.json({
    status: checks.every((check) => check.available) ? "ready" : "missing_dependencies",
    tools: checks,
    bootstrapScript: "scripts/bootstrap-toolchain-linux.sh",
  });
});

export default router;
