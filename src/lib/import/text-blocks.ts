// Shared line-based text-parsing helpers (docs/PRD.md section 30) used by
// all three deterministic parsers — "Bet Slip" (parse-slip-text.ts),
// "Fantasy Matchup" (parse-fantasy-matchup.ts), and "DFS Lineup"
// (parse-dfs-lineup.ts) — that stand in for both "Paste Text" and
// transcribed "Upload Screenshot" input (docs/PRD.md section 43: "Fantasy
// matchups use the same entry methods"). Keeping these helpers shared
// keeps the three "Key: value" text formats structurally consistent.

/**
 * Native <textarea> form submission normalizes line endings to CRLF
 * regardless of how the user typed or pasted the text, so every
 * line-based parser must normalize back to LF before splitting on lines.
 */
export function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

/**
 * Parses "Key: value" lines (one per line) into a lowercase-keyed Map. If
 * a key repeats, the last value wins — use extractRepeatedField for
 * multi-value fields such as "Starter:" that intentionally repeat.
 */
export function parseKeyValueLines(block: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of block.split("\n")) {
    const match = line.match(/^\s*([A-Za-z ]+):\s*(.*)$/);
    if (!match) continue;
    map.set(match[1].trim().toLowerCase(), match[2].trim());
  }
  return map;
}

/**
 * Collects every value for a repeated "Key: value" line within a block,
 * e.g. one "Starter: <name>" line per fantasy starter. `key` is matched
 * case-insensitively and literally (no regex metacharacters expected).
 */
export function extractRepeatedField(block: string, key: string): string[] {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^\\s*${escaped}:\\s*(.*)$`, "gmi");
  const values: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(block))) {
    values.push(match[1].trim());
  }
  return values;
}

/**
 * Extracts a dollar amount like "$1,234.56" into integer cents, or null
 * if `raw` has no parseable amount. Mirrors the original parseDollars
 * behavior: a leading "-" is accepted in the pattern but not applied to
 * the sign of the result, since no field this parses is ever negative.
 */
export function extractDollarCents(raw: string): number | null {
  const match = raw.match(/-?\$?([\d,]+(?:\.\d+)?)/);
  if (!match) return null;
  return Math.round(parseFloat(match[1].replace(/,/g, "")) * 100);
}
