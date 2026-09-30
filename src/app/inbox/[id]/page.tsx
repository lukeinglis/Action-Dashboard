import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { toImportRecord, type ImportRecordRow } from "@/lib/db/rows";
import { getImportRecordImageUrl } from "../actions";
import { TranscribeForm } from "./TranscribeForm";

export default async function InboxItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("import_records")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) notFound();

  const record = toImportRecord(data as ImportRecordRow);
  const imageUrl = record.storagePath ? await getImportRecordImageUrl(record.storagePath) : null;

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <h1 className="text-lg font-semibold text-neutral-100">Transcribe Screenshot</h1>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-lg border border-neutral-800 p-2">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt={record.originalFilename ?? "Screenshot"} className="w-full rounded" />
          ) : (
            <p className="p-4 text-sm text-neutral-500">No image available.</p>
          )}
        </div>
        <TranscribeForm importRecordId={record.id} storagePath={record.storagePath ?? null} />
      </div>
    </div>
  );
}
