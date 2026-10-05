"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { sortTickets } from "@/lib/dashboard/active-tickets";
import type { ActiveWorkspace, SortMode } from "@/lib/types/domain";
import { TicketList } from "./tickets/TicketList";
import { TicketCardBody } from "./tickets/TicketCardBody";
import { Panel, PanelBody, PanelHeader } from "./components/Panel";
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
      <Panel>
        <PanelHeader
          title={selectedEventDetail.event.name}
          action={
            <button
              type="button"
              onClick={onBackToTickets}
              className="text-[11px] text-neutral-400 hover:text-neutral-100"
            >
              ← All Active Tickets
            </button>
          }
        />
        <PanelBody>
          <EventDetail data={selectedEventDetail} />
        </PanelBody>
      </Panel>
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
    <Panel>
      <PanelHeader
        title="All Active Tickets"
        count={active.length}
        action={
          <select
            aria-label="Ticket sort"
            value={sortMode}
            onChange={(e) => onSortModeChange(e.target.value as SortMode)}
            className="rounded border border-neutral-800 bg-neutral-900 px-1.5 py-0.5 text-[11px] text-neutral-400"
          >
            {SORT_MODES.map((m) => (
              <option key={m.value} value={m.value}>
                Sort: {m.label}
              </option>
            ))}
          </select>
        }
      />
      <PanelBody className="space-y-4">
        {sortedActive.length === 0 && (
          <p className="text-sm text-neutral-500">
            No active tickets.{" "}
            <Link href="/inbox" className="text-neutral-300 underline">
              Add a pick
            </Link>{" "}
            to get started.
          </p>
        )}

        {sortMode === "manual" ? <TicketList items={active} /> : <TicketGrid items={sortedActive} />}

        {settled.length > 0 && (
          <div className="border-t border-neutral-900 pt-3">
            <button
              type="button"
              onClick={() => setSettledOpen((v) => !v)}
              aria-expanded={settledOpen}
              className="text-xs font-semibold uppercase tracking-wide text-neutral-500 hover:text-neutral-300"
            >
              {settledOpen ? "▾" : "▸"} Settled <span className="tabular-nums">{settled.length}</span>
            </button>
            {settledOpen && (
              <div className="mt-2">
                <TicketGrid items={settled} />
              </div>
            )}
          </div>
        )}
      </PanelBody>
    </Panel>
  );
}

/**
 * Non-draggable grid. Deletion is handled by revalidation rather than local
 * state, since these lists are re-derived on the server for every sort mode.
 */
function TicketGrid({ items }: { items: DashboardTicketItem[] }) {
  const router = useRouter();
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <TicketCardBody key={item.ticket.id} item={item} onDeleted={() => router.refresh()} />
      ))}
    </div>
  );
}
