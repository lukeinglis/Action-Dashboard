"use client";

// Review screen for a parsed DFS Lineup ImportRecord (docs/PRD.md sections
// 29, 30, 40-43). Deliberately minimal next to ReviewForm.tsx: DFS lineups
// have no split/merge requirement, just per-slot participant/event match
// review and the usual approve/reject.

import { useState, useTransition } from "react";
import type { DfsImportReview, ApprovedDfsLineupGroup } from "@/lib/import/pipeline";
import { approveParsedDfsLineup, rejectImportRecord } from "../actions";

interface EventOption {
  id: string;
  name: string;
}

export function DfsReviewForm({
  importRecordId,
  storagePath,
  review,
  events,
}: {
  importRecordId: string;
  storagePath: string | null;
  review: DfsImportReview;
  events: EventOption[];
}) {
  const [removed, setRemoved] = useState<Set<number>>(new Set());
  const [isPending, startTransition] = useTransition();
  const eventNameById = new Map(events.map((e) => [e.id, e.name]));

  function approve() {
    const groups: ApprovedDfsLineupGroup[] = review.lineups
      .map((lr, i) => ({ lr, i }))
      .filter(({ i }) => !removed.has(i))
      .map(({ lr }) => ({
        platform: lr.lineup.platform,
        sport: lr.lineup.league ? `${lr.lineup.sport}/${lr.lineup.league}` : lr.lineup.sport,
        slateName: lr.lineup.slateName,
        slots: lr.slotMatches.map((sm) => ({
          slot: sm.slot.slot,
          playerName: sm.slot.playerName,
          salary: sm.slot.salary,
          automaticActualPoints: sm.slot.points,
          participantId: sm.playerMatch.participantMatched ? sm.playerMatch.participantId : undefined,
          eventId: sm.playerMatch.eventMatched ? sm.playerMatch.eventId : undefined,
        })),
        contestName: lr.lineup.contestName,
        entryFeeCents: lr.lineup.entryFeeCents,
        potentialPrizeCents: lr.lineup.potentialPrizeCents,
        automaticCurrentPoints: lr.lineup.currentPoints,
      }));

    startTransition(() => {
      void approveParsedDfsLineup(importRecordId, storagePath, groups);
    });
  }

  return (
    <div className="space-y-4">
      {review.lineups.length === removed.size && (
        <p className="rounded-lg border border-neutral-800 p-4 text-sm text-neutral-500">
          No lineups left to import. Reject this item to discard it.
        </p>
      )}

      {review.lineups.map((lr, i) => {
        if (removed.has(i)) return null;
        return (
          <div key={i} className="space-y-3 rounded-lg border border-neutral-800 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-neutral-100">
                {lr.lineup.platform} — {lr.lineup.slateName ?? "Lineup"}
              </p>
              <button
                type="button"
                onClick={() => setRemoved((r) => new Set(r).add(i))}
                className="text-xs text-neutral-500 underline"
              >
                Remove This Lineup
              </button>
            </div>

            <div className="space-y-2">
              {lr.slotMatches.map((sm, j) => (
                <div key={j} className="flex items-center justify-between rounded border border-neutral-800 p-2 text-sm">
                  <span className="text-neutral-200">
                    <span className="font-medium">{sm.slot.slot}</span>
                    <span className="ml-2 text-neutral-400">{sm.slot.playerName}</span>
                  </span>
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
              ))}
            </div>
          </div>
        );
      })}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={isPending || review.lineups.length === removed.size}
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
