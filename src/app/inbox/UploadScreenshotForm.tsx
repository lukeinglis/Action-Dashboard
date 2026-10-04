"use client";

import { useRef, useState, useTransition } from "react";
import { uploadScreenshot } from "./actions";

const MAX_DIMENSION = 1920;
const JPEG_QUALITY = 0.82;

/**
 * Vercel hard-caps function request bodies at 4.5MB (non-configurable), and
 * real camera-roll photos of bet slips can easily blow past that in a batch.
 * Downscale/recompress client-side so uploads actually make it through.
 */
async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    if (!blob || blob.size >= file.size) return file;

    const newName = file.name.replace(/\.(heic|heif|png|webp|jpe?g)$/i, "") + ".jpg";
    return new File([blob], newName, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

function isRedirectError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "digest" in err &&
    typeof (err as { digest?: unknown }).digest === "string" &&
    (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

export function UploadScreenshotForm() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const files = inputRef.current?.files;
    if (!files || files.length === 0) return;
    setError(null);

    startTransition(async () => {
      try {
        const compressed = await Promise.all(Array.from(files).map(compressImage));
        const formData = new FormData();
        for (const file of compressed) formData.append("file", file);
        await uploadScreenshot(formData);
      } catch (err) {
        if (isRedirectError(err)) throw err;
        setError(err instanceof Error ? err.message : "Upload failed");
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-lg border border-neutral-800 p-4 sm:flex-row sm:items-center"
    >
      <input
        ref={inputRef}
        type="file"
        name="file"
        accept="image/*,.heic,.heif"
        multiple
        required
        className="min-w-0 flex-1 text-sm text-neutral-300"
      />
      <button
        type="submit"
        disabled={isPending}
        className="rounded bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-900 disabled:opacity-50"
      >
        {isPending ? "Uploading..." : "Upload Screenshot"}
      </button>
      {error && <p className="text-xs text-red-400 sm:basis-full">{error}</p>}
    </form>
  );
}
