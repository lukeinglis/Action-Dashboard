// Freshness and refresh safety state. See docs/PRD.md §21 and §22.1.
//
// Freshness is tracked per provider + sport, never as one global timestamp, so
// the UI can say "NFL updated 4:18 PM / MLB failed" without hiding a partial
// failure behind a single "updated just now".
//
// The in-flight lock is the one piece here that has to be genuinely atomic. It
// is taken with a conditional UPDATE — `set in_progress_since = now where
// in_progress_since is null` — so the database decides the winner. A
// read-then-write would let two concurrent refreshes both see an idle row and
// both call the provider, which is exactly what the lock exists to prevent.

import type { SupabaseClient } from "@supabase/supabase-js";
import { toSportsRefreshState, type SportsRefreshStateRow } from "@/lib/db/rows";
import type { SportsRefreshState } from "@/lib/types/domain";

/** §22.1: a lock older than this is treated as stale and cleared. */
export const LOCK_STALE_AFTER_MS = 2 * 60 * 1000;

/** §22.1: the quota fraction at which the refresh control warns. */
export const QUOTA_WARNING_FRACTION = 0.8;

export interface RefreshStateKey {
  userId: string;
  providerKey: string;
  sport: string;
}

export async function listRefreshStates(
  supabase: SupabaseClient,
  userId: string,
): Promise<SportsRefreshState[]> {
  const { data, error } = await supabase
    .from("sports_refresh_state")
    .select("*")
    .eq("user_id", userId);
  if (error) throw error;
  return ((data ?? []) as SportsRefreshStateRow[]).map(toSportsRefreshState);
}

export interface ClaimResult {
  claimed: boolean;
  /**
   * The row as it stood at the moment the lock was taken. Cooldown and quota
   * are decided from this snapshot rather than a second read, so they see the
   * same state the lock was granted against.
   */
  state: SportsRefreshState | null;
}

/**
 * Takes the in-flight lock for one provider + sport. A second refresh for that
 * sport is refused while the lock is held (§22.1).
 */
export async function claimRefreshLock(
  supabase: SupabaseClient,
  key: RefreshStateKey,
  now: Date,
  staleAfterMs: number = LOCK_STALE_AFTER_MS,
): Promise<ClaimResult> {
  const nowIso = now.toISOString();

  // The row may not exist yet. `ignoreDuplicates` keeps an existing row — and
  // crucially its live lock — untouched, so this cannot stomp a refresh in
  // flight the way a plain upsert would.
  const { error: seedError } = await supabase.from("sports_refresh_state").upsert(
    {
      user_id: key.userId,
      provider_key: key.providerKey,
      sport: key.sport,
    },
    { onConflict: "user_id,provider_key,sport", ignoreDuplicates: true },
  );
  if (seedError) throw seedError;

  // Release an abandoned lock — a crashed refresh would otherwise wedge this
  // sport permanently. Conditional on the timestamp, so a live lock survives.
  const staleCutoff = new Date(now.getTime() - staleAfterMs).toISOString();
  const { error: staleError } = await supabase
    .from("sports_refresh_state")
    .update({ in_progress_since: null })
    .eq("user_id", key.userId)
    .eq("provider_key", key.providerKey)
    .eq("sport", key.sport)
    .lt("in_progress_since", staleCutoff);
  if (staleError) throw staleError;

  const { data, error } = await supabase
    .from("sports_refresh_state")
    .update({ in_progress_since: nowIso })
    .eq("user_id", key.userId)
    .eq("provider_key", key.providerKey)
    .eq("sport", key.sport)
    .is("in_progress_since", null)
    .select("*");
  if (error) throw error;

  const rows = (data ?? []) as SportsRefreshStateRow[];
  if (rows.length === 0) return { claimed: false, state: null };

  // The returned row already carries the new lock; the caller wants the
  // pre-claim view of everything else, which is what the other columns are.
  return { claimed: true, state: toSportsRefreshState(rows[0]) };
}

export interface ReleaseOutcome {
  /** Omitted leaves `last_success_at` and `last_error` alone. */
  success?: boolean;
  error?: string | null;
  /** Provider requests actually issued. Zero leaves the quota untouched. */
  requestCount?: number;
  /** The pre-claim snapshot, for the daily quota rollover. */
  previous?: SportsRefreshState | null;
}

/**
 * Clears the lock and records the outcome. Always called, including on the
 * paths that never reached the provider (cooldown, quota), because a lock left
 * behind would block this sport until it went stale.
 */
export async function releaseRefreshLock(
  supabase: SupabaseClient,
  key: RefreshStateKey,
  now: Date,
  outcome: ReleaseOutcome = {},
): Promise<void> {
  const nowIso = now.toISOString();
  const today = toUtcDateString(now);
  const requestCount = outcome.requestCount ?? 0;

  const update: Record<string, unknown> = { in_progress_since: null };

  if (requestCount > 0) {
    update.last_attempt_at = nowIso;
    update.last_request_count = requestCount;
    // The count resets on its own date rather than by a scheduled job, so a
    // day with no refresh at all cannot leave a stale count behind.
    const carried =
      outcome.previous?.requestsTodayDate === today ? outcome.previous.requestsTodayCount : 0;
    update.requests_today_count = carried + requestCount;
    update.requests_today_date = today;
  }

  if (outcome.success === true) {
    update.last_success_at = nowIso;
    update.last_error = null;
  } else if (outcome.success === false) {
    // §22 keeps prior data on failure, so last_success_at is deliberately left
    // in place: it is what the UI shows as "last successful update".
    update.last_error = outcome.error ?? "Refresh failed";
  }

  const { error } = await supabase
    .from("sports_refresh_state")
    .update(update)
    .eq("user_id", key.userId)
    .eq("provider_key", key.providerKey)
    .eq("sport", key.sport);
  if (error) throw error;
}

/** Whole seconds left before this sport may refresh again (§22.1 cooldown). */
export function cooldownSecondsRemaining(
  lastSuccessAt: string | null | undefined,
  minRefreshIntervalSeconds: number,
  now: Date,
): number {
  if (!lastSuccessAt) return 0;
  const elapsedMs = now.getTime() - new Date(lastSuccessAt).getTime();
  const remainingMs = minRefreshIntervalSeconds * 1000 - elapsedMs;
  return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
}

/**
 * Requests this provider has spent today, summed across its sports. §21 stores
 * the counter per provider + sport, but §22.1 skips *the provider* at 100%, so
 * the limit has to be evaluated against the provider's total.
 */
export function requestsUsedToday(
  states: SportsRefreshState[],
  providerKey: string,
  now: Date,
): number {
  const today = toUtcDateString(now);
  return states
    .filter((s) => s.providerKey === providerKey && s.requestsTodayDate === today)
    .reduce((total, s) => total + s.requestsTodayCount, 0);
}

export type QuotaStatus = "ok" | "warning" | "exhausted";

export function quotaStatus(used: number, limit: number | undefined): QuotaStatus {
  if (limit == null || limit <= 0) return "ok";
  if (used >= limit) return "exhausted";
  return used >= limit * QUOTA_WARNING_FRACTION ? "warning" : "ok";
}

/** UTC calendar date, matching the `date` column's own default of `current_date`. */
function toUtcDateString(now: Date): string {
  return now.toISOString().slice(0, 10);
}
