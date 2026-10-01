// DFSLineup CRUD (docs/PRD.md section 40, 63.1).

import type { SupabaseClient } from "@supabase/supabase-js";
import { toDFSLineup, type DFSLineupRow } from "@/lib/db/rows";
import type { DFSLineup } from "@/lib/types/domain";

/** Thrown when a delete is blocked because a DFSEntry still references the Lineup (docs/PRD.md section 63.1). */
export class DfsLineupLinkedError extends Error {
  constructor() {
    super("DFSLineup is referenced by one or more DFSEntries");
    this.name = "DfsLineupLinkedError";
  }
}

export interface CreateDfsLineupInput {
  platform: string;
  sport: string;
  slateName?: string;
  importRecordId?: string;
}

export async function createDfsLineup(
  supabase: SupabaseClient,
  userId: string,
  input: CreateDfsLineupInput,
): Promise<DFSLineup> {
  const { data, error } = await supabase
    .from("dfs_lineups")
    .insert({
      user_id: userId,
      platform: input.platform,
      sport: input.sport,
      slate_name: input.slateName ?? null,
      import_record_id: input.importRecordId ?? null,
    })
    .select("*")
    .single();

  if (error) throw error;
  return toDFSLineup(data as DFSLineupRow);
}

/** Hard-deletes a DFSLineup. Blocked while any DFSEntry references it (docs/PRD.md section 63.1). */
export async function deleteDfsLineup(supabase: SupabaseClient, dfsLineupId: string): Promise<void> {
  const { data: entries, error: entriesError } = await supabase
    .from("dfs_entries")
    .select("id")
    .eq("dfs_lineup_id", dfsLineupId);
  if (entriesError) throw entriesError;
  if ((entries ?? []).length > 0) throw new DfsLineupLinkedError();

  const { error: slotsError } = await supabase.from("dfs_lineup_slots").delete().eq("dfs_lineup_id", dfsLineupId);
  if (slotsError) throw slotsError;

  const { error } = await supabase.from("dfs_lineups").delete().eq("id", dfsLineupId);
  if (error) throw error;
}
