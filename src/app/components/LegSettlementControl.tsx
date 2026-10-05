"use client";

import { useTransition } from "react";
import type { LegSettlement } from "@/lib/types/domain";

/**
 * Settlement is manual-only until automatic settlement exists (docs/PRD.md
 * section 24, 53), so this writes `manualStatus`. "open" clears it back to
 * automatic rather than storing a value.
 */
const OPTIONS: { value: LegSettlement; glyph: string; label: string; active: string }[] = [
  { value: "open", glyph: "○", label: "Open", active: "bg-neutral-700 text-neutral-100" },
  { value: "won", glyph: "✓", label: "Won", active: "bg-emerald-600 text-white" },
  { value: "lost", glyph: "✕", label: "Lost", active: "bg-rose-700 text-white" },
  { value: "push", glyph: "=", label: "Push", active: "bg-amber-600 text-white" },
  { value: "void", glyph: "∅", label: "Void", active: "bg-neutral-600 text-neutral-200" },
];

export function LegSettlementControl({
  settlement,
  onChange,
}: {
  settlement: LegSettlement;
  onChange: (next: LegSettlement | null) => Promise<void>;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <div role="group" aria-label="Leg settlement" className="flex shrink-0 items-center gap-px">
      {OPTIONS.map((option) => {
        const isActive = settlement === option.value;
        return (
          <button
            key={option.value}
            type="button"
            title={option.label}
            aria-label={option.label}
            aria-pressed={isActive}
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                await onChange(option.value === "open" ? null : option.value);
              })
            }
            className={`h-5 w-5 rounded text-[11px] leading-none transition-colors disabled:opacity-50 ${
              isActive ? option.active : "text-neutral-600 hover:bg-white/10 hover:text-neutral-300"
            }`}
          >
            {option.glyph}
          </button>
        );
      })}
    </div>
  );
}
