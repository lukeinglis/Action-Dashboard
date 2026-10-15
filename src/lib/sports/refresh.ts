// Refresh orchestration. See docs/PRD.md §22 (behaviour) and §22.1 (safety).
//
// Sports refresh in parallel and each one owns its own outcome: a sport that
// fails or times out never prevents another from being written. §22 requires
// that a failed refresh retain prior data, show a non-blocking error, and leave
// manual editing working — so nothing here throws on a provider failure. Every
// sport comes back with a status the UI can render.
//
// The four safety rules of §22.1 are applied in a deliberate order per sport:
//
//   quota      -> before taking the lock, since an exhausted provider must not
//                 even look busy.
//   lock       -> atomically, so a double-click cannot double-fetch.
//   cooldown   -> from the snapshot the lock was granted against.
//   timeout    -> around the provider calls only, never around the writes.

import type { SupabaseClient } from "@supabase/supabase-js";
import { applyProviderEvents, type EventSlate } from "@/lib/events/apply-provider-events";
import { applyPlayerStats } from "@/lib/betting/apply-player-stats";
import { updateLegStates } from "@/lib/betting/update-leg-states";
import { syncTicketSettlement } from "@/lib/betting/settle-tickets";
import type {
  PlayerStatsProvider,
  ProviderEvent,
  ProviderPlayerStat,
  SportsProvider,
} from "@/lib/providers/types";
import {
  claimRefreshLock,
  cooldownSecondsRemaining,
  listRefreshStates,
  quotaStatus,
  releaseRefreshLock,
  requestsUsedToday,
  type QuotaStatus,
} from "./refresh-state";
import type { SportScope } from "./refresh-scope";

export type SkipReason = "unsupported" | "quota" | "in_progress" | "cooldown";

export interface SportRefreshResult {
  /** Internal `events.sport`. */
  sport: string;
  providerSport: string;
  status: "refreshed" | "skipped" | "failed";
  skipReason?: SkipReason;
  /** Seconds until this sport may refresh again, when skipped for cooldown. */
  cooldownSecondsRemaining?: number;
  /** Provider requests actually issued. */
  requestCount: number;
  /**
   * When this sport refreshed successfully, matching the `last_success_at` just
   * stored. Present so the UI can show "NFL updated 4:18 PM" straight away,
   * without waiting for the page to re-read the state it just wrote.
   */
  refreshedAt?: string;
  updated: number;
  unchanged: number;
  eventMappingsCreated: number;
  teamMappingsCreated: number;
  /** Provider records with no single internal Event to write to (§20.2). */
  needsMatch: { providerEventId: string; name: string; candidateEventIds: string[] }[];
  lostMappingEventIds: string[];
  /**
   * Bet legs whose live state moved as a result of this refresh (§26.1). The
   * number the user actually cares about: a refresh that updates a scoreline
   * but no leg has not answered "is my ticket winning".
   */
  legsUpdated: number;
  /**
   * Tickets this refresh closed out: their last open leg graded, so §25's
   * `settledAt` was stamped and the card leaves the dashboard at the next
   * rollover. The end of what the refresh button promises.
   */
  ticketsSettled: number;
  /** Participant -> provider player mappings created by the stats provider (§20.2). */
  participantMappingsCreated: number;
  /** Prop participants the stats provider could not resolve to one player. */
  playersNeedingMatch: { participantId: string; name: string; candidateProviderIds: string[] }[];
  error?: string;
  /**
   * Why the player stats are missing, when the scores refreshed fine. Kept
   * apart from `error` on purpose: the scoreline did update, so calling the
   * whole sport failed would be a lie, and it must not be recorded as the
   * provider's last error either. Props are simply silent this time round.
   */
  statsError?: string;
}

export interface RefreshSportsDataResult {
  providerKey: string;
  results: SportRefreshResult[];
  quota: { used: number; limit?: number; status: QuotaStatus };
}

export interface RefreshSportsDataOptions {
  userId: string;
  timeZone: string;
  provider: SportsProvider;
  /**
   * Optional second source for the numbers a scoreline cannot give: a player's
   * own stat line (§30). Separate from `provider` because the score source and
   * the stat source are different services with different coverage — ESPN has
   * every sport the user tracks, Sleeper has NFL players. A sport it does not
   * support refreshes exactly as before, with its props left silent.
   */
  statsProvider?: PlayerStatsProvider;
  scopes: SportScope[];
  now?: () => Date;
  /** Overridden only by tests, to exercise stale-lock recovery. */
  lockStaleAfterMs?: number;
}

export async function refreshSportsData(
  supabase: SupabaseClient,
  options: RefreshSportsDataOptions,
): Promise<RefreshSportsDataResult> {
  const { userId, timeZone, provider, statsProvider, scopes } = options;
  const now = options.now ?? (() => new Date());
  const providerKey = provider.key;
  const limit = provider.config.dailyRequestLimit;

  const states = await listRefreshStates(supabase, userId);
  const usedBefore = requestsUsedToday(states, providerKey, now());

  // Every sport reads the same starting count, so parallel sports could in
  // principle overshoot a limit between them. Tracking it exactly would need a
  // single counter row and would serialise the refresh; overshooting by the
  // number of sports in scope is the better trade, and the 80% warning exists
  // so the limit is approached visibly rather than hit by surprise.
  const settled = await Promise.allSettled(
    scopes.map((scope) =>
      refreshOneSport(supabase, scope, {
        userId,
        timeZone,
        provider,
        statsProvider,
        now,
        lockStaleAfterMs: options.lockStaleAfterMs,
        quotaExhausted: quotaStatus(usedBefore, limit) === "exhausted",
      }),
    ),
  );

  const results = settled.map((outcome, i) =>
    outcome.status === "fulfilled"
      ? outcome.value
      : // refreshOneSport is written not to throw; this is the backstop that
        // keeps one unexpected failure from losing every other sport's result.
        emptyResult(scopes[i], {
          status: "failed",
          error: errorMessage(outcome.reason),
        }),
  );

  const spent = results.reduce((total, r) => total + r.requestCount, 0);
  const used = usedBefore + spent;

  return { providerKey, results, quota: { used, limit, status: quotaStatus(used, limit) } };
}

interface OneSportContext {
  userId: string;
  timeZone: string;
  provider: SportsProvider;
  statsProvider?: PlayerStatsProvider;
  now: () => Date;
  lockStaleAfterMs?: number;
  quotaExhausted: boolean;
}

async function refreshOneSport(
  supabase: SupabaseClient,
  scope: SportScope,
  context: OneSportContext,
): Promise<SportRefreshResult> {
  const { userId, provider, now } = context;
  const key = { userId, providerKey: provider.key, sport: scope.sport };

  if (!provider.supportsSport(scope.providerSport)) {
    return emptyResult(scope, { status: "skipped", skipReason: "unsupported" });
  }

  // §22.1: at 100% of the daily limit the provider is skipped and manual
  // editing continues. Checked before the lock so an exhausted provider never
  // makes a sport look busy to a concurrent request.
  if (context.quotaExhausted) {
    return emptyResult(scope, { status: "skipped", skipReason: "quota" });
  }

  const claim = await claimRefreshLock(supabase, key, now(), context.lockStaleAfterMs);
  if (!claim.claimed) {
    return emptyResult(scope, { status: "skipped", skipReason: "in_progress" });
  }

  let result: SportRefreshResult;
  try {
    const remaining = cooldownSecondsRemaining(
      claim.state?.lastSuccessAt,
      provider.config.minRefreshIntervalSeconds,
      now(),
    );
    result =
      remaining > 0
        ? emptyResult(scope, {
            status: "skipped",
            skipReason: "cooldown",
            cooldownSecondsRemaining: remaining,
          })
        : await fetchAndApply(supabase, scope, context);
  } catch (error) {
    // fetchAndApply reports provider and write failures itself; this is the
    // backstop that still gets the lock released if anything else goes wrong.
    result = emptyResult(scope, { status: "failed", error: errorMessage(error) });
  }

  const releasedAt = now();
  try {
    await releaseRefreshLock(supabase, key, releasedAt, {
      // A skip never reached the provider, so it records no outcome: §22 keeps
      // prior data, and `lastSuccessAt` is what the UI shows as the last
      // successful update.
      success: result.status === "skipped" ? undefined : result.status === "refreshed",
      error: result.error,
      requestCount: result.requestCount,
      previous: claim.state,
    });
  } catch (error) {
    // The writes already landed, so the result stands. The lock self-clears
    // after LOCK_STALE_AFTER_MS, which is exactly the case staleness covers.
    return { ...result, error: result.error ?? errorMessage(error) };
  }

  // The same instant `last_success_at` now holds, so the freshness line the
  // user sees matches the row rather than approximating it.
  if (result.status === "refreshed") return { ...result, refreshedAt: releasedAt.toISOString() };
  return result;
}

async function fetchAndApply(
  supabase: SupabaseClient,
  scope: SportScope,
  context: OneSportContext,
): Promise<SportRefreshResult> {
  const { userId, timeZone, provider } = context;
  const getScores = provider.getScores ?? provider.getSchedule;

  // No relevant date means a TBD start time: the provider's current slate is
  // the best answer available, and is how the start time gets filled in.
  const dates: (string | undefined)[] =
    scope.localDates.length > 0 ? scope.localDates.map(toProviderDate) : [undefined];

  let requestCount = 0;
  const providerEvents: ProviderEvent[] = [];

  try {
    for (const date of dates) {
      const batch = await withTimeout(
        getScores.call(provider, { sport: scope.providerSport, date }),
        provider.config.timeoutMs,
        `${provider.key} ${scope.providerSport}`,
      );
      requestCount += 1;
      providerEvents.push(...batch);
    }
  } catch (error) {
    // Partial results are discarded rather than written: a slate missing half
    // its games would otherwise look like games that stopped being reported.
    return emptyResult(scope, {
      status: "failed",
      requestCount,
      error: errorMessage(error),
    });
  }

  try {
    const { touchedEventIds, eventSlates, ...applied } = await applyProviderEvents(
      supabase,
      providerEvents,
      { userId, providerKey: provider.key, timeZone },
    );

    // Player stats come from a different service, so they are fetched and
    // degraded on their own: Sleeper being down must not cost the user their
    // scorelines. Their requests are deliberately left out of `requestCount`,
    // which counts against `provider`'s daily limit and not another service's.
    //
    // Fetched *after* matching rather than alongside the scores, because which
    // weeks to ask for is only known once the provider's games have been tied
    // to Events.
    const players = await fetchPlayerStats(scope, context, eventSlates);

    const stats = context.statsProvider
      ? await applyPlayerStatsBySlate(supabase, players.statsBySlate, {
          userId,
          providerKey: context.statsProvider.key,
          sport: scope.sport,
          eventSlates,
          touchedEventIds,
        })
      : null;

    // The second half of what the refresh button promises: carry the new
    // scorelines through to the legs riding on them (§26.1). Kept inside the
    // same try so a failure here is reported as a failed refresh rather than
    // silently leaving legs stale behind updated Events.
    const legs = await updateLegStates(supabase, {
      userId,
      eventIds: touchedEventIds,
      playerStatsByEvent: stats?.statsByEvent,
    });

    // The last link in the chain: a graded leg has to close the Ticket it
    // belongs to, or the card stays on the dashboard forever (§25).
    const tickets = await syncTicketSettlement(supabase, { userId, eventIds: touchedEventIds });

    return {
      sport: scope.sport,
      providerSport: scope.providerSport,
      status: "refreshed",
      requestCount,
      ...applied,
      legsUpdated: legs.updated,
      ticketsSettled: tickets.settled,
      participantMappingsCreated: stats?.participantMappingsCreated ?? 0,
      playersNeedingMatch: stats?.needsMatch ?? [],
      statsError: players.error,
    };
  } catch (error) {
    // Caught here rather than by the backstop so the requests already spent
    // still count against the quota.
    return emptyResult(scope, {
      status: "failed",
      requestCount,
      error: errorMessage(error),
    });
  }
}

/**
 * One published stat slate, in the vocabulary the stats provider takes. The
 * score provider reports the season as a year, the stats provider addresses it
 * as a string, and this is the single place that reconciles them.
 */
interface StatSlate {
  season: string;
  week: number;
  seasonType?: string;
}

/** `season/seasonType/week`, the identity of one slate. */
function slateKey(slate: StatSlate): string {
  return `${slate.season}/${slate.seasonType ?? "regular"}/${slate.week}`;
}

function toStatSlate(slate: EventSlate): StatSlate {
  return { season: String(slate.season), week: slate.week, seasonType: slate.seasonType };
}

/**
 * This sport's player stat lines, keyed by the slate they belong to, or why
 * there are none.
 *
 * One request per distinct slate in the refresh, which is what makes settling a
 * past week possible at all: stats are published per week, so a prop on a game
 * from ten days ago can only be graded from that game's own week. Asking for
 * the *current* week instead — as this did — returns another slate's numbers,
 * or none at all before the next kickoff, which left every past prop silent and
 * every ticket holding one permanently open.
 *
 * Falls back to the provider's current week when the score provider reported no
 * slate for anything (another sport's adapter, or a refresh that matched no
 * games), so a live slate keeps behaving as before.
 *
 * Never throws and never reports a failure as the sport's failure. A missing
 * stats provider, an unsupported sport, and a service that is down are the same
 * outcome for the user — props stay silent — and none of them should cost them
 * the scores that did arrive.
 */
async function fetchPlayerStats(
  scope: SportScope,
  context: OneSportContext,
  eventSlates: EventSlate[],
): Promise<{ statsBySlate: Map<string, ProviderPlayerStat[]>; error?: string }> {
  const { statsProvider } = context;
  const empty = new Map<string, ProviderPlayerStat[]>();
  if (!statsProvider || !statsProvider.supportsSport(scope.providerSport)) {
    return { statsBySlate: empty };
  }

  const label = `${statsProvider.key} ${scope.providerSport}`;
  try {
    const slates = new Map(eventSlates.map((s) => [slateKey(toStatSlate(s)), toStatSlate(s)]));
    if (slates.size === 0) {
      const current = await withTimeout(
        statsProvider.getCurrentWeek(),
        statsProvider.config.timeoutMs,
        label,
      );
      slates.set(slateKey(current), current);
    }

    const statsBySlate = new Map<string, ProviderPlayerStat[]>();
    for (const [key, slate] of slates) {
      statsBySlate.set(
        key,
        await withTimeout(
          statsProvider.getWeekPlayerStats(slate),
          statsProvider.config.timeoutMs,
          label,
        ),
      );
    }
    return { statsBySlate };
  } catch (error) {
    return { statsBySlate: empty, error: errorMessage(error) };
  }
}

/**
 * Resolves each slate's stat lines and fans them back out per Event.
 *
 * The participant matching is per slate because that is how the numbers arrive,
 * but a leg is linked to an Event, so the result has to be addressable the way
 * updateLegStates reads it. Events sharing a week share the same map rather
 * than a copy of it.
 */
async function applyPlayerStatsBySlate(
  supabase: SupabaseClient,
  statsBySlate: Map<string, ProviderPlayerStat[]>,
  params: {
    userId: string;
    providerKey: string;
    sport: string;
    eventSlates: EventSlate[];
    /** Used only for the no-slate fallback, where one fetch answers for all. */
    touchedEventIds: string[];
  },
): Promise<{
  statsByEvent: Map<string, Map<string, Record<string, number>>>;
  participantMappingsCreated: number;
  needsMatch: SportRefreshResult["playersNeedingMatch"];
}> {
  const bySlate = new Map<string, Map<string, Record<string, number>>>();
  let participantMappingsCreated = 0;
  const needsMatch = new Map<string, SportRefreshResult["playersNeedingMatch"][number]>();

  for (const [key, stats] of statsBySlate) {
    // Sequential on purpose: each call creates participant mappings and the
    // next one must see them, or two slates would both try to claim the same
    // participant and the second insert would collide.
    const applied = await applyPlayerStats(supabase, stats, {
      userId: params.userId,
      providerKey: params.providerKey,
      sport: params.sport,
    });
    bySlate.set(key, applied.statsByParticipant);
    participantMappingsCreated += applied.participantMappingsCreated;
    // Deduplicated: the same unresolved player would otherwise be reported once
    // per week in scope.
    for (const player of applied.needsMatch) needsMatch.set(player.participantId, player);
  }

  const statsByEvent = new Map<string, Map<string, Record<string, number>>>();

  if (params.eventSlates.length === 0) {
    // No slate reported, so the one set fetched is the only answer there is and
    // it stands for every Event in the refresh — the behaviour before weeks
    // were threaded through, kept for adapters that do not report them.
    const only = [...bySlate.values()][0];
    if (only) for (const eventId of params.touchedEventIds) statsByEvent.set(eventId, only);
  } else {
    for (const slate of params.eventSlates) {
      const stats = bySlate.get(slateKey(toStatSlate(slate)));
      if (stats) statsByEvent.set(slate.eventId, stats);
    }
  }

  return { statsByEvent, participantMappingsCreated, needsMatch: [...needsMatch.values()] };
}

/** YYYY-MM-DD -> the compact YYYYMMDD form adapters take for a `date` param. */
function toProviderDate(localDate: string): string {
  return localDate.replace(/-/g, "");
}

/**
 * Rejects if `promise` has not settled within `ms`. §22.1 gives each sport its
 * own timeout; an adapter is expected to abort its own requests, but this is
 * what stops one that does not from holding the whole refresh open.
 */
async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label}: timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function emptyResult(
  scope: SportScope,
  overrides: Partial<SportRefreshResult> & Pick<SportRefreshResult, "status">,
): SportRefreshResult {
  return {
    sport: scope.sport,
    providerSport: scope.providerSport,
    requestCount: 0,
    updated: 0,
    unchanged: 0,
    eventMappingsCreated: 0,
    teamMappingsCreated: 0,
    needsMatch: [],
    lostMappingEventIds: [],
    legsUpdated: 0,
    ticketsSettled: 0,
    participantMappingsCreated: 0,
    playersNeedingMatch: [],
    ...overrides,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
