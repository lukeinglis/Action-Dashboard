"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Team } from "@/lib/types/domain";
import type { CreateEventInput } from "@/lib/events/schema";
import { createEvent, type CreateEventResult } from "../actions";
import { createTeam } from "@/app/teams/actions";

export function NewEventForm({ teams: initialTeams }: { teams: Team[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [teams, setTeams] = useState(initialTeams);

  const [sport, setSport] = useState("nfl");
  const [league, setLeague] = useState("");
  const [name, setName] = useState("");
  const [startLocal, setStartLocal] = useState("");
  const [homeTeamId, setHomeTeamId] = useState("");
  const [awayTeamId, setAwayTeamId] = useState("");

  const [duplicates, setDuplicates] = useState<CreateEventResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function buildInput(): CreateEventInput {
    return {
      sport,
      league: league || undefined,
      name,
      startTimeUtc: startLocal ? new Date(startLocal).toISOString() : undefined,
      startTimeTbd: false,
      homeTeamId: homeTeamId || undefined,
      awayTeamId: awayTeamId || undefined,
    };
  }

  function submit(forceCreate: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await createEvent(buildInput(), forceCreate);
      if (result.status === "duplicates") {
        setDuplicates(result);
      } else if (result.status === "error") {
        setError(result.error);
      } else {
        router.push("/events");
      }
    });
  }

  async function addTeam(setter: (id: string) => void) {
    const teamName = window.prompt("Team name (e.g. Buccaneers)");
    if (!teamName) return;
    const created = await createTeam({ sport, league: league || sport, name: teamName });
    setTeams((prev) => [...prev, created]);
    setter(created.id);
  }

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(false);
        }}
        className="space-y-3 rounded-lg border border-neutral-800 p-4"
      >
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
          League (optional)
          <input
            value={league}
            onChange={(e) => setLeague(e.target.value)}
            className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
          />
        </label>

        <label className="block text-xs text-neutral-400">
          Event name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="MIN @ TB"
            className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
          />
        </label>

        <label className="block text-xs text-neutral-400">
          Start time
          <input
            type="datetime-local"
            value={startLocal}
            onChange={(e) => setStartLocal(e.target.value)}
            className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs text-neutral-400">
            Home team (optional)
            <select
              value={homeTeamId}
              onChange={(e) =>
                e.target.value === "__new__" ? addTeam(setHomeTeamId) : setHomeTeamId(e.target.value)
              }
              className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
            >
              <option value="">—</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
              <option value="__new__">+ New team…</option>
            </select>
          </label>

          <label className="block text-xs text-neutral-400">
            Away team (optional)
            <select
              value={awayTeamId}
              onChange={(e) =>
                e.target.value === "__new__" ? addTeam(setAwayTeamId) : setAwayTeamId(e.target.value)
              }
              className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
            >
              <option value="">—</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
              <option value="__new__">+ New team…</option>
            </select>
          </label>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-900 disabled:opacity-50"
        >
          {isPending ? "Saving…" : "Create Event"}
        </button>
      </form>

      {duplicates?.status === "duplicates" && (
        <div className="space-y-2 rounded-lg border border-amber-800 bg-amber-950/30 p-4 text-sm">
          <p className="text-amber-300">
            This looks like the same Event as one that already exists. The name can
            differ — the same two teams on the same date are one game:
          </p>
          <ul className="list-inside list-disc text-neutral-300">
            {duplicates.duplicates.map((d) => (
              <li key={d.id}>{d.name}</li>
            ))}
          </ul>
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => router.push("/events")}
              className="rounded border border-neutral-700 px-3 py-1.5 text-xs text-neutral-200"
            >
              Use Existing
            </button>
            <button
              type="button"
              onClick={() => {
                setDuplicates(null);
                submit(true);
              }}
              className="rounded border border-amber-700 px-3 py-1.5 text-xs text-amber-200"
            >
              Create Anyway
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
