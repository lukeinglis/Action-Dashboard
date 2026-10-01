// DFSEntry CRUD (docs/PRD.md section 42, 63.1) and Mark Final (docs/PRD.md
// section 8: "the status never changes automatically").

import type { SupabaseClient } from "@supabase/supabase-js";
import { sortKeyAfter } from "@/lib/sort/sort-key";
import { toDFSEntry, type DFSEntryRow } from "@/lib/db/rows";
import type { DFSEntry } from "@/lib/types/domain";

export interface CreateDfsEntryInput {
  dfsLineupId: string;
  contestName?: string;
  entryFeeCents?: number;
  potentialPrizeCents?: number;
  automaticCurrentPoints?: number;
}

async function lastSortKey(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await supabase.from("dfs_entries").select("sort_key").eq("user_id", userId);
  if (error) throw error;
  const keys = (data ?? []).map((row) => row.sort_key as string);
  if (keys.length === 0) return null;
  return keys.sort().at(-1) ?? null;
}

/** Creates a DFSEntry, appending it to the end of the user's sortKey order. One DFSLineup may back multiple DFSEntries (docs/PRD.md section 42). */
export async function createDfsEntry(
  supabase: SupabaseClient,
  userId: string,
  input: CreateDfsEntryInput,
): Promise<DFSEntry> {
  const sortKey = sortKeyAfter(await lastSortKey(supabase, userId));

  const { data, error } = await supabase
    .from("dfs_entries")
    .insert({
      user_id: userId,
      dfs_lineup_id: input.dfsLineupId,
      contest_name: input.contestName ?? null,
      entry_fee_cents: input.entryFeeCents ?? null,
      potential_prize_cents: input.potentialPrizeCents ?? null,
      automatic_current_points: input.automaticCurrentPoints ?? null,
      automatic_changed_at: input.automaticCurrentPoints !== undefined ? new Date().toISOString() : null,
      status: "upcoming",
      sort_key: sortKey,
    })
    .select("*")
    .single();

  if (error) throw error;
  return toDFSEntry(data as DFSEntryRow);
}

/** Marks a DFSEntry final by hand; the status never changes automatically (docs/PRD.md section 8). */
export async function markDfsEntryFinal(supabase: SupabaseClient, entryId: string): Promise<void> {
  const { error } = await supabase
    .from("dfs_entries")
    .update({ status: "final", finalized_at: new Date().toISOString() })
    .eq("id", entryId);
  if (error) throw error;
}

export interface DeleteDfsEntryResult {
  lineupId: string;
  lineupHasOtherEntries: boolean;
}

/**
 * Hard-deletes a DFSEntry. Removes the entry only; the caller decides
 * whether to also offer deleting the Lineup when it has no remaining
 * entries (docs/PRD.md section 63.1).
 */
export async function deleteDfsEntry(supabase: SupabaseClient, entryId: string): Promise<DeleteDfsEntryResult> {
  const { data: entry, error: entryError } = await supabase
    .from("dfs_entries")
    .select("dfs_lineup_id")
    .eq("id", entryId)
    .single();
  if (entryError) throw entryError;
  const lineupId = entry.dfs_lineup_id as string;

  const { error } = await supabase.from("dfs_entries").delete().eq("id", entryId);
  if (error) throw error;

  const { data: remaining, error: remainingError } = await supabase
    .from("dfs_entries")
    .select("id")
    .eq("dfs_lineup_id", lineupId);
  if (remainingError) throw remainingError;

  return { lineupId, lineupHasOtherEntries: (remaining ?? []).length > 0 };
}
