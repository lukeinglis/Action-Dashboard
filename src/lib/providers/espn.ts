// ESPN adapter. See docs/api-evaluation.md for the measurements behind these
// choices and the risks that come with them.
//
// This is ESPN's undocumented internal API: no key, no changelog, no published
// rate limit. Two consequences are baked into the code below:
//
//   1. Only single-date and no-date requests are issued. Date *ranges* started
//      returning HTTP 400 on 2026-09-18 and still do.
//   2. A slate that parses but contains no events is an error, not "no games".
//      Several open-source projects silently stored zero events through that
//      regression because they trusted an empty result.

import {
  DEFAULT_PROVIDER_CONFIG,
  type ProviderEvent,
  type ProviderPlayerStat,
  type SportsProvider,
} from "./types";
import type { EventStatus } from "@/lib/types/domain";

export const ESPN_PROVIDER_KEY = "espn";

const BASE_URL = "https://site.api.espn.com/apis/site/v2/sports";

/** Sport key -> ESPN path segment. Phase 0 covers NFL and PGA only (§47). */
const SPORT_PATHS: Record<string, string> = {
  nfl: "football/nfl",
  golf: "golf/pga",
};

/** ESPN league label, for the non-team match key (§20.2). */
const SPORT_LEAGUES: Record<string, string> = {
  nfl: "NFL",
  golf: "PGA",
};

/**
 * Explicit ESPN status names take priority, then `status.type.state` carries
 * anything unrecognized. ESPN adds status names without notice, so falling back
 * to the three-value state keeps a new name from becoming "unknown".
 */
const STATUS_BY_NAME: Record<string, EventStatus> = {
  STATUS_SCHEDULED: "scheduled",
  STATUS_IN_PROGRESS: "in_progress",
  STATUS_HALFTIME: "in_progress",
  STATUS_END_PERIOD: "in_progress",
  STATUS_END_OF_PERIOD: "in_progress",
  STATUS_FINAL: "final",
  STATUS_FINAL_OVERTIME: "final",
  STATUS_FORFEIT: "final",
  STATUS_POSTPONED: "postponed",
  STATUS_CANCELED: "cancelled",
  STATUS_CANCELLED: "cancelled",
  STATUS_SUSPENDED: "suspended",
  STATUS_DELAYED: "suspended",
  STATUS_RAIN_DELAY: "suspended",
};

const STATUS_BY_STATE: Record<string, EventStatus> = {
  pre: "scheduled",
  in: "in_progress",
  post: "final",
};

export function mapEspnStatus(
  typeName: string | undefined,
  state: string | undefined,
): EventStatus {
  if (typeName && STATUS_BY_NAME[typeName]) return STATUS_BY_NAME[typeName];
  if (state && STATUS_BY_STATE[state]) return STATUS_BY_STATE[state];
  return "unknown";
}

/**
 * Quarter label for the Event's `period` text column. Anything past regulation
 * is "OT" rather than "Q5", which is what a reader expects to see.
 *
 * Between quarters ESPN reports the period it just finished with a 0:00 clock,
 * which would otherwise render as a stalled live clock ("Q3 0:00").
 */
export function isBetweenPeriods(typeName: string | undefined): boolean {
  return (
    typeName === "STATUS_HALFTIME" ||
    typeName === "STATUS_END_PERIOD" ||
    typeName === "STATUS_END_OF_PERIOD"
  );
}

export function formatPeriod(
  sport: string,
  period: number | undefined,
  typeName: string | undefined,
): string | undefined {
  if (typeName === "STATUS_HALFTIME") return "HALF";
  if (period == null || period < 1) return undefined;

  const label = sport !== "nfl" ? String(period) : period > 4 ? "OT" : `Q${period}`;
  return isBetweenPeriods(typeName) ? `END ${label}` : label;
}

interface EspnCompetitor {
  homeAway?: string;
  score?: string;
  order?: number;
  team?: { id?: string; abbreviation?: string; displayName?: string };
  athlete?: { id?: string; displayName?: string };
}

interface EspnEvent {
  id?: string;
  name?: string;
  shortName?: string;
  date?: string;
  endDate?: string;
  status?: {
    period?: number;
    displayClock?: string;
    type?: { name?: string; state?: string };
  };
  competitions?: {
    competitors?: EspnCompetitor[];
    status?: EspnEvent["status"];
  }[];
}

interface EspnScoreboard {
  events?: EspnEvent[];
}

function parseScore(raw: string | undefined): number | undefined {
  if (raw == null || raw === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Scoreboard payload -> ProviderEvent[]. Pure, so it can be tested against a
 * captured payload with no network.
 */
export function normalizeScoreboard(payload: unknown, sport: string): ProviderEvent[] {
  const board = payload as EspnScoreboard | null;
  const events = board?.events;
  if (!Array.isArray(events)) {
    throw new Error(`ESPN ${sport}: payload has no events array`);
  }

  const out: ProviderEvent[] = [];
  for (const event of events) {
    if (!event.id) continue;

    const competition = event.competitions?.[0];
    const status = event.status ?? competition?.status;
    const typeName = status?.type?.name;
    const normalizedStatus = mapEspnStatus(typeName, status?.type?.state);
    const inProgress = normalizedStatus === "in_progress";

    const competitors = competition?.competitors ?? [];
    const home = competitors.find((c) => c.homeAway === "home");
    const away = competitors.find((c) => c.homeAway === "away");

    const period = formatPeriod(sport, status?.period, typeName);
    const displayClock = status?.displayClock;
    // A game that hasn't started reports "0"-"0", which would otherwise be
    // written as a real 0-0 scoreline before kickoff. Same for a postponement.
    const hasScores = normalizedStatus === "in_progress" || normalizedStatus === "final";

    out.push({
      providerEventId: event.id,
      sport,
      league: SPORT_LEAGUES[sport],
      name: event.name ?? event.shortName ?? "",
      startTimeUtc: event.date,
      startTimeTbd: !event.date,
      endTimeUtc: event.endDate,
      homeTeamProviderId: home?.team?.id,
      awayTeamProviderId: away?.team?.id,
      homeTeamAbbreviation: home?.team?.abbreviation,
      awayTeamAbbreviation: away?.team?.abbreviation,
      homeTeamName: home?.team?.displayName,
      awayTeamName: away?.team?.displayName,
      status: normalizedStatus,
      homeScore: hasScores ? parseScore(home?.score) : undefined,
      awayScore: hasScores ? parseScore(away?.score) : undefined,
      // Period and clock only mean anything mid-game; a final game reports 0:00,
      // and so does a game between quarters, where the period label says "END Q3".
      period: inProgress ? period : undefined,
      clock: inProgress && !isBetweenPeriods(typeName) && displayClock ? displayClock : undefined,
    });
  }

  if (out.length === 0) {
    throw new Error(
      `ESPN ${sport}: slate parsed but contained no usable events — treating as failure, not "no games"`,
    );
  }

  return out;
}

/** Normalized stat keys, so callers never parse an ESPN label string. */
const BOX_SCORE_KEYS: Record<string, Record<string, string>> = {
  passing: { YDS: "passYards", TD: "passTd", INT: "passInt" },
  rushing: { YDS: "rushYards", TD: "rushTd", CAR: "rushAttempts" },
  receiving: { REC: "receptions", YDS: "recYards", TD: "recTd", TGTS: "targets" },
};

interface EspnBoxScore {
  boxscore?: {
    players?: {
      team?: { abbreviation?: string };
      statistics?: {
        name?: string;
        labels?: string[];
        athletes?: { athlete?: { id?: string; displayName?: string }; stats?: string[] }[];
      }[];
    }[];
  };
}

/**
 * `summary?event=` payload -> per-player stats. One call per game, which is why
 * Sleeper is preferred for this; retained as the documented fallback path.
 */
export function normalizeBoxScore(payload: unknown, providerEventId: string): ProviderPlayerStat[] {
  const teams = (payload as EspnBoxScore | null)?.boxscore?.players;
  if (!Array.isArray(teams)) {
    throw new Error(`ESPN box score ${providerEventId}: payload has no boxscore.players`);
  }

  const byPlayer = new Map<string, ProviderPlayerStat>();

  for (const team of teams) {
    const teamAbbreviation = team.team?.abbreviation;
    for (const category of team.statistics ?? []) {
      const keys = BOX_SCORE_KEYS[category.name ?? ""];
      if (!keys || !category.labels) continue;

      for (const row of category.athletes ?? []) {
        const id = row.athlete?.id;
        if (!id || !row.stats) continue;

        const existing = byPlayer.get(id) ?? {
          providerPlayerId: id,
          playerName: row.athlete?.displayName,
          teamAbbreviation,
          providerEventId,
          stats: {},
        };

        category.labels.forEach((label, i) => {
          const key = keys[label];
          if (!key) return;
          const value = Number(row.stats![i]);
          if (Number.isFinite(value)) existing.stats[key] = value;
        });

        byPlayer.set(id, existing);
      }
    }
  }

  return [...byPlayer.values()];
}

async function fetchJson(url: string, timeoutMs: number): Promise<unknown> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`ESPN request failed: ${response.status} ${url}`);
  }
  return response.json();
}

export interface EspnScheduleParams {
  sport: string;
  /** YYYYMMDD. Omit for the current slate. Ranges are not supported upstream. */
  date?: string;
}

export const EspnProvider: SportsProvider = {
  key: ESPN_PROVIDER_KEY,
  config: DEFAULT_PROVIDER_CONFIG,

  supportsSport(sport: string): boolean {
    return sport in SPORT_PATHS;
  },

  async getSchedule(params: unknown): Promise<ProviderEvent[]> {
    const { sport, date } = params as EspnScheduleParams;
    const path = SPORT_PATHS[sport];
    if (!path) throw new Error(`ESPN: unsupported sport "${sport}"`);

    const query = date ? `?dates=${date}` : "";
    const payload = await fetchJson(
      `${BASE_URL}/${path}/scoreboard${query}`,
      EspnProvider.config.timeoutMs,
    );
    return normalizeScoreboard(payload, sport);
  },

  async getScores(params: unknown): Promise<ProviderEvent[]> {
    return EspnProvider.getSchedule(params);
  },

  async getPlayerStats(providerEventId: string): Promise<ProviderPlayerStat[]> {
    const payload = await fetchJson(
      `${BASE_URL}/${SPORT_PATHS.nfl}/summary?event=${providerEventId}`,
      EspnProvider.config.timeoutMs,
    );
    return normalizeBoxScore(payload, providerEventId);
  },
};
