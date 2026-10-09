"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { syncTicketSettlement } from "@/lib/betting/settle-tickets";
import type { BetLeg, BetLegEvent, BetLegSubject, Ticket, TicketStatus, LegSettlement, LiveLegState, MatchMethod, RootingDirection } from "@/lib/types/domain";
import {
  createTicket as createTicketLib,
  deleteTicket as deleteTicketLib,
  reorderTicket as reorderTicketLib,
  setManualTicketStatus as setManualTicketStatusLib,
  updateTicket as updateTicketLib,
  type CreateTicketInput,
  type UpdateTicketInput,
} from "@/lib/tickets/tickets";
import {
  createBetLeg as createBetLegLib,
  deleteBetLeg as deleteBetLegLib,
  setManualLegLiveState as setManualLegLiveStateLib,
  setManualLegStatus as setManualLegStatusLib,
  updateBetLeg as updateBetLegLib,
  type CreateBetLegInput,
  type UpdateBetLegInput,
} from "@/lib/tickets/bet-legs";
import {
  linkBetLegEvent as linkBetLegEventLib,
  unlinkBetLegEvent as unlinkBetLegEventLib,
} from "@/lib/tickets/bet-leg-events";
import {
  removeBetLegSubject as removeBetLegSubjectLib,
  setBetLegSubject as setBetLegSubjectLib,
  setManualSubjectDirection as setManualSubjectDirectionLib,
  type SetBetLegSubjectInput,
} from "@/lib/tickets/bet-leg-subjects";

async function requireUserId(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user.id;
}

export async function createTicket(input: CreateTicketInput): Promise<Ticket> {
  const supabase = await createClient();
  const userId = await requireUserId(supabase);
  const ticket = await createTicketLib(supabase, userId, input);
  revalidatePath("/tickets");
  revalidatePath("/");
  return ticket;
}

export async function updateTicket(ticketId: string, input: UpdateTicketInput): Promise<void> {
  const supabase = await createClient();
  await requireUserId(supabase);
  await updateTicketLib(supabase, ticketId, input);
  revalidatePath("/tickets");
  revalidatePath("/");
}

export async function setManualTicketStatus(ticketId: string, status: TicketStatus | null): Promise<void> {
  const supabase = await createClient();
  const userId = await requireUserId(supabase);
  await setManualTicketStatusLib(supabase, ticketId, status);
  // §25 stamps settledAt against the *displayed* status, so a hand-set one
  // closes the Ticket exactly as a graded leg does — and clearing the override
  // back to null reopens it.
  await syncTicketSettlement(supabase, { userId, ticketIds: [ticketId] });
  revalidatePath("/tickets");
  revalidatePath("/");
}

export async function reorderTicket(
  ticketId: string,
  beforeSortKey: string | null,
  afterSortKey: string | null,
): Promise<string> {
  const supabase = await createClient();
  await requireUserId(supabase);
  const sortKey = await reorderTicketLib(supabase, ticketId, beforeSortKey, afterSortKey);
  revalidatePath("/tickets");
  revalidatePath("/");
  return sortKey;
}

export async function deleteTicket(ticketId: string): Promise<void> {
  const supabase = await createClient();
  await requireUserId(supabase);
  await deleteTicketLib(supabase, ticketId);
  revalidatePath("/tickets");
  revalidatePath("/");
}

export async function createBetLeg(input: CreateBetLegInput): Promise<BetLeg> {
  const supabase = await createClient();
  const userId = await requireUserId(supabase);
  const leg = await createBetLegLib(supabase, userId, input);
  revalidatePath("/tickets");
  revalidatePath("/");
  return leg;
}

export async function updateBetLeg(betLegId: string, input: UpdateBetLegInput): Promise<void> {
  const supabase = await createClient();
  await requireUserId(supabase);
  await updateBetLegLib(supabase, betLegId, input);
  revalidatePath("/tickets");
  revalidatePath("/");
}

export async function setManualLegStatus(betLegId: string, status: LegSettlement | null): Promise<void> {
  const supabase = await createClient();
  const userId = await requireUserId(supabase);
  await setManualLegStatusLib(supabase, betLegId, status);
  // Grading the last open leg by hand decides the Ticket, so it has to close it
  // (§25) — otherwise only a provider refresh could, and the markets a user
  // grades by hand are exactly the ones no provider settles.
  await syncTicketSettlement(supabase, { userId, betLegIds: [betLegId] });
  revalidatePath("/tickets");
  revalidatePath("/");
}

export async function setManualLegLiveState(
  betLegId: string,
  liveState: LiveLegState | null,
  liveDetail?: string | null,
): Promise<void> {
  const supabase = await createClient();
  await requireUserId(supabase);
  await setManualLegLiveStateLib(supabase, betLegId, liveState, liveDetail);
  revalidatePath("/tickets");
  revalidatePath("/");
}

export async function deleteBetLeg(betLegId: string): Promise<void> {
  const supabase = await createClient();
  await requireUserId(supabase);
  await deleteBetLegLib(supabase, betLegId);
  revalidatePath("/tickets");
  revalidatePath("/");
}

export async function linkBetLegEvent(
  betLegId: string,
  eventId: string,
  matchMethod: MatchMethod,
): Promise<BetLegEvent | null> {
  const supabase = await createClient();
  const userId = await requireUserId(supabase);
  const link = await linkBetLegEventLib(supabase, userId, betLegId, eventId, matchMethod);
  revalidatePath("/tickets");
  revalidatePath("/");
  return link;
}

export async function unlinkBetLegEvent(betLegEventId: string): Promise<void> {
  const supabase = await createClient();
  await requireUserId(supabase);
  await unlinkBetLegEventLib(supabase, betLegEventId);
  revalidatePath("/tickets");
  revalidatePath("/");
}

export async function setBetLegSubject(input: SetBetLegSubjectInput): Promise<BetLegSubject> {
  const supabase = await createClient();
  const userId = await requireUserId(supabase);
  const subject = await setBetLegSubjectLib(supabase, userId, input);
  revalidatePath("/tickets");
  revalidatePath("/");
  return subject;
}

export async function setManualSubjectDirection(subjectId: string, direction: RootingDirection): Promise<void> {
  const supabase = await createClient();
  await requireUserId(supabase);
  await setManualSubjectDirectionLib(supabase, subjectId, direction);
  revalidatePath("/tickets");
  revalidatePath("/");
}

export async function removeBetLegSubject(subjectId: string): Promise<void> {
  const supabase = await createClient();
  await requireUserId(supabase);
  await removeBetLegSubjectLib(supabase, subjectId);
  revalidatePath("/tickets");
  revalidatePath("/");
}
