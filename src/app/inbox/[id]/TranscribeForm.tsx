"use client";

import { useState, useTransition } from "react";
import { dollarsToCents } from "@/lib/betting/money";
import { approveImportRecord, deleteImportRecord, rejectImportRecord } from "../actions";

export function TranscribeForm({
  importRecordId,
  storagePath,
}: {
  importRecordId: string;
  storagePath: string | null;
}) {
  const [isPending, startTransition] = useTransition();

  const [sportsbook, setSportsbook] = useState("");
  const [stake, setStake] = useState("");
  const [toWin, setToWin] = useState("");
  const [totalReturn, setTotalReturn] = useState("");
  const [isBonusBet, setIsBonusBet] = useState(false);
  const [notes, setNotes] = useState("");

  function approve() {
    startTransition(() => {
      void approveImportRecord(importRecordId, storagePath, {
        sportsbook: sportsbook || undefined,
        stakeCents: dollarsToCents(Number(stake || 0)),
        toWinCents: dollarsToCents(Number(toWin || 0)),
        totalReturnCents: dollarsToCents(Number(totalReturn || 0)),
        isBonusBet,
        notes: notes || undefined,
      });
    });
  }

  return (
    <div className="space-y-3 rounded-lg border border-neutral-800 p-4">
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

      <label className="block text-xs text-neutral-400">
        Notes
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
        />
      </label>

      <div className="flex gap-2 pt-2">
        <button
          type="button"
          disabled={isPending || !stake || !toWin || !totalReturn}
          onClick={approve}
          className="flex-1 rounded bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-900 disabled:opacity-50"
        >
          {isPending ? "Saving…" : "Approve & Create Ticket"}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            if (!window.confirm("Reject this screenshot? The image will be deleted.")) return;
            startTransition(() => void rejectImportRecord(importRecordId, storagePath));
          }}
          className="rounded border border-neutral-700 px-3 py-2 text-sm text-neutral-300"
        >
          Reject
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            if (!window.confirm("Delete this Inbox item? The image will be deleted.")) return;
            startTransition(() => void deleteImportRecord(importRecordId, storagePath));
          }}
          className="rounded border border-neutral-700 px-3 py-2 text-sm text-neutral-300"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
