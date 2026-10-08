"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { dollarsToCents, centsToDollars } from "@/lib/betting/money";
import type { ApprovedTicketGroup } from "@/lib/import/pipeline";
import type { ImportReview } from "@/lib/import/pipeline";
import type { RootingDirection } from "@/lib/types/domain";
import { approveParsedImport, rejectImportRecord } from "../actions";

interface EventOption {
  id: string;
  name: string;
}

interface LegState {
  localId: string;
  sport: string;
  league?: string;
  rawDescription: string;
  marketType: string;
  selection: string;
  line?: number;
  oddsAmerican?: number;
  eventId?: string;
  eventExpected: boolean;
  eventMatched: boolean;
  subjects: Array<{
    name: string;
    teamId?: string;
    participantId?: string;
    matched: boolean;
    createParticipant?: boolean;
    direction: RootingDirection;
  }>;
  selected: boolean;
}

interface GroupState {
  localId: string;
  sportsbookTicketId?: string;
  isBonusBet: boolean;
  stakeCents: number;
  toWinCents: number;
  totalReturnCents: number;
  placedAt?: string;
  promotionNote?: string;
  duplicateOfTicketId?: string;
  dismissedDuplicateWarning: boolean;
  legs: LegState[];
}

let localIdCounter = 0;
function nextLocalId(): string {
  localIdCounter += 1;
  return `local-${localIdCounter}`;
}

function initialGroups(review: ImportReview): GroupState[] {
  return review.tickets.map((tr) => ({
    localId: nextLocalId(),
    sportsbookTicketId: tr.ticket.sportsbookTicketId,
    isBonusBet: tr.ticket.isBonusBet,
    stakeCents: tr.ticket.stakeCents,
    toWinCents: tr.ticket.toWinCents,
    totalReturnCents: tr.ticket.totalReturnCents,
    placedAt: tr.ticket.placedAt,
    promotionNote: tr.ticket.promotionNote,
    duplicateOfTicketId: tr.duplicateOfTicketId,
    dismissedDuplicateWarning: false,
    legs: tr.ticket.legs.map((leg, i) => {
      const match = tr.legMatches[i];
      return {
        localId: nextLocalId(),
        sport: leg.sport,
        league: leg.league,
        rawDescription: leg.rawDescription,
        marketType: leg.marketType,
        selection: leg.selection,
        line: leg.line,
        oddsAmerican: leg.oddsAmerican,
        eventId: match.eventId,
        eventExpected: match.eventExpected,
        eventMatched: match.eventMatched,
        subjects: match.subjects,
        selected: false,
      };
    }),
  }));
}

export function ReviewForm({
  importRecordId,
  storagePath,
  review,
  events,
}: {
  importRecordId: string;
  storagePath: string | null;
  review: ImportReview;
  events: EventOption[];
}) {
  const [groups, setGroups] = useState<GroupState[]>(() => initialGroups(review));
  const [isPending, startTransition] = useTransition();
  const eventNameById = new Map(events.map((e) => [e.id, e.name]));

  function updateGroup(groupId: string, patch: Partial<GroupState>) {
    setGroups((gs) => gs.map((g) => (g.localId === groupId ? { ...g, ...patch } : g)));
  }

  function toggleLegSelected(groupId: string, legId: string) {
    setGroups((gs) =>
      gs.map((g) => {
        if (g.localId !== groupId) {
          return { ...g, legs: g.legs.map((l) => ({ ...l, selected: false })) };
        }
        return { ...g, legs: g.legs.map((l) => (l.localId === legId ? { ...l, selected: !l.selected } : l)) };
      }),
    );
  }

  function removeLeg(groupId: string, legId: string) {
    setGroups((gs) =>
      gs.map((g) => (g.localId === groupId ? { ...g, legs: g.legs.filter((l) => l.localId !== legId) } : g)),
    );
  }

  function removeGroup(groupId: string) {
    setGroups((gs) => gs.filter((g) => g.localId !== groupId));
  }

  function splitSelected(groupId: string) {
    setGroups((gs) => {
      const source = gs.find((g) => g.localId === groupId);
      if (!source) return gs;
      const selectedLegs = source.legs.filter((l) => l.selected).map((l) => ({ ...l, selected: false }));
      if (selectedLegs.length === 0) return gs;

      const newGroup: GroupState = {
        ...source,
        localId: nextLocalId(),
        sportsbookTicketId: undefined,
        duplicateOfTicketId: undefined,
        dismissedDuplicateWarning: false,
        legs: selectedLegs,
      };
      return gs.flatMap((g) =>
        g.localId === groupId
          ? [{ ...g, legs: g.legs.filter((l) => !l.selected) }, newGroup]
          : [g],
      );
    });
  }

  function mergeInto(sourceId: string, targetId: string) {
    if (sourceId === targetId) return;
    setGroups((gs) => {
      const source = gs.find((g) => g.localId === sourceId);
      if (!source) return gs;
      return gs
        .filter((g) => g.localId !== sourceId)
        .map((g) => (g.localId === targetId ? { ...g, legs: [...g.legs, ...source.legs] } : g));
    });
  }

  function approve() {
    const approvedGroups: ApprovedTicketGroup[] = groups
      .filter((g) => g.legs.length > 0)
      .map((g) => ({
        sportsbookTicketId: g.sportsbookTicketId,
        isBonusBet: g.isBonusBet,
        stakeCents: g.stakeCents,
        toWinCents: g.toWinCents,
        totalReturnCents: g.totalReturnCents,
        placedAt: g.placedAt,
        promotionNote: g.promotionNote,
        legs: g.legs.map((leg) => ({
          sport: leg.sport,
          league: leg.league,
          rawDescription: leg.rawDescription,
          marketType: leg.marketType,
          selection: leg.selection,
          line: leg.line,
          oddsAmerican: leg.oddsAmerican,
          eventId: leg.eventId,
          // An unmatched subject used to be dropped here, which on a player
          // prop silently discarded the player *and* the Over/Under the
          // direction encodes (§26.2). A prop's subject can only be a player,
          // so approval creates them instead.
          subjects: leg.subjects
            .filter((s) => s.matched || s.createParticipant)
            .map((s) => ({
              teamId: s.teamId,
              participantId: s.participantId,
              direction: s.direction,
              createParticipantNamed: s.matched ? undefined : s.name,
            })),
        })),
      }));

    startTransition(() => {
      void approveParsedImport(importRecordId, storagePath, approvedGroups);
    });
  }

  return (
    <div className="space-y-4">
      {groups.length === 0 && (
        <p className="rounded-lg border border-neutral-800 p-4 text-sm text-neutral-500">
          No tickets left to import. Reject this item to discard it.
        </p>
      )}

      {groups.map((group) => (
        <div key={group.localId} className="space-y-3 rounded-lg border border-neutral-800 p-4">
          {group.duplicateOfTicketId && !group.dismissedDuplicateWarning && (
            <div className="flex items-center justify-between rounded border border-yellow-700 bg-yellow-950/40 px-3 py-2 text-xs text-yellow-300">
              <span>Possible duplicate of an existing ticket.</span>
              <div className="flex gap-3">
                <Link href={`/tickets/${group.duplicateOfTicketId}`} className="underline">
                  View Existing
                </Link>
                <button
                  type="button"
                  onClick={() => updateGroup(group.localId, { dismissedDuplicateWarning: true })}
                  className="underline"
                >
                  Import Anyway
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-neutral-100">
              {group.sportsbookTicketId ? `Ticket #${group.sportsbookTicketId}` : "Ticket"}
            </p>
            <button
              type="button"
              onClick={() => removeGroup(group.localId)}
              className="text-xs text-neutral-500 underline"
            >
              Remove This Ticket
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <label className="block text-xs text-neutral-400">
              Stake ($)
              <input
                type="number"
                step="0.01"
                value={centsToDollars(group.stakeCents)}
                onChange={(e) => updateGroup(group.localId, { stakeCents: dollarsToCents(Number(e.target.value || 0)) })}
                className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
              />
            </label>
            <label className="block text-xs text-neutral-400">
              To Win ($)
              <input
                type="number"
                step="0.01"
                value={centsToDollars(group.toWinCents)}
                onChange={(e) => updateGroup(group.localId, { toWinCents: dollarsToCents(Number(e.target.value || 0)) })}
                className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
              />
            </label>
            <label className="block text-xs text-neutral-400">
              Payout ($)
              <input
                type="number"
                step="0.01"
                value={centsToDollars(group.totalReturnCents)}
                onChange={(e) =>
                  updateGroup(group.localId, { totalReturnCents: dollarsToCents(Number(e.target.value || 0)) })
                }
                className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
              />
            </label>
          </div>

          <div className="space-y-2">
            {group.legs.map((leg) => (
              <div key={leg.localId} className="rounded border border-neutral-800 p-2">
                <div className="flex items-start justify-between gap-2">
                  <label className="flex items-start gap-2 text-sm text-neutral-200">
                    <input
                      type="checkbox"
                      checked={leg.selected}
                      onChange={() => toggleLegSelected(group.localId, leg.localId)}
                      className="mt-1"
                    />
                    <span>
                      <span className="font-medium">{leg.selection}</span>
                      <span className="ml-2 text-xs text-neutral-500">{leg.marketType}</span>
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={() => removeLeg(group.localId, leg.localId)}
                    className="text-xs text-neutral-500 underline"
                  >
                    Remove
                  </button>
                </div>
                <div className="mt-1 flex flex-wrap gap-2 pl-6 text-xs">
                  {leg.eventExpected && (
                    <span
                      className={`rounded px-2 py-0.5 ${leg.eventMatched ? "bg-emerald-950 text-emerald-300" : "bg-red-950 text-red-300"}`}
                    >
                      {leg.eventMatched ? `Event: ${eventNameById.get(leg.eventId!) ?? leg.eventId}` : "Event not matched"}
                    </span>
                  )}
                  {leg.subjects.map((s, i) => (
                    <span
                      key={i}
                      className={`rounded px-2 py-0.5 ${
                        s.matched
                          ? "bg-emerald-950 text-emerald-300"
                          : s.createParticipant
                            ? "bg-sky-950 text-sky-300"
                            : "bg-red-950 text-red-300"
                      }`}
                    >
                      {s.name} ({s.direction})
                      {/* Told apart from "unmatched" on purpose: approval will
                          act on this one, so the user needs to know a new
                          player is about to be added under this spelling. */}
                      {!s.matched && (s.createParticipant ? " — new player" : " — unmatched")}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              disabled={!group.legs.some((l) => l.selected)}
              onClick={() => splitSelected(group.localId)}
              className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-300 disabled:opacity-40"
            >
              Split Selected Into New Ticket
            </button>
            {groups.length > 1 && (
              <select
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) mergeInto(group.localId, e.target.value);
                }}
                className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-300"
              >
                <option value="" disabled>
                  Merge into…
                </option>
                {groups
                  .filter((g) => g.localId !== group.localId)
                  .map((g) => (
                    <option key={g.localId} value={g.localId}>
                      {g.sportsbookTicketId ? `Ticket #${g.sportsbookTicketId}` : "Ticket"}
                    </option>
                  ))}
              </select>
            )}
          </div>
        </div>
      ))}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={isPending || groups.length === 0}
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
