"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { dollarsToCents, hasReturnMismatch } from "@/lib/betting/money";
import { createTicket } from "../actions";

export function NewTicketForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [name, setName] = useState("");
  const [sportsbook, setSportsbook] = useState("");
  const [stake, setStake] = useState("");
  const [toWin, setToWin] = useState("");
  const [totalReturn, setTotalReturn] = useState("");
  const [isBonusBet, setIsBonusBet] = useState(false);
  const [notes, setNotes] = useState("");

  const mismatch =
    stake !== "" &&
    toWin !== "" &&
    totalReturn !== "" &&
    hasReturnMismatch({
      stakeCents: dollarsToCents(Number(stake)),
      toWinCents: dollarsToCents(Number(toWin)),
      totalReturnCents: dollarsToCents(Number(totalReturn)),
      isBonusBet,
    });

  function submit() {
    startTransition(async () => {
      const created = await createTicket({
        name: name || undefined,
        sportsbook: sportsbook || undefined,
        stakeCents: dollarsToCents(Number(stake || 0)),
        toWinCents: dollarsToCents(Number(toWin || 0)),
        totalReturnCents: dollarsToCents(Number(totalReturn || 0)),
        isBonusBet,
        notes: notes || undefined,
      });
      router.push(`/tickets/${created.id}`);
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
      <label className="block text-xs text-neutral-400">
        Name (optional)
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
        />
      </label>

      <label className="block text-xs text-neutral-400">
        Sportsbook
        <input
          value={sportsbook}
          onChange={(e) => setSportsbook(e.target.value)}
          className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
        />
      </label>

      <div className="grid grid-cols-3 gap-3">
        <label className="block text-xs text-neutral-400">
          Stake ($)
          <input
            type="number"
            step="0.01"
            value={stake}
            onChange={(e) => setStake(e.target.value)}
            required
            className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
          />
        </label>
        <label className="block text-xs text-neutral-400">
          To Win ($)
          <input
            type="number"
            step="0.01"
            value={toWin}
            onChange={(e) => setToWin(e.target.value)}
            required
            className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
          />
        </label>
        <label className="block text-xs text-neutral-400">
          Total Return ($)
          <input
            type="number"
            step="0.01"
            value={totalReturn}
            onChange={(e) => setTotalReturn(e.target.value)}
            required
            className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
          />
        </label>
      </div>

      <label className="flex items-center gap-2 text-xs text-neutral-400">
        <input type="checkbox" checked={isBonusBet} onChange={(e) => setIsBonusBet(e.target.checked)} />
        Bonus bet
      </label>

      {mismatch && (
        <p className="text-xs text-amber-400">
          Total return doesn&apos;t equal stake + to win. It will still save.
        </p>
      )}

      <label className="block text-xs text-neutral-400">
        Notes
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
        />
      </label>

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-900 disabled:opacity-50"
      >
        {isPending ? "Saving…" : "Create Ticket"}
      </button>
    </form>
  );
}
