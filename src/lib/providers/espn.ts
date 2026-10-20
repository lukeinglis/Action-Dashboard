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
//
//      One opt-out, `allowEmptySlate`: a caller naming a *past* date is asking
//      about a day that may genuinely have had no games, so for it an empty
//      slate is an answer rather than a fault. The guard stays on by default,
//      and stays on unconditionally for a payload that lists events none of
//      which are usable — that is a shape change, not an empty day.

import {
  DEFAULT_PROVIDER_CONFIG,
  type ProviderEvent,
  type ProviderPlayerStat,
  type ProviderScoringPlay,
  type ScoringPlayKind,
  type SeasonType,
  type SportsProvider,
} from "./types";
import type { EventStatus } from "@/lib/types/domain";

export const ESPN_PROVIDER_KEY = "espn";

const BASE_URL = "https://site.api.espn.com/apis/site/v2/sports";

/**
 * Sport key -> ESPN path segment.
 *
 * College football, college basketball and the Premier League are here because
 * `supportsSport` reads straight off this table: an absent key made refresh skip
 * the sport outright, so every NCAAF and EPL leg was structurally ungradeable
 * rather than merely unmatched. All of these endpoints sit on the same free,
 * unauthenticated host as the NFL one, so none costs anything beyond the
 * per-sport requests §22.1 already counts.
 *
 * Note the men's college basketball segment is `mens-college-basketball`, not
 * the `college-basketball` that the football key's shape suggests — the latter
 * is a 400 from ESPN, and a wrong segment here reads as "the provider is down"
 * rather than as a typo.
 */
const SPORT_PATHS: Record<string, string> = {
  nfl: "football/nfl",
  "college-football": "football/college-football",
  "mens-college-basketball": "basketball/mens-college-basketball",
  golf: "golf/pga",
  "eng.1": "soccer/eng.1",
};

/** ESPN league label, for the non-team match key (§20.2). */
const SPORT_LEAGUES: Record<string, string> = {
  nfl: "NFL",
  "college-football": "NCAAF",
  "mens-college-basketball": "NCAAB",
  golf: "PGA",
  "eng.1": "Premier League",
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
  week?: { number?: number };
  season?: { year?: number; type?: number };
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

/**
 * ESPN's numeric season type -> the provider-neutral phase.
 *
 * Only the three phases a stat line can belong to are mapped; anything else
 * (ESPN also uses 4 for the Pro Bowl and 5 for offseason) yields undefined, so
 * the caller falls back rather than asking a stats provider for a slate that
 * does not exist.
 */
function mapSeasonType(type: number | undefined): SeasonType | undefined {
  if (type === 1) return "pre";
  if (type === 2) return "regular";
  if (type === 3) return "post";
  return undefined;
}

interface EspnScoreboard {
  events?: EspnEvent[];
}

function parseScore(raw: string | undefined): number | undefined {
  if (raw == null || raw === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

export interface NormalizeScoreboardOptions {
  /**
   * Accept a slate ESPN itself reported as empty, instead of treating it as a
   * failure.
   *
   * Off by default, because for the *current* slate an empty result is the
   * Sept-2026 regression this module exists to guard against (see the header),
   * and several projects silently stored zero events through it.
   *
   * On for a dated historical probe, where no games is the ordinary answer and
   * not a fault: `college-football?dates=20261018` (the Sunday after a Saturday
   * slate) and `eng.1?dates=20261009` both return `events: []` today. Without
   * this, walking a date window to find a past game throws on most of the dates
   * it tries, and the one real answer is lost among the noise.
   *
   * Note this only ever relaxes the *empty* case. A payload carrying events of
   * which none are usable is a shape change whatever the caller asked for, so it
   * still throws — that is the failure mode worth never papering over.
   */
  allowEmptySlate?: boolean;
}

/**
 * Scoreboard payload -> ProviderEvent[]. Pure, so it can be tested against a
 * captured payload with no network.
 */
export function normalizeScoreboard(
  payload: unknown,
  sport: string,
  options: NormalizeScoreboardOptions = {},
): ProviderEvent[] {
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
      // The slate this game belongs to, which is what a stats provider keys a
      // player's numbers by. Read off the event rather than the scoreboard's
      // top-level `week`, so a payload spanning a week boundary still attributes
      // each game correctly.
      season: event.season?.year,
      week: event.week?.number,
      seasonType: mapSeasonType(event.season?.type),
    });
  }

  // ESPN listed games but none survived normalization — every one lacked an id.
  // That is a payload shape change, not an empty slate, so it is an error even
  // for a caller that tolerates empty ones.
  if (out.length === 0 && events.length > 0) {
    throw new Error(
      `ESPN ${sport}: payload listed ${events.length} event(s) but none were usable`,
    );
  }

  if (out.length === 0 && !options.allowEmptySlate) {
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

interface EspnScoringPlay {
  type?: { text?: string };
  text?: string;
  period?: { number?: number };
  clock?: { displayValue?: string };
  team?: { id?: string; abbreviation?: string };
}

/**
 * Which score this was. ESPN spells the type out in prose ("Rushing
 * Touchdown", "Field Goal Good"), and adds wordings without notice, so this
 * matches on the part that carries the meaning rather than on an exact name.
 */
function scoringPlayKind(typeText: string | undefined): ScoringPlayKind {
  const text = (typeText ?? "").toLowerCase();
  if (text.includes("touchdown")) return "touchdown";
  if (text.includes("field goal")) return "field_goal";
  return "other";
}

/**
 * The player credited with the score, read out of ESPN's play text.
 *
 * There is no athlete id anywhere in an NFL scoring play, so the name in the
 * prose is the only identification available. Every scoring wording ESPN uses
 * leads with the scorer and then the yardage:
 *
 *   "Derrick Henry 5 Yd Rush (Tyler Loop Kick)"
 *   "Zay Flowers 19 Yd pass from Lamar Jackson"      <- receiver scores
 *   "Tyler Loop 64 Yd Field Goal"
 *
 * which is why the yardage is the delimiter. A wording this cannot read yields
 * no name at all, which leaves the leg silent — the safe failure, since the
 * alternative is grading a bet against the wrong player.
 */
export function scoringPlayScorer(text: string | undefined): string | undefined {
  const match = /^(.+?)\s+-?\d+\s+Yd\b/i.exec(text ?? "");
  return match?.[1]?.trim() || undefined;
}

/** `summary?event=` payload -> the game's scores in order. */
export function normalizeScoringPlays(
  payload: unknown,
  providerEventId: string,
): ProviderScoringPlay[] {
  const plays = (payload as { scoringPlays?: EspnScoringPlay[] } | null)?.scoringPlays;
  // Distinguished from a scoreless game on purpose: a payload with no
  // scoringPlays key at all is a shape change or an error body, and must not
  // be read as "nobody has scored" — which would settle every first-scorer leg
  // as a loss.
  if (!Array.isArray(plays)) {
    throw new Error(`ESPN scoring plays ${providerEventId}: payload has no scoringPlays`);
  }

  return plays.map((play, i) => ({
    sequence: i + 1,
    kind: scoringPlayKind(play.type?.text),
    scorerName: scoringPlayScorer(play.text),
    teamAbbreviation: play.team?.abbreviation,
    teamProviderId: play.team?.id,
    period: play.period?.number,
    clock: play.clock?.displayValue,
  }));
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

/**
 * The calendar ESPN buckets a scoreboard day by — measured, not assumed.
 *
 * `college-football?dates=20261017` returns 52 games, 9 of which carry UTC dates
 * on the 18th (a 02:15Z kickoff is Saturday 10:15pm ET); grouped by Eastern date
 * all 52 fall on the 17th. `nfl?dates=20261004` behaves the same way for the
 * Sunday-night game.
 */
const ESPN_SLATE_TIME_ZONE = "America/New_York";

/**
 * The `dates=` value for the slate containing `instantUtc`, or undefined if that
 * instant can't be read.
 *
 * Converting through Eastern rather than slicing the ISO string matters: a
 * Saturday 10:15pm ET kickoff is `2026-10-18T02:15Z`, so a UTC slice asks for
 * `dates=20261018` — which returns zero events, because ESPN filed that game
 * under the 17th. Every late kickoff would be invisible: 9 of 52 on that college
 * slate, and the NFL's Sunday- and Monday-night games every week.
 */
export function espnSlateDate(instantUtc: string): string | undefined {
  const instant = new Date(instantUtc);
  if (Number.isNaN(instant.getTime())) return undefined;
  // en-CA formats as YYYY-MM-DD, so this needs no manual padding.
  return instant
    .toLocaleDateString("en-CA", { timeZone: ESPN_SLATE_TIME_ZONE })
    .replace(/-/g, "");
}

export interface EspnScheduleParams {
  sport: string;
  /** YYYYMMDD. Omit for the current slate. Ranges are not supported upstream. */
  date?: string;
  /**
   * Treat a slate ESPN reports as empty as "no games" rather than a failure.
   * See `NormalizeScoreboardOptions.allowEmptySlate` — only meaningful with a
   * `date`, since an empty *current* slate is the regression we guard against.
   */
  allowEmptySlate?: boolean;
}

export const EspnProvider: SportsProvider = {
  key: ESPN_PROVIDER_KEY,
  config: DEFAULT_PROVIDER_CONFIG,

  supportsSport(sport: string): boolean {
    return sport in SPORT_PATHS;
  },

  async getSchedule(params: unknown): Promise<ProviderEvent[]> {
    const { sport, date, allowEmptySlate } = params as EspnScheduleParams;
    const path = SPORT_PATHS[sport];
    if (!path) throw new Error(`ESPN: unsupported sport "${sport}"`);

    const query = date ? `?dates=${date}` : "";
    const payload = await fetchJson(
      `${BASE_URL}/${path}/scoreboard${query}`,
      EspnProvider.config.timeoutMs,
    );
    return normalizeScoreboard(payload, sport, { allowEmptySlate });
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

  async getScoringPlays(params: {
    sport: string;
    providerEventId: string;
  }): Promise<ProviderScoringPlay[]> {
    const path = SPORT_PATHS[params.sport];
    if (!path) throw new Error(`ESPN: unsupported sport "${params.sport}"`);

    const payload = await fetchJson(
      `${BASE_URL}/${path}/summary?event=${params.providerEventId}`,
      EspnProvider.config.timeoutMs,
    );
    return normalizeScoringPlays(payload, params.providerEventId);
  },
};
