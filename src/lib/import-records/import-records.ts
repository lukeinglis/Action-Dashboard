import type { SupabaseClient } from "@supabase/supabase-js";
import { toImportRecord, type ImportRecordRow } from "@/lib/db/rows";
import type { ImportRecord, ImportSource } from "@/lib/types/domain";

export interface CreateImportRecordInput {
  source: ImportSource;
  originalFilename?: string;
  storagePath?: string;
}

export async function createImportRecord(
  supabase: SupabaseClient,
  userId: string,
  input: CreateImportRecordInput,
): Promise<ImportRecord> {
  const { data, error } = await supabase
    .from("import_records")
    .insert({
      user_id: userId,
      source: input.source,
      status: "uploaded",
      original_filename: input.originalFilename ?? null,
      storage_path: input.storagePath ?? null,
    })
    .select("*")
    .single();

  if (error) throw error;
  return toImportRecord(data as ImportRecordRow);
}

/** Every ImportRecord not yet approved or rejected, newest first (docs/PRD.md section 29.1). */
export async function listPendingImportRecords(
  supabase: SupabaseClient,
  userId: string,
): Promise<ImportRecord[]> {
  const { data, error } = await supabase.from("import_records").select("*").eq("user_id", userId);
  if (error) throw error;

  const rows = (data ?? []) as ImportRecordRow[];
  return rows
    .filter((row) => row.status !== "approved" && row.status !== "rejected")
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .map(toImportRecord);
}

/**
 * Marks an ImportRecord approved and clears its storage_path row reference.
 * The caller is responsible for deleting the underlying storage object.
 */
export async function approveImportRecord(supabase: SupabaseClient, importRecordId: string): Promise<void> {
  const { error } = await supabase
    .from("import_records")
    .update({ status: "approved", approved_at: new Date().toISOString(), storage_path: null })
    .eq("id", importRecordId);
  if (error) throw error;
}

/**
 * Marks an ImportRecord rejected and clears its storage_path row reference.
 * The caller is responsible for deleting the underlying storage object.
 */
export async function rejectImportRecord(supabase: SupabaseClient, importRecordId: string): Promise<void> {
  const { error } = await supabase
    .from("import_records")
    .update({ status: "rejected", storage_path: null })
    .eq("id", importRecordId);
  if (error) throw error;
}

/**
 * Hard-deletes an ImportRecord; created records remain, with their
 * importRecordId set to null (docs/PRD.md section 63.1). The caller is
 * responsible for deleting the underlying storage object, if any.
 */
export async function deleteImportRecord(supabase: SupabaseClient, importRecordId: string): Promise<void> {
  const { error: ticketsError } = await supabase
    .from("tickets")
    .update({ import_record_id: null })
    .eq("import_record_id", importRecordId);
  if (ticketsError) throw ticketsError;

  const { error } = await supabase.from("import_records").delete().eq("id", importRecordId);
  if (error) throw error;
}
