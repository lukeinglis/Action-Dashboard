"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createBetLeg } from "@/app/tickets/actions";

export function NewLegForm({ ticketId }: { ticketId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [sport, setSport] = useState("nfl");
  const [marketType, setMarketType] = useState("moneyline");
  const [selection, setSelection] = useState("");
  const [line, setLine] = useState("");
  const [oddsAmerican, setOddsAmerican] = useState("");

  function submit() {
    startTransition(async () => {
      await createBetLeg({
        ticketId,
        sport,
        marketType,
        selection: selection || undefined,
        line: line === "" ? undefined : Number(line),
        oddsAmerican: oddsAmerican === "" ? undefined : Number(oddsAmerican),
      });
      setSelection("");
      setLine("");
      setOddsAmerican("");
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="space-y-3 rounded-lg border border-neutral-800 p-4"
    >
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-xs text-neutral-400">
          Sport
          <input
            value={sport}
            onChange={(e) => setSport(e.target.value)}
            required
            className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
          />
        </label>
        <label className="block text-xs text-neutral-400">
          Market type
          <input
            value={marketType}
            onChange={(e) => setMarketType(e.target.value)}
            required
            placeholder="moneyline, spread, custom…"
            className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
          />
        </label>
      </div>

      <label className="block text-xs text-neutral-400">
        Selection
        <input
          value={selection}
          onChange={(e) => setSelection(e.target.value)}
          placeholder="Vikings ML"
          className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-xs text-neutral-400">
          Line (optional)
          <input
            type="number"
            step="0.5"
            value={line}
            onChange={(e) => setLine(e.target.value)}
            className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
          />
        </label>
        <label className="block text-xs text-neutral-400">
          Odds (American, optional)
          <input
            type="number"
            value={oddsAmerican}
            onChange={(e) => setOddsAmerican(e.target.value)}
            className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
          />
        </label>
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-900 disabled:opacity-50"
      >
        {isPending ? "Saving…" : "Add Leg"}
      </button>
    </form>
  );
}
