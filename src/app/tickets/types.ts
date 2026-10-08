import type { LegSettlement, LiveLegState, Ticket, TicketStatus } from "@/lib/types/domain";

export interface TicketLegSummary {
  id: string;
  marketType: string;
  selection: string | null;
  rawDescription: string | null;
  line: number | null;
  oddsAmerican: number | null;
  settlement: LegSettlement;
  /** Whether the leg is currently winning (§26.1), from the last refresh. */
  liveState: LiveLegState;
  /** Short phrase behind the live state, e.g. "covering by 3.5". */
  liveDetail: string | null;
}

export interface TicketWithStatus {
  ticket: Ticket;
  legCount: number;
  status: TicketStatus;
  legs: TicketLegSummary[];
}
