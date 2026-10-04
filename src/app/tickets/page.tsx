import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  toBetLeg,
  toBetLegEvent,
  toTicket,
  type BetLegEventRow,
  type BetLegRow,
  type TicketRow,
} from "@/lib/db/rows";
import { effectiveTicketStatus, legSettlement } from "@/lib/betting/derived-status";
import { isLegLive } from "@/lib/tickets/bet-leg-events";
import { logout } from "@/app/login/actions";
import { TicketList } from "./TicketList";
import type { TicketWithStatus } from "./types";

export default async function TicketsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: ticketRows, error: ticketsError } = await supabase
    .from("tickets")
    .select("*")
    .eq("user_id", user.id)
    .order("sort_key", { ascending: true });
  if (ticketsError) throw ticketsError;

  const tickets = (ticketRows ?? []).map((row) => toTicket(row as TicketRow));
  const ticketIds = tickets.map((t) => t.id);

  let legRows: BetLegRow[] = [];
  if (ticketIds.length > 0) {
    const { data, error } = await supabase.from("bet_legs").select("*").in("ticket_id", ticketIds);
    if (error) throw error;
    legRows = (data ?? []) as BetLegRow[];
  }

  const legs = legRows.map((row) => toBetLeg(row));
  const legIds = legs.map((l) => l.id);

  let linkRows: BetLegEventRow[] = [];
  if (legIds.length > 0) {
    const { data, error } = await supabase.from("bet_leg_events").select("*").in("bet_leg_id", legIds);
    if (error) throw error;
    linkRows = (data ?? []) as BetLegEventRow[];
  }

  const links = linkRows.map((row) => toBetLegEvent(row));
  const eventIds = [...new Set(links.map((l) => l.eventId))];

  const eventStatusById = new Map<string, string | null>();
  if (eventIds.length > 0) {
    const { data, error } = await supabase
      .from("events")
      .select("id, automatic_status, manual_status")
      .in("id", eventIds);
    if (error) throw error;
    for (const e of data ?? []) {
      eventStatusById.set(
        e.id as string,
        (e.manual_status as string | null) ?? (e.automatic_status as string | null),
      );
    }
  }

  const ticketsWithStatus: TicketWithStatus[] = tickets.map((ticket) => {
    const ticketLegs = legs.filter((l) => l.ticketId === ticket.id);
    const anyLinkedEventLive = ticketLegs.some((leg) => {
      const linkedStatuses = links
        .filter((l) => l.betLegId === leg.id)
        .map((l) => eventStatusById.get(l.eventId));
      return isLegLive(legSettlement(leg), linkedStatuses);
    });
    const status = effectiveTicketStatus(ticket.manualStatus, ticketLegs, anyLinkedEventLive);
    return {
      ticket,
      legCount: ticketLegs.length,
      status,
      legs: ticketLegs.map((l) => ({
        id: l.id,
        marketType: l.marketType,
        selection: l.selection ?? null,
        rawDescription: l.rawDescription ?? null,
        line: l.line ?? null,
        oddsAmerican: l.oddsAmerican ?? null,
        settlement: legSettlement(l),
      })),
    };
  });

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-neutral-100">Tickets</h1>
        <div className="flex flex-wrap gap-3">
          <Link href="/" className="text-sm text-neutral-300 underline">
            Dashboard
          </Link>
          <Link href="/inbox" className="text-sm text-neutral-300 underline">
            Inbox
          </Link>
          <Link href="/tickets/new" className="text-sm text-neutral-300 underline">
            New Ticket
          </Link>
          <form action={logout}>
            <button type="submit" className="text-sm text-neutral-500 underline">
              Sign out
            </button>
          </form>
        </div>
      </div>

      {ticketsWithStatus.length === 0 && (
        <p className="text-sm text-neutral-500">No tickets yet.</p>
      )}

      <TicketList items={ticketsWithStatus} />
    </div>
  );
}
