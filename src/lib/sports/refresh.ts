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
import { applyProviderEvents } from "@/lib/events/apply-provider-events";
import { updateLegStates } from "@/lib/betting/update-leg-states";
import type { ProviderEvent, SportsProvider } from "@/lib/providers/types";
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
  error?: string;
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
  scopes: SportScope[];
  now?: () => Date;
  /** Overridden only by tests, to exercise stale-lock recovery. */
  lockStaleAfterMs?: number;
}

export async function refreshSportsData(
  supabase: SupabaseClient,
  options: RefreshSportsDataOptions,
): Promise<RefreshSportsDataResult> {
  const { userId, timeZone, provider, scopes } = options;
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
    const { touchedEventIds, ...applied } = await applyProviderEvents(supabase, providerEvents, {
      userId,
      providerKey: provider.key,
      timeZone,
    });

    // The second half of what the refresh button promises: carry the new
    // scorelines through to the legs riding on them (§26.1). Kept inside the
    // same try so a failure here is reported as a failed refresh rather than
    // silently leaving legs stale behind updated Events.
    const legs = await updateLegStates(supabase, { userId, eventIds: touchedEventIds });

    return {
      sport: scope.sport,
      providerSport: scope.providerSport,
      status: "refreshed",
      requestCount,
      ...applied,
      legsUpdated: legs.updated,
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
    ...overrides,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
