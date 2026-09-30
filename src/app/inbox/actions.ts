"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  approveImportRecord as approveImportRecordLib,
  createImportRecord,
  deleteImportRecord as deleteImportRecordLib,
  rejectImportRecord as rejectImportRecordLib,
} from "@/lib/import-records/import-records";
import { createTicket, type CreateTicketInput } from "@/lib/tickets/tickets";

const BUCKET = "screenshots";

async function requireUserId(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user.id;
}

/**
 * Uploads one or more screenshots to private Storage and creates an
 * ImportRecord for each (docs/PRD.md section 29.1). Accepts a batch upload
 * so a user can queue several slips from their phone in one go.
 */
export async function uploadScreenshot(formData: FormData): Promise<void> {
  const files = formData.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) {
    throw new Error("No file provided");
  }

  const supabase = await createClient();
  const userId = await requireUserId(supabase);

  for (const file of files) {
    const extension = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
    const storagePath = `${userId}/${crypto.randomUUID()}.${extension}`;

    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, file, {
      contentType: file.type || undefined,
    });
    if (uploadError) throw uploadError;

    await createImportRecord(supabase, userId, {
      source: "screenshot",
      originalFilename: file.name,
      storagePath,
    });
  }

  revalidatePath("/inbox");
  redirect("/inbox");
}

export async function getImportRecordImageUrl(storagePath: string): Promise<string | null> {
  const supabase = await createClient();
  await requireUserId(supabase);

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 60 * 10);
  if (error) return null;
  return data.signedUrl;
}

/**
 * Approves an ImportRecord: creates the transcribed Ticket linked to it,
 * deletes the stored image, and marks it approved (docs/PRD.md section 29.1,
 * 31). The image is never retained after approval.
 */
export async function approveImportRecord(
  importRecordId: string,
  storagePath: string | null,
  ticketInput: CreateTicketInput,
): Promise<void> {
  const supabase = await createClient();
  const userId = await requireUserId(supabase);

  await createTicket(supabase, userId, { ...ticketInput, importRecordId });

  if (storagePath) {
    await supabase.storage.from(BUCKET).remove([storagePath]);
  }
  await approveImportRecordLib(supabase, importRecordId);

  revalidatePath("/inbox");
  revalidatePath("/tickets");
  redirect("/inbox");
}

/** Rejects an ImportRecord, deleting its stored image immediately (docs/PRD.md section 29.1). */
export async function rejectImportRecord(importRecordId: string, storagePath: string | null): Promise<void> {
  const supabase = await createClient();
  await requireUserId(supabase);

  if (storagePath) {
    await supabase.storage.from(BUCKET).remove([storagePath]);
  }
  await rejectImportRecordLib(supabase, importRecordId);

  revalidatePath("/inbox");
  redirect("/inbox");
}

/** Hard-deletes an ImportRecord; created records remain with importRecordId set to null (docs/PRD.md section 63.1). */
export async function deleteImportRecord(importRecordId: string, storagePath: string | null): Promise<void> {
  const supabase = await createClient();
  await requireUserId(supabase);

  if (storagePath) {
    await supabase.storage.from(BUCKET).remove([storagePath]);
  }
  await deleteImportRecordLib(supabase, importRecordId);

  revalidatePath("/inbox");
  redirect("/inbox");
}
