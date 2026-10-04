import type { LegSettlement, Ticket, TicketStatus } from "@/lib/types/domain";

export interface TicketLegSummary {
  id: string;
  marketType: string;
  selection: string | null;
  rawDescription: string | null;
  line: number | null;
  oddsAmerican: number | null;
  settlement: LegSettlement;
}

export interface TicketWithStatus {
  ticket: Ticket;
  legCount: number;
  status: TicketStatus;
  legs: TicketLegSummary[];
}
