import type { Finding } from "./types";

// ── Output Parser Interface ─────────────────────────────────────────────────

export interface OutputParser {
  /** Unique name for this parser (for diagnostics) */
  readonly name: string;

  /** Return true if this parser can handle output from the given tool */
  canParse(toolName: string): boolean;

  /**
   * Parse raw tool output into an array of structured Findings.
   *
   * @param toolName  — the tool that produced the output
   * @param scanId    — scan ID to attach to each finding
   * @param target    — the original scan target
   * @param stdout    — full stdout from the tool
   * @param stderr    — full stderr from the tool
   * @returns         — parsed findings (empty array if none found)
   */
  parse(params: {
    toolName: string;
    scanId: number;
    target: string;
    stdout: string;
    stderr: string;
  }): Finding[];
}
