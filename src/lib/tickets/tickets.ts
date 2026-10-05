import type { SupabaseClient } from "@supabase/supabase-js";
import { sortKeyAfter, sortKeyBetween } from "@/lib/sort/sort-key";
import { toTicket, type TicketRow } from "@/lib/db/rows";
import type { Ticket, TicketStatus } from "@/lib/types/domain";
import { deleteBetLegLinks } from "./bet-legs";

export interface CreateTicketInput {
  name?: string;
  sportsbook?: string;
  sportsbookTicketId?: string;
  stakeCents: number;
  toWinCents: number;
  totalReturnCents: number;
  actualReturnCents?: number;
  isBonusBet?: boolean;
  oddsAmerican?: number;
  placedAt?: string;
  notes?: string;
  promotionNote?: string;
  tags?: string[];
  importRecordId?: string;
}

async function lastSortKey(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await supabase.from("tickets").select("sort_key").eq("user_id", userId);
  if (error) throw error;
  const keys = (data ?? []).map((row) => row.sort_key as string);
  if (keys.length === 0) return null;
  return keys.sort().at(-1) ?? null;
}

/** Creates a Ticket, appending it to the end of the user's sortKey order. */
export async function createTicket(
  supabase: SupabaseClient,
  userId: string,
  input: CreateTicketInput,
): Promise<Ticket> {
  const sortKey = sortKeyAfter(await lastSortKey(supabase, userId));

  const { data, error } = await supabase
    .from("tickets")
    .insert({
      user_id: userId,
      name: input.name ?? null,
      sportsbook: input.sportsbook ?? null,
      sportsbook_ticket_id: input.sportsbookTicketId ?? null,
      stake_cents: input.stakeCents,
      to_win_cents: input.toWinCents,
      total_return_cents: input.totalReturnCents,
      actual_return_cents: input.actualReturnCents ?? null,
      is_bonus_bet: input.isBonusBet ?? false,
      odds_american: input.oddsAmerican ?? null,
      placed_at: input.placedAt ?? null,
      notes: input.notes ?? null,
      promotion_note: input.promotionNote ?? null,
      tags: input.tags ?? [],
      sort_key: sortKey,
      import_record_id: input.importRecordId ?? null,
    })
    .select("*")
    .single();

  if (error) throw error;
  return toTicket(data as TicketRow);
}

export interface UpdateTicketInput {
  name?: string | null;
  code?: string | null;
  color?: string | null;
  sportsbook?: string | null;
  sportsbookTicketId?: string | null;
  stakeCents?: number;
  toWinCents?: number;
  totalReturnCents?: number;
  actualReturnCents?: number | null;
  isBonusBet?: boolean;
  oddsAmerican?: number | null;
  placedAt?: string | null;
  notes?: string | null;
  promotionNote?: string | null;
  tags?: string[];
}

export async function updateTicket(
  supabase: SupabaseClient,
  ticketId: string,
  input: UpdateTicketInput,
): Promise<void> {
  const update: Record<string, unknown> = {};
  if (input.name !== undefined) update.name = input.name;
  if (input.code !== undefined) update.code = input.code;
  if (input.color !== undefined) update.color = input.color;
  if (input.sportsbook !== undefined) update.sportsbook = input.sportsbook;
  if (input.sportsbookTicketId !== undefined) update.sportsbook_ticket_id = input.sportsbookTicketId;
  if (input.stakeCents !== undefined) update.stake_cents = input.stakeCents;
  if (input.toWinCents !== undefined) update.to_win_cents = input.toWinCents;
  if (input.totalReturnCents !== undefined) update.total_return_cents = input.totalReturnCents;
  if (input.actualReturnCents !== undefined) update.actual_return_cents = input.actualReturnCents;
  if (input.isBonusBet !== undefined) update.is_bonus_bet = input.isBonusBet;
  if (input.oddsAmerican !== undefined) update.odds_american = input.oddsAmerican;
  if (input.placedAt !== undefined) update.placed_at = input.placedAt;
  if (input.notes !== undefined) update.notes = input.notes;
  if (input.promotionNote !== undefined) update.promotion_note = input.promotionNote;
  if (input.tags !== undefined) update.tags = input.tags;

  const { error } = await supabase.from("tickets").update(update).eq("id", ticketId);
  if (error) throw error;
}

/** Sets the manual Ticket status, which always wins over the derived status (docs/PRD.md section 27). */
export async function setManualTicketStatus(
  supabase: SupabaseClient,
  ticketId: string,
  status: TicketStatus | null,
): Promise<void> {
  const { error } = await supabase.from("tickets").update({ manual_status: status }).eq("id", ticketId);
  if (error) throw error;
}

/**
 * Moves a Ticket between two neighbors in sortKey order, writing exactly one
 * row. Pass null for a neighbor that doesn't exist (start/end of the list).
 */
export async function reorderTicket(
  supabase: SupabaseClient,
  ticketId: string,
  beforeSortKey: string | null,
  afterSortKey: string | null,
): Promise<string> {
  const sortKey = sortKeyBetween(beforeSortKey, afterSortKey);
  const { error } = await supabase.from("tickets").update({ sort_key: sortKey }).eq("id", ticketId);
  if (error) throw error;
  return sortKey;
}

/** Hard-deletes a Ticket; cascades to its legs and their event and subject links (docs/PRD.md section 63.1). */
export async function deleteTicket(supabase: SupabaseClient, ticketId: string): Promise<void> {
  const { data: legs, error: legsError } = await supabase
    .from("bet_legs")
    .select("id")
    .eq("ticket_id", ticketId);
  if (legsError) throw legsError;

  for (const leg of legs ?? []) {
    await deleteBetLegLinks(supabase, leg.id as string);
  }

  const { error: deleteLegsError } = await supabase.from("bet_legs").delete().eq("ticket_id", ticketId);
  if (deleteLegsError) throw deleteLegsError;

  const { error } = await supabase.from("tickets").delete().eq("id", ticketId);
  if (error) throw error;
}
