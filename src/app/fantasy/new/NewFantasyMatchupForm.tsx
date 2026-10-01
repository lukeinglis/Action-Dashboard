"use client";

// Minimal manual entry (docs/PRD.md section 43: "Entry methods: ... Manual")
// for a FantasyLeague + FantasyMatchup + starters/opponent starters. No
// Participant/Event matching here — that's the import pipeline's job.

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createManualFantasyMatchup, type ManualFantasyStarterInput } from "../actions";

function StarterListEditor({
  label,
  starters,
  onChange,
}: {
  label: string;
  starters: ManualFantasyStarterInput[];
  onChange: (next: ManualFantasyStarterInput[]) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-neutral-400">{label}</p>
      {starters.map((s, i) => (
        <div key={i} className="flex gap-2">
          <input
            placeholder="Slot (e.g. QB)"
            value={s.slot}
            onChange={(e) => onChange(starters.map((s2, j) => (j === i ? { ...s2, slot: e.target.value } : s2)))}
            className="w-24 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm text-neutral-100"
          />
          <input
            placeholder="Player name"
            value={s.playerName}
            onChange={(e) =>
              onChange(starters.map((s2, j) => (j === i ? { ...s2, playerName: e.target.value } : s2)))
            }
            className="flex-1 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm text-neutral-100"
          />
          <button
            type="button"
            onClick={() => onChange(starters.filter((_, j) => j !== i))}
            className="text-xs text-neutral-500 underline"
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...starters, { slot: "", playerName: "" }])}
        className="text-xs text-neutral-300 underline"
      >
        + Add Starter
      </button>
    </div>
  );
}

export function NewFantasyMatchupForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [leagueName, setLeagueName] = useState("");
  const [platform, setPlatform] = useState("");
  const [sport, setSport] = useState("football");
  const [season, setSeason] = useState(String(new Date().getFullYear()));
  const [week, setWeek] = useState("");
  const [userTeamName, setUserTeamName] = useState("");
  const [opponentTeamName, setOpponentTeamName] = useState("");
  const [starters, setStarters] = useState<ManualFantasyStarterInput[]>([{ slot: "", playerName: "" }]);
  const [opponentStarters, setOpponentStarters] = useState<ManualFantasyStarterInput[]>([
    { slot: "", playerName: "" },
  ]);

  function submit() {
    startTransition(async () => {
      await createManualFantasyMatchup({
        league: { name: leagueName, platform: platform || undefined, sport, season, userTeamName },
        matchup: {
          week: week ? Number(week) : undefined,
          userTeamName,
          opponentTeamName,
        },
        starters: starters.filter((s) => s.playerName.trim()),
        opponentStarters: opponentStarters.filter((s) => s.playerName.trim()),
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
      <label className="block text-xs text-neutral-400">
        League Name
        <input
          value={leagueName}
          onChange={(e) => setLeagueName(e.target.value)}
          required
          className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-xs text-neutral-400">
          Platform
          <input
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            placeholder="Sleeper, ESPN, Yahoo…"
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

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-xs text-neutral-400">
          Season
          <input
            value={season}
            onChange={(e) => setSeason(e.target.value)}
            required
            className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
          />
        </label>
        <label className="block text-xs text-neutral-400">
          Week
          <input
            type="number"
            value={week}
            onChange={(e) => setWeek(e.target.value)}
            className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-xs text-neutral-400">
          My Team
          <input
            value={userTeamName}
            onChange={(e) => setUserTeamName(e.target.value)}
            required
            className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
          />
        </label>
        <label className="block text-xs text-neutral-400">
          Opponent
          <input
            value={opponentTeamName}
            onChange={(e) => setOpponentTeamName(e.target.value)}
            required
            className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
          />
        </label>
      </div>

      <StarterListEditor label="My Starters" starters={starters} onChange={setStarters} />
      <StarterListEditor label="Opponent Starters" starters={opponentStarters} onChange={setOpponentStarters} />

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-900 disabled:opacity-50"
      >
        {isPending ? "Saving…" : "Create Fantasy Matchup"}
      </button>
    </form>
  );
}
