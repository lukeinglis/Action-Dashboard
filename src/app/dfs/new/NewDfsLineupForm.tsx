"use client";

// Minimal manual entry (docs/PRD.md section 43: "Entry methods: ... Manual")
// for a DFSLineup + slots + one DFSEntry. No Participant/Event matching
// here — that's the import pipeline's job.

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { dollarsToCents } from "@/lib/betting/money";
import { createManualDfsLineup, type ManualDfsSlotInput } from "../actions";

export function NewDfsLineupForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [platform, setPlatform] = useState("DraftKings");
  const [sport, setSport] = useState("football");
  const [slateName, setSlateName] = useState("");
  const [slots, setSlots] = useState<ManualDfsSlotInput[]>([{ slot: "", playerName: "", salary: undefined }]);
  const [contestName, setContestName] = useState("");
  const [entryFee, setEntryFee] = useState("");
  const [prize, setPrize] = useState("");

  function updateSlot(i: number, patch: Partial<ManualDfsSlotInput>) {
    setSlots((s) => s.map((slot, j) => (j === i ? { ...slot, ...patch } : slot)));
  }

  function submit() {
    startTransition(async () => {
      await createManualDfsLineup({
        lineup: { platform, sport, slateName: slateName || undefined },
        slots: slots.filter((s) => s.playerName.trim()),
        entry: {
          contestName: contestName || undefined,
          entryFeeCents: entryFee ? dollarsToCents(Number(entryFee)) : undefined,
          potentialPrizeCents: prize ? dollarsToCents(Number(prize)) : undefined,
        },
      });
      router.push("/");
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
          Platform
          <input
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            required
            className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
          />
        </label>
        <label className="block text-xs text-neutral-400">
          Sport
          <input
            value={sport}
            onChange={(e) => setSport(e.target.value)}
            required
            className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
          />
        </label>
      </div>

      <label className="block text-xs text-neutral-400">
        Slate
        <input
          value={slateName}
          onChange={(e) => setSlateName(e.target.value)}
          placeholder="Main Slate"
          className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
        />
      </label>

      <div className="space-y-2">
        <p className="text-xs font-medium text-neutral-400">Roster Slots</p>
        {slots.map((s, i) => (
          <div key={i} className="flex gap-2">
            <input
              placeholder="Slot (e.g. QB)"
              value={s.slot}
              onChange={(e) => updateSlot(i, { slot: e.target.value })}
              className="w-20 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm text-neutral-100"
            />
            <input
              placeholder="Player name"
              value={s.playerName}
              onChange={(e) => updateSlot(i, { playerName: e.target.value })}
              className="flex-1 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm text-neutral-100"
            />
            <input
              type="number"
              placeholder="Salary"
              value={s.salary ?? ""}
              onChange={(e) => updateSlot(i, { salary: e.target.value ? Number(e.target.value) : undefined })}
              className="w-24 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm text-neutral-100"
            />
            <button
              type="button"
              onClick={() => setSlots((s2) => s2.filter((_, j) => j !== i))}
              className="text-xs text-neutral-500 underline"
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setSlots((s) => [...s, { slot: "", playerName: "", salary: undefined }])}
          className="text-xs text-neutral-300 underline"
        >
          + Add Slot
        </button>
      </div>

      <label className="block text-xs text-neutral-400">
        Contest Name
        <input
          value={contestName}
          onChange={(e) => setContestName(e.target.value)}
          className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-xs text-neutral-400">
          Entry Fee ($)
          <input
            type="number"
            step="0.01"
            value={entryFee}
            onChange={(e) => setEntryFee(e.target.value)}
            className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
          />
        </label>
        <label className="block text-xs text-neutral-400">
          Prize ($)
          <input
            type="number"
            step="0.01"
            value={prize}
            onChange={(e) => setPrize(e.target.value)}
            className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
          />
        </label>
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-900 disabled:opacity-50"
      >
        {isPending ? "Saving…" : "Create DFS Lineup"}
      </button>
    </form>
  );
}
