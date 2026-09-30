// Event match-key logic. See docs/PRD.md section 20.2:
//   team sports:     sport + home team + away team + start date (user tz)
//   non-team sports: sport + league + normalized event name + start date (user tz)
//
// The match key is used both for the duplicate-check on manual creation and
// for auto-matching provider records to internal Events (Phase 6+).

export interface MatchKeyInput {
  sport: string;
  league?: string | null;
  name: string;
  startTimeUtc?: string | null;
  homeTeamId?: string | null;
  awayTeamId?: string | null;
}

/** Local calendar date (YYYY-MM-DD) for a UTC instant in the given IANA timezone. */
export function toLocalDateString(utcIso: string, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  // en-CA formats as YYYY-MM-DD.
  return formatter.format(new Date(utcIso));
}

export function normalizeEventName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Returns the match key, or null when there isn't enough information to
 * build one (e.g. a TBD start time). A null match key means "skip the
 * duplicate check" rather than "definitely unique."
 */
export function buildEventMatchKey(event: MatchKeyInput, timeZone: string): string | null {
  if (!event.startTimeUtc) return null;

  const localDate = toLocalDateString(event.startTimeUtc, timeZone);
  const isTeamSport = Boolean(event.homeTeamId && event.awayTeamId);

  if (isTeamSport) {
    return ["team", event.sport, event.homeTeamId, event.awayTeamId, localDate].join("|");
  }

  return [
    "nonteam",
    event.sport,
    event.league ?? "",
    normalizeEventName(event.name),
    localDate,
  ].join("|");
}
