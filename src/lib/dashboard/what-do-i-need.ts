// What Do I Need? pane (docs/PRD.md section 16): a compact cross-event
// summary of unresolved winning conditions, grouped by LIVE/UP NEXT, each
// annotated with rooting context (e.g. "Egbuka - MIXED") from section 17.

import type { RootingLabel } from "./exposure";
import type { StateGroup } from "./schedule";

export interface OpenLegForPane {
  legId: string;
  ticketId: string;
  description: string;
  eventId?: string | null;
  subjects: Array<{ name: string; teamId?: string | null; participantId?: string | null }>;
}

export interface WhatDoINeedSubject {
  name: string;
  label: RootingLabel;
}

export interface WhatDoINeedEntry {
  legId: string;
  ticketId: string;
  description: string;
  group: StateGroup | "UNSCHEDULED";
  subjects: WhatDoINeedSubject[];
}

function subjectKeyOf(s: { teamId?: string | null; participantId?: string | null }): string | null {
  if (s.teamId) return `team:${s.teamId}`;
  if (s.participantId) return `participant:${s.participantId}`;
  return null;
}

export function buildWhatDoINeed(
  openLegs: OpenLegForPane[],
  groupByEventId: Map<string, StateGroup>,
  rootingLabelByKey: Map<string, RootingLabel>,
): WhatDoINeedEntry[] {
  return openLegs.map((leg) => ({
    legId: leg.legId,
    ticketId: leg.ticketId,
    description: leg.description,
    group: leg.eventId ? groupByEventId.get(leg.eventId) ?? "UNSCHEDULED" : "UNSCHEDULED",
    subjects: leg.subjects.map((s) => {
      const key = subjectKeyOf(s);
      return { name: s.name, label: (key && rootingLabelByKey.get(key)) || "NEUTRAL" };
    }),
  }));
}

const PANE_GROUPS: (StateGroup | "UNSCHEDULED")[] = ["LIVE", "UP NEXT"];

/** The pane only shows LIVE and UP NEXT entries (docs/PRD.md section 16). */
export function relevantWhatDoINeedEntries(entries: WhatDoINeedEntry[]): WhatDoINeedEntry[] {
  return entries.filter((e) => PANE_GROUPS.includes(e.group));
}
