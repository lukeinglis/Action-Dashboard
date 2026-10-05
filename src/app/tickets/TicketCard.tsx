"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { TicketCardBody } from "./TicketCardBody";
import type { TicketWithStatus } from "./types";

export function TicketCard({ item, onDeleted }: { item: TicketWithStatus; onDeleted: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.ticket.id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
    >
      <TicketCardBody
        item={item}
        onDeleted={onDeleted}
        dragHandle={
          <button
            type="button"
            aria-label="Drag to reorder"
            className="cursor-grab px-0.5 text-neutral-700 hover:text-neutral-400"
            {...attributes}
            {...listeners}
          >
            ⠿
          </button>
        }
      />
    </div>
  );
}
