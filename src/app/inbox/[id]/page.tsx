import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { toImportRecord, type ImportRecordRow } from "@/lib/db/rows";
import { fetchMatchCandidates } from "@/lib/import/candidates";
import type { ImportReview } from "@/lib/import/pipeline";
import { getImportRecordImageUrl } from "../actions";
import { TranscribeForm } from "./TranscribeForm";
import { ReviewForm } from "./ReviewForm";

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

  const isReview = record.status === "needs_review" && record.parsedPayload;

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <h1 className="text-lg font-semibold text-neutral-100">
        {isReview ? "Review Import" : record.status === "failed" ? "Parse Failed" : "Transcribe Screenshot"}
      </h1>

      {record.status === "failed" && record.parseError && (
        <p className="rounded border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-300">
          {record.parseError}
        </p>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {imageUrl ? (
          <div className="rounded-lg border border-neutral-800 p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt={record.originalFilename ?? "Screenshot"} className="w-full rounded" />
          </div>
        ) : record.extractedText ? (
          <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap rounded-lg border border-neutral-800 p-3 text-xs text-neutral-400">
            {record.extractedText}
          </pre>
        ) : (
          <p className="p-4 text-sm text-neutral-500">No source available.</p>
        )}

        {isReview ? (
          <ReviewForm
            importRecordId={record.id}
            storagePath={record.storagePath ?? null}
            review={record.parsedPayload as ImportReview}
            events={(await fetchMatchCandidates(supabase, user.id)).events.map((e) => ({ id: e.id, name: e.name }))}
          />
        ) : (
          <TranscribeForm importRecordId={record.id} storagePath={record.storagePath ?? null} />
        )}
      </div>
    </div>
  );
}
