import { ticketChipClass, type TicketColor } from "@/lib/tickets/ticket-code";

/**
 * The cross-reference handle: the same ticket reads identically in the Schedule
 * Rail (action by game) and the ticket grid (action by ticket).
 */
export function TicketChip({
  code,
  color,
  title,
}: {
  code: string;
  color: TicketColor;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset tabular-nums ${ticketChipClass(color)}`}
    >
      {code}
    </span>
  );
}
