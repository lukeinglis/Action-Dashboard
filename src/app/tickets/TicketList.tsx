"use client";

// The draggable Ticket list (§5.3).
//
// This list renders the cards the server sent, every time. The only thing it
// keeps locally is the id order a drag just produced, held until the server's
// own `sortKey` order catches up — see `applyPendingOrder`. Keeping the cards
// themselves in state instead would mean a refresh that settles half the
// tickets changes nothing on screen until a full page reload.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { reorderTicket } from "./actions";
import { TicketCard } from "./TicketCard";
import { applyPendingOrder } from "@/lib/tickets/pending-order";
import type { TicketWithStatus } from "./types";

export function TicketList({ items: serverItems }: { items: TicketWithStatus[] }) {
  const [pendingIds, setPendingIds] = useState<string[] | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  const items = useMemo(
    () => applyPendingOrder(serverItems, pendingIds, (i) => i.ticket.id),
    [serverItems, pendingIds],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex((i) => i.ticket.id === active.id);
    const newIndex = items.findIndex((i) => i.ticket.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(items, oldIndex, newIndex);
    setPendingIds(reordered.map((i) => i.ticket.id));

    const before = reordered[newIndex - 1]?.ticket.sortKey ?? null;
    const after = reordered[newIndex + 1]?.ticket.sortKey ?? null;
    const movedId = reordered[newIndex].ticket.id;

    startTransition(async () => {
      // The action revalidates, so the new order arrives as props; the pending
      // override then matches the server and stops applying by itself.
      await reorderTicket(movedId, before, after);
      router.refresh();
    });
  }

  return (
    <DndContext
      id="tickets-dnd"
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={items.map((i) => i.ticket.id)} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {items.map((item) => (
            <TicketCard
              key={item.ticket.id}
              item={item}
              // Deletion is a server change like any other, so let
              // revalidation remove the card rather than hiding it locally.
              onDeleted={() => router.refresh()}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
