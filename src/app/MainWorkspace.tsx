"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatCents } from "@/lib/betting/money";
import { sortTickets } from "@/lib/dashboard/active-tickets";
import type { ActiveWorkspace, SortMode } from "@/lib/types/domain";
import { TicketList } from "./tickets/TicketList";
import type { DashboardTicketItem, EventDetailData } from "./types";
import { EventDetail } from "./EventDetail";

interface Props {
  activeWorkspace: ActiveWorkspace;
  sortMode: SortMode;
  onSortModeChange: (mode: SortMode) => void;
  ticketItems: DashboardTicketItem[];
  selectedEventDetail: EventDetailData | null;
  onBackToTickets: () => void;
}

const SORT_MODES: { value: SortMode; label: string }[] = [
  { value: "manual", label: "Manual" },
  { value: "next_event", label: "Next Event" },
  { value: "stake", label: "Stake" },
  { value: "to_win", label: "To Win" },
  { value: "legs_remaining", label: "Legs Remaining" },
];

function toSortable(item: DashboardTicketItem) {
  return {
    ...item,
    id: item.ticket.id,
    sortKey: item.ticket.sortKey,
    stakeCents: item.ticket.stakeCents,
    toWinCents: item.ticket.toWinCents,
  };
}

export function MainWorkspace({
  activeWorkspace,
  sortMode,
  onSortModeChange,
  ticketItems,
  selectedEventDetail,
  onBackToTickets,
}: Props) {
  if (activeWorkspace === "event" && selectedEventDetail) {
    return (
      <main className="space-y-3">
        <button type="button" onClick={onBackToTickets} className="text-sm text-neutral-300 underline">
          ← All Active Tickets
        </button>
        <EventDetail data={selectedEventDetail} />
      </main>
    );
  }

  return <AllActiveTickets sortMode={sortMode} onSortModeChange={onSortModeChange} ticketItems={ticketItems} />;
}

function AllActiveTickets({
  sortMode,
  onSortModeChange,
  ticketItems,
}: {
  sortMode: SortMode;
  onSortModeChange: (mode: SortMode) => void;
  ticketItems: DashboardTicketItem[];
}) {
  const [settledOpen, setSettledOpen] = useState(false);

  const active = ticketItems.filter((t) => t.section === "active");
  const settled = ticketItems.filter((t) => t.section === "settled");

  const sortedActive = useMemo(() => sortTickets(active.map(toSortable), sortMode), [active, sortMode]);

  return (
    <main className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-100">All Active Tickets</h2>
        <select
          value={sortMode}
          onChange={(e) => onSortModeChange(e.target.value as SortMode)}
          className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-300"
        >
          {SORT_MODES.map((m) => (
            <option key={m.value} value={m.value}>
              Sort: {m.label}
            </option>
          ))}
        </select>
      </div>

      {sortedActive.length === 0 && (
        <p className="text-sm text-neutral-500">
          No active tickets.{" "}
          <Link href="/inbox" className="text-neutral-300 underline">
            Add a pick
          </Link>{" "}
          to get started.
        </p>
      )}

      {sortMode === "manual" ? (
        <TicketList items={active} />
      ) : (
        <div className="space-y-3">
          {sortedActive.map((item) => (
            <StaticTicketRow key={item.ticket.id} item={item} />
          ))}
        </div>
      )}

      {settled.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setSettledOpen((v) => !v)}
            className="text-sm font-semibold text-neutral-100 underline"
          >
            Settled ({settled.length}) {settledOpen ? "▾" : "▸"}
          </button>
          {settledOpen && (
            <div className="mt-2 space-y-3">
              {settled.map((item) => (
                <StaticTicketRow key={item.ticket.id} item={item} />
              ))}
            </div>
          )}
        </div>
      )}
    </main>
  );
}

function StaticTicketRow({ item }: { item: DashboardTicketItem }) {
  const { ticket, legCount, status, legs } = item;
  return (
    <Link
      href={`/tickets/${ticket.id}`}
      className="block rounded-lg border border-neutral-800 p-4 hover:border-neutral-700"
    >
      <div className="flex items-center justify-between">
        <span className="font-medium text-neutral-100">
          {ticket.name ?? ticket.generatedName ?? ticket.sportsbook ?? "Ticket"}
        </span>
        <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300">{status}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-neutral-300">
        <span>Stake {formatCents(ticket.stakeCents)}</span>
        <span>To Win {formatCents(ticket.toWinCents)}</span>
        <span>
          {legCount} leg{legCount === 1 ? "" : "s"}
        </span>
      </div>
      {legs.length > 0 && (
        <ul className="mt-2 space-y-1">
          {legs.map((leg) => (
            <li key={leg.id} className="flex items-center justify-between gap-2 text-xs text-neutral-400">
              <span className="truncate">
                {leg.selection ?? leg.rawDescription ?? leg.marketType}
                {leg.oddsAmerican != null ? ` (${leg.oddsAmerican > 0 ? "+" : ""}${leg.oddsAmerican})` : ""}
              </span>
              <span className="shrink-0 rounded bg-neutral-800 px-1.5 py-0.5 text-neutral-400">{leg.settlement}</span>
            </li>
          ))}
        </ul>
      )}
    </Link>
  );
}
