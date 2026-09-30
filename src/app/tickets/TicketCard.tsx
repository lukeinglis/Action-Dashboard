"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { formatCents } from "@/lib/betting/money";
import type { TicketStatus } from "@/lib/types/domain";
import { deleteTicket, setManualTicketStatus } from "./actions";
import type { TicketWithStatus } from "./types";

const STATUSES: TicketStatus[] = ["pending", "active", "won", "lost", "void", "cashed_out"];

export function TicketCard({ item, onDeleted }: { item: TicketWithStatus; onDeleted: () => void }) {
  const { ticket, legCount, status } = item;
  const [isPending, startTransition] = useTransition();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: ticket.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-lg border border-neutral-800 p-4"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Drag to reorder"
            className="cursor-grab text-neutral-600"
            {...attributes}
            {...listeners}
          >
            ⠿
          </button>
          <Link href={`/tickets/${ticket.id}`} className="font-medium text-neutral-100 hover:underline">
            {ticket.name ?? ticket.generatedName ?? ticket.sportsbook ?? "Ticket"}
          </Link>
        </div>
        <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300">{status}</span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-neutral-300">
        <span>Stake {formatCents(ticket.stakeCents)}</span>
        <span>To Win {formatCents(ticket.toWinCents)}</span>
        <span>{legCount} leg{legCount === 1 ? "" : "s"}</span>
        {ticket.isBonusBet && <span className="text-amber-400">bonus</span>}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <select
          value={ticket.manualStatus ?? ""}
          disabled={isPending}
          onChange={(e) =>
            startTransition(() =>
              setManualTicketStatus(ticket.id, (e.target.value || null) as TicketStatus | null),
            )
          }
          className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-neutral-300"
        >
          <option value="">Automatic ({status})</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              Manual: {s}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            if (!window.confirm("Delete this Ticket? This cascades to its legs and links.")) return;
            startTransition(async () => {
              await deleteTicket(ticket.id);
              onDeleted();
            });
          }}
          className="rounded border border-neutral-700 px-2 py-1 text-neutral-300"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
