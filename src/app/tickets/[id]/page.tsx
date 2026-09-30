import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { toBetLeg, toTicket, type BetLegRow, type TicketRow } from "@/lib/db/rows";
import { formatCents } from "@/lib/betting/money";
import { LegList } from "./LegList";
import { NewLegForm } from "./NewLegForm";

export default async function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: ticketRow, error: ticketError } = await supabase
    .from("tickets")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (ticketError) throw ticketError;
  if (!ticketRow) notFound();

  const ticket = toTicket(ticketRow as TicketRow);

  const { data: legRows, error: legsError } = await supabase
    .from("bet_legs")
    .select("*")
    .eq("ticket_id", ticket.id);
  if (legsError) throw legsError;

  const legs = (legRows ?? []).map((row) => toBetLeg(row as BetLegRow));

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-neutral-100">
          {ticket.name ?? ticket.generatedName ?? ticket.sportsbook ?? "Ticket"}
        </h1>
        <Link href="/tickets" className="text-sm text-neutral-300 underline">
          Back to Tickets
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-neutral-800 p-4 text-sm text-neutral-300">
        <span>Stake {formatCents(ticket.stakeCents)}</span>
        <span>To Win {formatCents(ticket.toWinCents)}</span>
        <span>Return {formatCents(ticket.totalReturnCents)}</span>
        {ticket.isBonusBet && <span className="text-amber-400">bonus</span>}
      </div>

      <div>
        <h2 className="mb-2 text-sm font-medium text-neutral-200">Legs</h2>
        <LegList legs={legs} />
      </div>

      <div>
        <h2 className="mb-2 text-sm font-medium text-neutral-200">Add a leg</h2>
        <NewLegForm ticketId={ticket.id} />
      </div>
    </div>
  );
}
