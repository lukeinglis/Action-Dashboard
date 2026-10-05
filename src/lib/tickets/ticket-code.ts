// Short ticket codes and their colors. A code is the cross-reference handle
// between the Schedule Rail (action grouped by game) and the ticket grid
// (action grouped by ticket) — the same role the 3-letter tags play on the
// printed cheat sheets.
//
// Both code and color are stored nullable and derived when absent, so every
// existing ticket gets a stable code and color with no backfill.

export const TICKET_COLORS = [
  "sky",
  "emerald",
  "amber",
  "violet",
  "rose",
  "cyan",
  "lime",
  "orange",
  "fuchsia",
  "teal",
] as const;

export type TicketColor = (typeof TICKET_COLORS)[number];

/** Tailwind can't build class names at runtime, so each variant is spelled out. */
const CHIP_CLASS: Record<TicketColor, string> = {
  sky: "bg-sky-500/20 text-sky-300 ring-sky-500/40",
  emerald: "bg-emerald-500/20 text-emerald-300 ring-emerald-500/40",
  amber: "bg-amber-500/20 text-amber-300 ring-amber-500/40",
  violet: "bg-violet-500/20 text-violet-300 ring-violet-500/40",
  rose: "bg-rose-500/20 text-rose-300 ring-rose-500/40",
  cyan: "bg-cyan-500/20 text-cyan-300 ring-cyan-500/40",
  lime: "bg-lime-500/20 text-lime-300 ring-lime-500/40",
  orange: "bg-orange-500/20 text-orange-300 ring-orange-500/40",
  fuchsia: "bg-fuchsia-500/20 text-fuchsia-300 ring-fuchsia-500/40",
  teal: "bg-teal-500/20 text-teal-300 ring-teal-500/40",
};

export function ticketChipClass(color: TicketColor): string {
  return CHIP_CLASS[color];
}

/**
 * Multi-word names become initials ("Jets Moneyline Parlay" -> "JMP"); single
 * words become their first three letters ("Jersey" -> "JER"). Approximate by
 * design — the code is editable, this only has to be a sane starting point.
 */
export function deriveTicketCode(name: string | null | undefined): string {
  const cleaned = (name ?? "").replace(/[^a-zA-Z0-9 ]/g, " ").trim();
  if (cleaned === "") return "—";

  const words = cleaned.split(/\s+/).filter(Boolean);
  const code =
    words.length >= 2
      ? words.slice(0, 3).map((w) => w[0]).join("")
      : words[0].slice(0, 3);

  return code.toUpperCase();
}

/** Stable per-ticket color: the same seed always lands on the same swatch. */
export function deriveTicketColor(seed: string): TicketColor {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return TICKET_COLORS[hash % TICKET_COLORS.length];
}

export function resolveTicketCode(ticket: {
  code?: string | null;
  name?: string | null;
  generatedName?: string | null;
}): string {
  if (ticket.code) return ticket.code;
  return deriveTicketCode(ticket.name ?? ticket.generatedName);
}

export function resolveTicketColor(ticket: {
  id: string;
  color?: string | null;
  code?: string | null;
  name?: string | null;
  generatedName?: string | null;
}): TicketColor {
  if (ticket.color && (TICKET_COLORS as readonly string[]).includes(ticket.color)) {
    return ticket.color as TicketColor;
  }
  return deriveTicketColor(resolveTicketCode(ticket) + ticket.id);
}
