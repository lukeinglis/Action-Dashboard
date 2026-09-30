import type { Ticket, TicketStatus } from "@/lib/types/domain";

export interface TicketWithStatus {
  ticket: Ticket;
  legCount: number;
  status: TicketStatus;
}
