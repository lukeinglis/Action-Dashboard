// Ticket duplicate detection (docs/PRD.md section 32): warn but never
// block. A match on sportsbook ticket ID is decisive; otherwise falls back
// to sportsbook + stake + to-win + placement timestamp all matching.

export interface DuplicateTicketCandidate {
  id: string;
  sportsbookTicketId?: string | null;
  sportsbook?: string | null;
  stakeCents: number;
  toWinCents: number;
  placedAt?: string | null;
}

export interface DuplicateCheckInput {
  sportsbookTicketId?: string;
  sportsbook?: string;
  stakeCents: number;
  toWinCents: number;
  placedAt?: string;
}

export function findDuplicateTicket(
  parsed: DuplicateCheckInput,
  existing: DuplicateTicketCandidate[],
): DuplicateTicketCandidate | undefined {
  if (parsed.sportsbookTicketId) {
    const byId = existing.find((t) => t.sportsbookTicketId === parsed.sportsbookTicketId);
    if (byId) return byId;
  }

  return existing.find(
    (t) =>
      t.sportsbook === (parsed.sportsbook ?? null) &&
      t.stakeCents === parsed.stakeCents &&
      t.toWinCents === parsed.toWinCents &&
      t.placedAt === (parsed.placedAt ?? null),
  );
}
