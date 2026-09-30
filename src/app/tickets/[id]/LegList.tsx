"use client";

import { useTransition } from "react";
import type { BetLeg, LegSettlement } from "@/lib/types/domain";
import { legSettlement } from "@/lib/betting/derived-status";
import { deleteBetLeg, setManualLegStatus } from "@/app/tickets/actions";

const SETTLEMENTS: LegSettlement[] = ["open", "won", "lost", "push", "void"];

export function LegList({ legs }: { legs: BetLeg[] }) {
  const [isPending, startTransition] = useTransition();

  if (legs.length === 0) {
    return <p className="text-sm text-neutral-500">No legs yet.</p>;
  }

  return (
    <div className="space-y-2">
      {legs.map((leg) => (
        <div key={leg.id} className="rounded-lg border border-neutral-800 p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-neutral-100">
                {leg.selection ?? leg.rawDescription ?? leg.marketType}
              </p>
              <p className="text-xs text-neutral-500">
                {leg.marketType}
                {leg.line != null ? ` · ${leg.line}` : ""}
                {leg.oddsAmerican != null ? ` · ${leg.oddsAmerican > 0 ? "+" : ""}${leg.oddsAmerican}` : ""}
              </p>
            </div>
            <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300">
              {legSettlement(leg)}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs">
            <select
              value={leg.manualStatus ?? ""}
              disabled={isPending}
              onChange={(e) =>
                startTransition(() =>
                  setManualLegStatus(leg.id, (e.target.value || null) as LegSettlement | null),
                )
              }
              className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-neutral-300"
            >
              <option value="">Automatic</option>
              {SETTLEMENTS.map((s) => (
                <option key={s} value={s}>
                  Manual: {s}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={isPending}
              onClick={() => {
                if (!window.confirm("Delete this leg?")) return;
                startTransition(() => void deleteBetLeg(leg.id));
              }}
              className="rounded border border-neutral-700 px-2 py-1 text-neutral-300"
            >
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
