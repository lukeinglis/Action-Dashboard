"use client";

import Link from "next/link";
import { useState, useTransition, type ReactNode } from "react";
import { formatCents } from "@/lib/betting/money";
import { resolveTicketCode, resolveTicketColor, ticketChipClass } from "@/lib/tickets/ticket-code";
import type { LegSettlement, TicketStatus } from "@/lib/types/domain";
import { deleteTicket, setManualLegStatus, setManualTicketStatus, updateBetLeg, updateTicket } from "./actions";
import { InlineText } from "../components/InlineText";
import { LegSettlementControl } from "../components/LegSettlementControl";
import { LiveStateDot } from "../components/LiveStateDot";
import type { TicketWithStatus } from "./types";

const STATUSES: TicketStatus[] = ["pending", "active", "won", "lost", "void", "cashed_out"];

/** A long parlay should not push every other ticket off the screen. */
const COLLAPSED_LEG_COUNT = 3;

const STATUS_CLASS: Record<TicketStatus, string> = {
  pending: "bg-neutral-800 text-neutral-300",
  active: "bg-sky-500/20 text-sky-300",
  won: "bg-emerald-500/20 text-emerald-300",
  lost: "bg-rose-500/20 text-rose-300",
  void: "bg-neutral-800 text-neutral-500",
  cashed_out: "bg-amber-500/20 text-amber-300",
};

/**
 * The ticket card without any drag wiring, so the same editable card renders in
 * the manually-ordered grid, the sorted grid, and the Settled drawer.
 */
export function TicketCardBody({
  item,
  onDeleted,
  dragHandle,
}: {
  item: TicketWithStatus;
  onDeleted: () => void;
  dragHandle?: ReactNode;
}) {
  const { ticket, legCount, status, legs } = item;
  const [isPending, startTransition] = useTransition();
  const [legsOpen, setLegsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const hidden = Math.max(0, legs.length - COLLAPSED_LEG_COUNT);
  const visibleLegs = legsOpen || hidden === 0 ? legs : legs.slice(0, COLLAPSED_LEG_COUNT);

  return (
    <div className="flex flex-col rounded-lg border border-neutral-800 bg-neutral-950/40 p-3">
      <div className="flex items-start gap-1.5">
        {dragHandle}
        <InlineText
          ariaLabel="Ticket code"
          value={resolveTicketCode(ticket)}
          placeholder="—"
          onSave={(code) => updateTicket(ticket.id, { code })}
          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset ${ticketChipClass(
            resolveTicketColor(ticket),
          )}`}
          inputClassName="max-w-14 text-[10px] font-semibold uppercase text-neutral-100"
        />
        <InlineText
          ariaLabel="Ticket name"
          value={ticket.name ?? ticket.generatedName ?? ticket.sportsbook ?? null}
          placeholder="Name this ticket"
          onSave={(name) => updateTicket(ticket.id, { name })}
          className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-100"
        />
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${STATUS_CLASS[status]}`}>{status}</span>
      </div>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs tabular-nums text-neutral-400">
        <span>
          <span className="text-neutral-600">Stake </span>
          {formatCents(ticket.stakeCents)}
        </span>
        <span>
          <span className="text-neutral-600">To Win </span>
          <span className="text-neutral-200">{formatCents(ticket.toWinCents)}</span>
        </span>
        <span>
          {legCount} leg{legCount === 1 ? "" : "s"}
        </span>
        {ticket.isBonusBet && <span className="text-amber-400">bonus</span>}
      </div>

      {legs.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {visibleLegs.map((leg) => (
            <li key={leg.id} className="flex items-center gap-1.5 text-[11px] text-neutral-400">
              <LiveStateDot state={leg.liveState} detail={leg.liveDetail} />
              <InlineText
                ariaLabel="Leg description"
                value={leg.selection ?? leg.rawDescription ?? leg.marketType}
                placeholder="Describe this leg"
                onSave={(selection) => updateBetLeg(leg.id, { selection })}
                className="min-w-0 flex-1 truncate"
              />
              {leg.oddsAmerican != null && (
                <span className="shrink-0 tabular-nums text-neutral-600">
                  {leg.oddsAmerican > 0 ? "+" : ""}
                  {leg.oddsAmerican}
                </span>
              )}
              <LegSettlementControl
                settlement={leg.settlement}
                onChange={(next: LegSettlement | null) => setManualLegStatus(leg.id, next)}
              />
            </li>
          ))}
        </ul>
      )}

      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setLegsOpen((v) => !v)}
          aria-expanded={legsOpen}
          className="mt-1 self-start text-[11px] text-neutral-500 hover:text-neutral-300"
        >
          {legsOpen ? "▾ Fewer legs" : `▸ ${hidden} more leg${hidden === 1 ? "" : "s"}`}
        </button>
      )}

      <div className="mt-2 flex items-center justify-between gap-2 border-t border-neutral-900 pt-2 text-[11px]">
        <Link
          href={`/tickets/${ticket.id}`}
          className="text-neutral-600 hover:text-neutral-300"
          title="Open ticket detail"
        >
          Detail ↗
        </Link>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-expanded={menuOpen}
          className="text-neutral-600 hover:text-neutral-300"
        >
          {menuOpen ? "Less" : "More"}
        </button>
      </div>

      {menuOpen && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
          <select
            aria-label="Ticket status override"
            value={ticket.manualStatus ?? ""}
            disabled={isPending}
            onChange={(e) =>
              startTransition(() =>
                setManualTicketStatus(ticket.id, (e.target.value || null) as TicketStatus | null),
              )
            }
            className="rounded border border-neutral-700 bg-neutral-900 px-1.5 py-1 text-neutral-300"
          >
            <option value="">Automatic ({status})</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                Manual: {s}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              if (!window.confirm("Delete this Ticket? This cascades to its legs and links.")) return;
              startTransition(async () => {
                await deleteTicket(ticket.id);
                onDeleted();
              });
            }}
            className="rounded border border-neutral-800 px-1.5 py-1 text-neutral-400 hover:border-rose-800 hover:text-rose-300"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
