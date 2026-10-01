import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listPendingImportRecords } from "@/lib/import-records/import-records";
import { pasteSlipText, uploadScreenshot } from "./actions";

export default async function InboxPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const records = await listPendingImportRecords(supabase, user.id);

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-neutral-100">
          Inbox
          {records.length > 0 && (
            <span className="ml-2 text-sm font-normal text-neutral-500">{records.length} to review</span>
          )}
        </h1>
        <Link href="/tickets" className="text-sm text-neutral-300 underline">
          Tickets
        </Link>
      </div>

      <form action={uploadScreenshot} className="flex items-center gap-3 rounded-lg border border-neutral-800 p-4">
        <input
          type="file"
          name="file"
          accept="image/*,.heic,.heif"
          capture="environment"
          multiple
          required
          className="flex-1 text-sm text-neutral-300"
        />
        <button
          type="submit"
          className="rounded bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-900"
        >
          Upload Screenshot
        </button>
      </form>

      <form action={pasteSlipText} className="space-y-2 rounded-lg border border-neutral-800 p-4">
        <label className="block text-xs text-neutral-400">
          Paste Text
          <textarea
            name="text"
            required
            rows={4}
            placeholder="Paste a Bet Slip..."
            className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
          />
        </label>
        <button
          type="submit"
          className="rounded bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-900"
        >
          Parse Text
        </button>
      </form>

      {records.length === 0 && <p className="text-sm text-neutral-500">Nothing to review.</p>}

      <div className="space-y-3">
        {records.map((record) => (
          <Link
            key={record.id}
            href={`/inbox/${record.id}`}
            className="flex items-center justify-between rounded-lg border border-neutral-800 p-4"
          >
            <div>
              <p className="font-medium text-neutral-100">{record.originalFilename ?? "Screenshot"}</p>
              <p className="text-xs text-neutral-500">
                {new Date(record.createdAt).toLocaleString()}
              </p>
            </div>
            <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300">
              {record.status}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
