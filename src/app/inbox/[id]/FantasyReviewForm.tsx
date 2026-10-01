"use client";

// Review screen for a parsed Fantasy Matchup ImportRecord (docs/PRD.md
// sections 29, 30, 34-38, 43). Deliberately minimal next to ReviewForm.tsx:
// fantasy matchups have no split/merge requirement, just per-starter
// participant/event match review and the usual approve/reject.

import { useState, useTransition } from "react";
import type { FantasyImportReview, ApprovedFantasyMatchupGroup, FantasyStarterMatch } from "@/lib/import/pipeline";
import { approveParsedFantasyMatchup, rejectImportRecord } from "../actions";

interface EventOption {
  id: string;
  name: string;
}

function toApprovedStarters(matches: FantasyStarterMatch[]) {
  return matches.map((m) => ({
    playerName: m.starter.playerName,
    participantId: m.playerMatch.participantMatched ? m.playerMatch.participantId : undefined,
    eventId: m.playerMatch.eventMatched ? m.playerMatch.eventId : undefined,
  }));
}

export function FantasyReviewForm({
  importRecordId,
  storagePath,
  review,
  events,
}: {
  importRecordId: string;
  storagePath: string | null;
  review: FantasyImportReview;
  events: EventOption[];
}) {
  const [removed, setRemoved] = useState<Set<number>>(new Set());
  const [isPending, startTransition] = useTransition();
  const eventNameById = new Map(events.map((e) => [e.id, e.name]));

  function approve() {
    const groups: ApprovedFantasyMatchupGroup[] = review.matchups
      .map((mr, i) => ({ mr, i }))
      .filter(({ i }) => !removed.has(i))
      .map(({ mr }) => ({
        leagueName: mr.matchup.leagueName,
        platform: mr.matchup.platform,
        sport: mr.matchup.league ? `${mr.matchup.sport}/${mr.matchup.league}` : mr.matchup.sport,
        season: mr.matchup.season ?? new Date().getFullYear().toString(),
        week: mr.matchup.week,
        userTeamName: mr.matchup.userTeamName,
        opponentTeamName: mr.matchup.opponentTeamName,
        automaticUserScore: mr.matchup.userScore,
        automaticOpponentScore: mr.matchup.opponentScore,
        userProjectedScore: mr.matchup.userProjectedScore,
        opponentProjectedScore: mr.matchup.opponentProjectedScore,
        starters: toApprovedStarters(mr.starterMatches),
        opponentStarters: toApprovedStarters(mr.opponentStarterMatches),
      }));

    startTransition(() => {
      void approveParsedFantasyMatchup(importRecordId, storagePath, groups);
    });
  }

  function renderStarterRow(sm: FantasyStarterMatch, key: number) {
    return (
      <div key={key} className="flex items-center justify-between rounded border border-neutral-800 p-2 text-sm">
        <span className="text-neutral-200">{sm.starter.playerName}</span>
        <div className="flex gap-2 text-xs">
          <span
            className={`rounded px-2 py-0.5 ${sm.playerMatch.participantMatched ? "bg-emerald-950 text-emerald-300" : "bg-red-950 text-red-300"}`}
          >
            {sm.playerMatch.participantMatched ? "Player matched" : "Player not matched"}
          </span>
          {sm.playerMatch.participantMatched && (
            <span
              className={`rounded px-2 py-0.5 ${sm.playerMatch.eventMatched ? "bg-emerald-950 text-emerald-300" : "bg-red-950 text-red-300"}`}
            >
              {sm.playerMatch.eventMatched
                ? `Event: ${eventNameById.get(sm.playerMatch.eventId!) ?? sm.playerMatch.eventId}`
                : "Event not matched"}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {review.matchups.length === removed.size && (
        <p className="rounded-lg border border-neutral-800 p-4 text-sm text-neutral-500">
          No matchups left to import. Reject this item to discard it.
        </p>
      )}

      {review.matchups.map((mr, i) => {
        if (removed.has(i)) return null;
        return (
          <div key={i} className="space-y-3 rounded-lg border border-neutral-800 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-neutral-100">
                {mr.matchup.leagueName}: {mr.matchup.userTeamName} vs {mr.matchup.opponentTeamName}
              </p>
              <button
                type="button"
                onClick={() => setRemoved((r) => new Set(r).add(i))}
                className="text-xs text-neutral-500 underline"
              >
                Remove This Matchup
              </button>
            </div>

            <div>
              <p className="mb-1 text-xs uppercase tracking-wide text-neutral-500">My Starters</p>
              <div className="space-y-2">{mr.starterMatches.map((sm, j) => renderStarterRow(sm, j))}</div>
            </div>
            <div>
              <p className="mb-1 text-xs uppercase tracking-wide text-neutral-500">Opponent Starters</p>
              <div className="space-y-2">{mr.opponentStarterMatches.map((sm, j) => renderStarterRow(sm, j))}</div>
            </div>
          </div>
        );
      })}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={isPending || review.matchups.length === removed.size}
          onClick={approve}
          className="flex-1 rounded bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-900 disabled:opacity-50"
        >
          {isPending ? "Saving…" : "Approve Import"}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            if (!window.confirm("Reject this import? The image will be deleted.")) return;
            startTransition(() => void rejectImportRecord(importRecordId, storagePath));
          }}
          className="rounded border border-neutral-700 px-3 py-2 text-sm text-neutral-300"
        >
          Reject
        </button>
      </div>
    </div>
  );
}
