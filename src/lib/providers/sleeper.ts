// Sleeper adapter for NFL player stats. See docs/api-evaluation.md.
//
// Why this exists alongside the ESPN adapter: one Sleeper call returns every
// player's stats for a week, so refresh cost is flat. ESPN's equivalent is one
// box-score call per game. Sleeper also hands back PPR points precomputed,
// which ESPN does not provide at all.
//
// Sleeper has no scores, status, or clock, so it is a PlayerStatsProvider and
// never a source of Events.
//
// The stats endpoint is undocumented (Sleeper's docs cover leagues and drafts),
// but unlike ESPN their docs explicitly grant free non-commercial use with no
// token and a 1,000-call-per-minute ceiling.

import {
  DEFAULT_PROVIDER_CONFIG,
  type PlayerStatsProvider,
  type ProviderPlayerStat,
} from "./types";

export const SLEEPER_PROVIDER_KEY = "sleeper";

const BASE_URL = "https://api.sleeper.app/v1";

/**
 * Sleeper field -> normalized stat key. Deliberately the same key names the
 * ESPN box-score normalizer emits, so a prop threshold can be compared without
 * knowing which provider answered.
 */
const STAT_KEYS: Record<string, string> = {
  pass_yd: "passYards",
  pass_td: "passTd",
  pass_int: "passInt",
  pass_att: "passAttempts",
  pass_cmp: "passCompletions",
  rush_att: "rushAttempts",
  rush_yd: "rushYards",
  rush_td: "rushTd",
  rec: "receptions",
  rec_yd: "recYards",
  rec_td: "recTd",
  rec_tgt: "targets",
};

export interface SleeperDirectoryEntry {
  playerName?: string;
  team?: string;
  position?: string;
}

export type SleeperDirectory = Record<string, SleeperDirectoryEntry>;

interface RawDirectoryEntry {
  full_name?: string;
  first_name?: string;
  last_name?: string;
  team?: string | null;
  position?: string | null;
}

/**
 * Trims the 14.6 MB player payload to the three fields needed to resolve a
 * stats row. Keeping the full payload in memory is not worth it.
 */
export function normalizePlayerDirectory(payload: unknown): SleeperDirectory {
  if (payload == null || typeof payload !== "object") {
    throw new Error("Sleeper: player directory payload is not an object");
  }

  const out: SleeperDirectory = {};
  for (const [id, raw] of Object.entries(payload as Record<string, RawDirectoryEntry>)) {
    if (raw == null || typeof raw !== "object") continue;
    const name =
      raw.full_name ?? [raw.first_name, raw.last_name].filter(Boolean).join(" ") ?? undefined;
    out[id] = {
      playerName: name || undefined,
      team: raw.team ?? undefined,
      position: raw.position ?? undefined,
    };
  }

  if (Object.keys(out).length === 0) {
    throw new Error("Sleeper: player directory parsed but was empty");
  }
  return out;
}

/**
 * Week stats payload -> ProviderPlayerStat[]. Pure, so it can be tested against
 * a captured payload with no network.
 *
 * Sleeper keys stats by player id with no names in the payload, hence the
 * directory. Rows with no recognized stat are dropped: the payload carries
 * 2,230 entries for a week in which only 357 players recorded anything, plus
 * `TEAM_*` aggregates that are not players at all.
 */
export function normalizeWeekStats(
  payload: unknown,
  directory: SleeperDirectory,
): ProviderPlayerStat[] {
  if (payload == null || typeof payload !== "object") {
    throw new Error("Sleeper: week stats payload is not an object");
  }

  const out: ProviderPlayerStat[] = [];

  for (const [playerId, raw] of Object.entries(payload as Record<string, unknown>)) {
    if (playerId.startsWith("TEAM_")) continue;
    if (raw == null || typeof raw !== "object") continue;

    const row = raw as Record<string, unknown>;
    const stats: Record<string, number> = {};
    for (const [sleeperKey, normalizedKey] of Object.entries(STAT_KEYS)) {
      const value = row[sleeperKey];
      if (typeof value === "number" && Number.isFinite(value)) stats[normalizedKey] = value;
    }

    const ppr = row.pts_ppr;
    const hasPoints = typeof ppr === "number" && Number.isFinite(ppr);
    if (Object.keys(stats).length === 0 && !hasPoints) continue;

    const entry = directory[playerId];
    out.push({
      providerPlayerId: playerId,
      playerName: entry?.playerName,
      teamAbbreviation: entry?.team,
      position: entry?.position,
      stats,
      fantasyPointsPpr: numberOrUndefined(row.pts_ppr),
      fantasyPointsHalfPpr: numberOrUndefined(row.pts_half_ppr),
      fantasyPointsStandard: numberOrUndefined(row.pts_std),
    });
  }

  if (out.length === 0) {
    throw new Error(
      'Sleeper: week stats parsed but no player recorded anything — treating as failure, not "no action"',
    );
  }

  return out;
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export interface SleeperState {
  season: string;
  week: number;
  seasonType: string;
}

export function normalizeState(payload: unknown): SleeperState {
  const raw = payload as { season?: string; week?: number; season_type?: string } | null;
  if (!raw?.season || typeof raw.week !== "number") {
    throw new Error("Sleeper: /state/nfl payload missing season or week");
  }
  return {
    season: raw.season,
    week: raw.week,
    seasonType: raw.season_type ?? "regular",
  };
}

async function fetchJson(url: string, timeoutMs: number): Promise<unknown> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Sleeper request failed: ${response.status} ${url}`);
  }
  return response.json();
}

/**
 * The directory is 14.6 MB and changes at most daily, so it is cached in module
 * memory. Sleeper's own docs ask callers not to refetch it per request.
 */
const DIRECTORY_TTL_MS = 24 * 60 * 60 * 1000;
let directoryCache: { at: number; directory: SleeperDirectory } | null = null;

export function clearDirectoryCache(): void {
  directoryCache = null;
}

async function loadDirectory(timeoutMs: number): Promise<SleeperDirectory> {
  if (directoryCache && Date.now() - directoryCache.at < DIRECTORY_TTL_MS) {
    return directoryCache.directory;
  }
  const payload = await fetchJson(`${BASE_URL}/players/nfl`, timeoutMs);
  const directory = normalizePlayerDirectory(payload);
  directoryCache = { at: Date.now(), directory };
  return directory;
}

export const SleeperProvider: PlayerStatsProvider = {
  key: SLEEPER_PROVIDER_KEY,
  config: DEFAULT_PROVIDER_CONFIG,

  supportsSport(sport: string): boolean {
    return sport === "nfl";
  },

  async getCurrentWeek(): Promise<SleeperState> {
    const payload = await fetchJson(`${BASE_URL}/state/nfl`, SleeperProvider.config.timeoutMs);
    return normalizeState(payload);
  },

  async getWeekPlayerStats({
    season,
    week,
    seasonType = "regular",
  }: {
    season: string;
    week: number;
    seasonType?: string;
  }): Promise<ProviderPlayerStat[]> {
    const { timeoutMs } = SleeperProvider.config;
    const directory = await loadDirectory(timeoutMs);
    const payload = await fetchJson(
      `${BASE_URL}/stats/nfl/${seasonType}/${season}/${week}`,
      timeoutMs,
    );
    return normalizeWeekStats(payload, directory);
  },
};
