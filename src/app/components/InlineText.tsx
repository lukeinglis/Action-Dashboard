"use client";

import { useEffect, useRef, useState, useTransition } from "react";

interface Props {
  value: string | null;
  placeholder: string;
  onSave: (value: string | null) => Promise<void>;
  className?: string;
  inputClassName?: string;
  ariaLabel: string;
}

/**
 * Click-to-edit text. Enter or blur commits, Escape reverts. Used for ticket
 * names and leg descriptions so editing never leaves the dashboard.
 */
export function InlineText({ value, placeholder, onSave, className, inputClassName, ariaLabel }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  function commit() {
    setEditing(false);
    const next = draft.trim();
    if (next === (value ?? "")) return;
    startTransition(async () => {
      await onSave(next === "" ? null : next);
    });
  }

  if (!editing) {
    return (
      <button
        type="button"
        aria-label={ariaLabel}
        onClick={() => {
          setDraft(value ?? "");
          setEditing(true);
        }}
        disabled={isPending}
        className={`cursor-text rounded px-1 -mx-1 text-left hover:bg-white/5 disabled:opacity-50 ${className ?? ""}`}
      >
        {value ?? <span className="text-neutral-600">{placeholder}</span>}
      </button>
    );
  }

  return (
    <input
      ref={inputRef}
      aria-label={ariaLabel}
      value={draft}
      autoFocus
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") {
          setDraft(value ?? "");
          setEditing(false);
        }
      }}
      placeholder={placeholder}
      className={`w-full rounded border border-neutral-600 bg-neutral-950 px-1 -mx-1 outline-none focus:border-neutral-400 ${inputClassName ?? className ?? ""}`}
    />
  );
}
