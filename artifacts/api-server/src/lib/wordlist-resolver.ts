// ---------------------------------------------------------------------------
// Wordlist Resolver — provides wordlist file for content discovery tools
// ---------------------------------------------------------------------------
//
// Resolves the path to a wordlist file that can be used by fuzzing tools
// (ffuf, gobuster, dirsearch, feroxbuster).
//
// If the platform wordlist is available (seeded from WORDLIST_SEED_DATA),
// it writes the paths to a temp file and returns the path. Otherwise
// it falls back to common system wordlist locations.

import { writeFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WORDLIST_SEED_DATA } from "@workspace/db";
import { logger } from "./logger";

const WORDLIST_CACHE_PATH = join(tmpdir(), "v8-platform-wordlist.txt");
let wordlistReady = false;

/**
 * Ensure the wordlist file exists on disk.
 * This should be called once at boot time.
 */
export async function ensureWordlistFile(): Promise<void> {
  try {
    await access(WORDLIST_CACHE_PATH);
    wordlistReady = true;
    logger.info({ path: WORDLIST_CACHE_PATH }, "[WORDLIST] Wordlist file already exists");
    return;
  } catch {
    // File doesn't exist, create it
  }

  try {
    // Write wordlist paths directly from the seed data constant
    // This avoids any race condition with the async DB seeding process.
    const lines = WORDLIST_SEED_DATA.map((e) => e.path).join("\n");
    await writeFile(WORDLIST_CACHE_PATH, lines, "utf-8");
    wordlistReady = true;
    logger.info({ count: WORDLIST_SEED_DATA.length, path: WORDLIST_CACHE_PATH }, "[WORDLIST] Wordlist file written from seed data");
  } catch (err) {
    logger.warn({ err }, "[WORDLIST] Could not write wordlist from seed data, will use fallback");
  }
}

/**
 * Get the path to the wordlist file. Falls back to common system locations.
 */
export function getWordlistPath(): string {
  if (wordlistReady) return WORDLIST_CACHE_PATH;

  // System fallback paths (in priority order)
  const fallbacks = [
    "/usr/share/wordlists/dirb/common.txt",
    "/usr/share/dirb/wordlists/common.txt",
    "/usr/share/seclists/Discovery/Web-Content/common.txt",
    "/home/wordlists/dirb/common.txt",
    join(__dirname, "../../../wordlists/common.txt"),
  ];

  return fallbacks[0]; // First fallback
}

/**
 * Check if a tool is a content discovery tool that needs a wordlist.
 */
export function isContentDiscoveryTool(toolName: string): boolean {
  const name = toolName.toLowerCase();
  return ["ffuf", "gobuster", "dirsearch", "feroxbuster", "wfuzz", "dirb"].includes(name);
}
