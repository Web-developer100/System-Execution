import { Router, type IRouter } from "express";
import { db, proxiesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { logger } from "../lib/logger";

const router: IRouter = Router();

let proxyEnabled = false;

function formatProxy(p: typeof proxiesTable.$inferSelect) {
  return {
    id: p.id,
    ip: p.ip,
    port: p.port,
    protocol: p.protocol,
    status: p.status,
    latency: p.latency ?? null,
    country: p.country ?? null,
    isp: p.isp ?? null,
    healthScore: p.healthScore ?? null,
  };
}

// GET /api/proxies
router.get("/proxies", async (_req, res) => {
  try {
    const proxies = await db.select().from(proxiesTable).orderBy(desc(proxiesTable.createdAt));
    return res.json(proxies.map(formatProxy));
  } catch (err) {
    logger.error({ err }, "Get proxies error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/proxies
router.post("/proxies", async (req, res) => {
  const { ip, port, protocol, username, password } = req.body as {
    ip: string; port: number; protocol: string; username?: string; password?: string;
  };
  if (!ip || !port || !protocol) {
    return res.status(400).json({ error: "ip, port, protocol required" });
  }
  try {
    const [proxy] = await db.insert(proxiesTable).values({
      ip, port, protocol,
      username: username ?? null,
      password: password ?? null,
      status: "active",
      latency: Math.floor(Math.random() * 150) + 20,
      country: "Unknown",
      isp: "Unknown ISP",
      healthScore: 95,
    }).returning();
    return res.status(201).json(formatProxy(proxy));
  } catch (err) {
    logger.error({ err }, "Add proxy error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/proxies/:id
router.delete("/proxies/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
  try {
    await db.delete(proxiesTable).where(eq(proxiesTable.id, id));
    return res.status(204).send();
  } catch (err) {
    logger.error({ err }, "Delete proxy error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/proxies/check-ip
router.get("/proxies/check-ip", async (_req, res) => {
  try {
    if (proxyEnabled) {
      // Return a spoofed proxy IP
      const proxies = await db.select().from(proxiesTable).where(eq(proxiesTable.status, "active"));
      const proxy = proxies[Math.floor(Math.random() * proxies.length)];
      if (proxy) {
        return res.json({
          ip: proxy.ip,
          country: proxy.country ?? "Netherlands",
          isp: proxy.isp ?? "DataPipe LLC",
          city: "Amsterdam",
          lat: 52.3676,
          lon: 4.9041,
          proxyEnabled: true,
        });
      }
    }
    // Return server's real IP info (mock for demo)
    return res.json({
      ip: "185.199.108.153",
      country: "United States",
      isp: "GitHub Inc.",
      city: "San Francisco",
      lat: 37.7749,
      lon: -122.4194,
      proxyEnabled: false,
    });
  } catch (err) {
    logger.error({ err }, "Check IP error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/proxies/toggle
router.post("/proxies/toggle", async (req, res) => {
  const { enabled } = req.body as { enabled: boolean };
  proxyEnabled = enabled;
  try {
    if (proxyEnabled) {
      const proxies = await db.select().from(proxiesTable).where(eq(proxiesTable.status, "active"));
      const proxy = proxies[Math.floor(Math.random() * proxies.length)];
      if (proxy) {
        return res.json({
          ip: proxy.ip,
          country: proxy.country ?? "Netherlands",
          isp: proxy.isp ?? "DataPipe LLC",
          city: "Amsterdam",
          lat: 52.3676,
          lon: 4.9041,
          proxyEnabled: true,
        });
      }
    }
    return res.json({
      ip: "185.199.108.153",
      country: "United States",
      isp: "GitHub Inc.",
      city: "San Francisco",
      lat: 37.7749,
      lon: -122.4194,
      proxyEnabled: false,
    });
  } catch (err) {
    logger.error({ err }, "Toggle proxy error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
