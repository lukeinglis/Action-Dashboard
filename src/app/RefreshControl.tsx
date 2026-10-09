"use client";

// The `↻ Refresh Sports Data` control. See docs/PRD.md §22.
//
// Refresh is manual by design (§5.4), so this button is the only thing that
// pulls provider data, and §22 is specific about what has to be visible beside
// it: per-sport freshness, the count of overrides needing review, and a
// non-blocking error when a refresh fails.
//
// Nothing here throws on a failed refresh. The action returns a status per
// sport and the lines below the button report them, because §22 requires a
// failure to retain prior data and leave manual editing working — a thrown
// error would take the dashboard down with it.

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { refreshSports } from "./actions";
import { freshnessLines, type FreshnessTone } from "@/lib/sports/freshness-lines";
import { sportLabel } from "@/lib/sports/sport-keys";
import type { SportsRefreshState } from "@/lib/types/domain";
import type { RefreshSportsResult } from "./types";

const TONE_CLASS: Record<FreshnessTone, string> = {
  ok: "text-neutral-400",
  warning: "text-amber-300",
  error: "text-red-400",
  muted: "text-neutral-600",
};

interface Props {
  /** Stored per provider + sport freshness (§21). */
  refreshStates: SportsRefreshState[];
  /** Events whose manual override a newer automatic value has superseded (§45). */
  staleOverrideCount: number;
  /** Relevant sports no adapter covers, so refresh leaves them alone (§23). */
  unsupportedSports: string[];
  timeZone: string;
}

export function RefreshControl({ refreshStates, staleOverrideCount, unsupportedSports, timeZone }: Props) {
  const [pending, startTransition] = useTransition();
  const [lastResult, setLastResult] = useState<RefreshSportsResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function refresh() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await refreshSports();
        setLastResult(result);
        // The action revalidated the page; this pulls the newly written Event
        // values and freshness rows down without a full navigation.
        router.refresh();
      } catch (cause) {
        // Only reaches here if the action itself could not run — auth, or the
        // database being unreachable. Per-sport provider failures come back as
        // results, not exceptions.
        setError(cause instanceof Error ? cause.message : "Refresh failed");
      }
    });
  }

  // The result explains the refresh just clicked, so it has to expire. A
  // cooldown line in particular would otherwise sit there reading "wait 30s"
  // long after the 30 seconds were up; once it clears, the stored per-sport
  // freshness takes back over.
  const cooldownMs =
    Math.max(0, ...(lastResult?.results ?? []).map((r) => r.cooldownSecondsRemaining ?? 0)) * 1000;
  useEffect(() => {
    if (!lastResult || cooldownMs === 0) return;
    const timer = setTimeout(() => setLastResult(null), cooldownMs);
    return () => clearTimeout(timer);
  }, [lastResult, cooldownMs]);

  const lines = freshnessLines(refreshStates, timeZone, lastResult?.results ?? []);
  const results = lastResult?.results ?? [];
  const legsUpdated = results.reduce((total, r) => total + r.legsUpdated, 0);
  const ticketsSettled = results.reduce((total, r) => total + r.ticketsSettled, 0);

  // §22 degradation, made visible. The scores refreshed, so the sport's own
  // line reads "updated"; without this the props would just sit there with no
  // dot and no reason given.
  const statsUnavailable = results.some((r) => r.statsError != null);

  // §20.2: a prop whose player resolved to several candidates. Named rather
  // than counted — the name is what the user needs in order to correct it.
  const playersNeedingMatch = results.flatMap((r) => r.playersNeedingMatch.map((p) => p.name));
  const quota = lastResult?.quota;
  const quotaWarning =
    quota && quota.limit != null && quota.status !== "ok"
      ? `${quota.used}/${quota.limit} provider requests used today`
      : null;

  // Sports with exposure that no adapter covers. Named so the absence of a
  // freshness line for them reads as "by design" rather than "forgotten".
  const manualOnly = (lastResult?.unsupportedSports ?? unsupportedSports).map(sportLabel);

  return (
    <div className="flex flex-col items-end gap-0.5">
      <button
        type="button"
        onClick={refresh}
        disabled={pending}
        className="rounded border border-neutral-700 px-2 py-1 text-[11px] font-medium text-neutral-200 hover:bg-neutral-800 hover:text-neutral-50 disabled:cursor-not-allowed disabled:text-neutral-500"
      >
        {pending ? "Refreshing…" : "↻ Refresh Sports Data"}
      </button>

      <div className="flex flex-col items-end text-[10px] leading-tight">
        {lines.map((line) => (
          <span key={line.sport} className={TONE_CLASS[line.tone]}>
            {line.label} {line.detail}
          </span>
        ))}

        {manualOnly.length > 0 && (
          <span className="text-neutral-600">{manualOnly.join(", ")} manual only</span>
        )}

        {/* §26.1: the answer to "did my tickets move", which is the reason the
            user pressed the button at all. Silent at zero, since a refresh
            before kickoff legitimately moves nothing. */}
        {legsUpdated > 0 && (
          <span className="text-neutral-400">
            {legsUpdated} leg{legsUpdated === 1 ? "" : "s"} updated
          </span>
        )}

        {/* §25: the tickets that just closed out. Worth its own line — it is
            the difference between "the scores moved" and "this one is done". */}
        {ticketsSettled > 0 && (
          <span className="text-neutral-400">
            {ticketsSettled} ticket{ticketsSettled === 1 ? "" : "s"} settled
          </span>
        )}

        {statsUnavailable && <span className="text-amber-300">player stats unavailable</span>}

        {playersNeedingMatch.length > 0 && (
          <span className="text-amber-300">
            {playersNeedingMatch.length > 2
              ? `${playersNeedingMatch.length} players need matching`
              : `${playersNeedingMatch.join(", ")} needs matching`}
          </span>
        )}

        {quotaWarning && <span className="text-amber-300">{quotaWarning}</span>}

        {/* §45: a manual override a newer automatic value has superseded. The
            Events library is where each one is flagged and resolved. */}
        {staleOverrideCount > 0 && (
          <Link href="/events" className="text-amber-300 underline decoration-dotted hover:text-amber-200">
            {staleOverrideCount} {staleOverrideCount === 1 ? "override" : "overrides"} need review
          </Link>
        )}

        {error && (
          <span role="status" className="text-red-400">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
