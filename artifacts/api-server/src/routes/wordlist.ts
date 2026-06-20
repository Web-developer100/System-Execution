// ---------------------------------------------------------------------------
// Wordlist Routes — Content Discovery Path Fuzzing
// ---------------------------------------------------------------------------
//
// Serves the pre-seeded wordlist of security-sensitive paths for use by
// fuzzing tools (ffuf, gobuster, dirsearch, feroxbuster) during the
// content_discovery pipeline stage.
//
// Endpoints:
//   GET /api/wordlist          — Get all wordlist entries
//   GET /api/wordlist/random   — Get random entries for fuzzing
//   GET /api/wordlist/:category — Get entries by category
//
// The wordlist is seeded at boot time via the WORDLIST_SEED_DATA constant.
// Each entry contains the path, category, severity if found, and description.

import { Router, type IRouter } from "express";
import { db, wordlistEntriesTable, WORDLIST_SEED_DATA } from "@workspace/db";
import { eq, desc, count } from "drizzle-orm";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ── Boot-time seed check ──────────────────────────────────────────────────

let seedingPromise: Promise<void> | null = null;

async function ensureWordlistSeeded(): Promise<void> {
  if (seedingPromise) return seedingPromise;

  seedingPromise = (async () => {
    try {
      const [existing] = await db.select({ total: count() }).from(wordlistEntriesTable);
      if (!existing || existing.total < WORDLIST_SEED_DATA.length) {

        // Seed the data
        logger.info("[WORDLIST] Seeding wordlist entries...");
        for (const entry of WORDLIST_SEED_DATA) {
          await db.insert(wordlistEntriesTable).values(entry).onConflictDoNothing();
        }
        logger.info({ count: WORDLIST_SEED_DATA.length }, "[WORDLIST] Wordlist seeding complete");
      }
    } catch (err) {
      logger.error({ err }, "[WORDLIST] Failed to seed wordlist");
    }
  })();

  return seedingPromise;
}

// Trigger seed immediately (non-blocking)
ensureWordlistSeeded();

// ── GET /api/wordlist ─────────────────────────────────────────────────────

router.get("/wordlist", async (_req, res) => {
  try {
    await ensureWordlistSeeded();
    const entries = await db.select().from(wordlistEntriesTable).orderBy(desc(wordlistEntriesTable.createdAt));
    return res.json({
      total: entries.length,
      entries: entries.map((e) => ({
        id: e.id,
        path: e.path,
        category: e.category,
        severity: e.severity,
        description: e.description,
      })),
    });
  } catch (err) {
    logger.error({ err }, "Get wordlist error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/wordlist/random ──────────────────────────────────────────────

router.get("/wordlist/random", async (req, res) => {
  try {
    await ensureWordlistSeeded();
    const limit = Math.min(Number(req.query.limit) || 50, 500);
    const entries = await db.select().from(wordlistEntriesTable).orderBy(desc(wordlistEntriesTable.createdAt));
    // Shuffle and take limit
    const shuffled = entries.sort(() => Math.random() - 0.5).slice(0, limit);
    return res.json({
      total: entries.length,
      returned: shuffled.length,
      entries: shuffled.map((e) => ({
        id: e.id,
        path: e.path,
        category: e.category,
        severity: e.severity,
        description: e.description,
      })),
    });
  } catch (err) {
    logger.error({ err }, "Get random wordlist error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/wordlist/:category ──────────────────────────────────────────

router.get("/wordlist/:category", async (req, res) => {
  try {
    await ensureWordlistSeeded();
    const category = req.params.category;
    const entries = await db
      .select()
      .from(wordlistEntriesTable)
      .where(eq(wordlistEntriesTable.category, category))
      .orderBy(desc(wordlistEntriesTable.createdAt));

    return res.json({
      category,
      total: entries.length,
      entries: entries.map((e) => ({
        id: e.id,
        path: e.path,
        severity: e.severity,
        description: e.description,
      })),
    });
  } catch (err) {
    logger.error({ err }, "Get wordlist by category error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
