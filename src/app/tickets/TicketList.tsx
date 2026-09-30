"use client";

import { useState, useTransition } from "react";
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
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { reorderTicket } from "./actions";
import { TicketCard } from "./TicketCard";
import type { TicketWithStatus } from "./types";

export function TicketList({ items: initialItems }: { items: TicketWithStatus[] }) {
  const [items, setItems] = useState(initialItems);
  const [, startTransition] = useTransition();

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
    setItems(reordered);

    const before = reordered[newIndex - 1]?.ticket.sortKey ?? null;
    const after = reordered[newIndex + 1]?.ticket.sortKey ?? null;
    const movedId = reordered[newIndex].ticket.id;

    startTransition(async () => {
      const newKey = await reorderTicket(movedId, before, after);
      setItems((prev) =>
        prev.map((i) => (i.ticket.id === movedId ? { ...i, ticket: { ...i.ticket, sortKey: newKey } } : i)),
      );
    });
  }

  return (
    <DndContext
      id="tickets-dnd"
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={items.map((i) => i.ticket.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-3">
          {items.map((item) => (
            <TicketCard
              key={item.ticket.id}
              item={item}
              onDeleted={() => setItems((prev) => prev.filter((i) => i.ticket.id !== item.ticket.id))}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
