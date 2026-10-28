// Participant/Event matching and subject/direction proposal for a parsed
// leg (docs/PRD.md section 30: "Participant Matching", "Event Matching",
// "Subject and Direction Proposal"). Pure functions — callers fetch the
// candidate Teams/Participants/Events once and pass them in; nothing here
// touches the database, so unmatched legs/subjects are simply flagged for
// the review screen rather than silently created.

import { buildEventMatchKey, buildTeamPairKey, normalizeEventName } from "@/lib/events/match-key";
import { allowsTeamSubject, defaultSubjectDirection, marketCategory } from "@/lib/betting/subjects";
import { soleMatchingSide } from "@/lib/teams/match-side";
import type { RootingDirection } from "@/lib/types/domain";
import type { ParsedLeg } from "./parse-slip-text";

export interface TeamCandidate {
  id: string;
  sport: string;
  name: string;
  abbreviation?: string | null;
}

export interface ParticipantCandidate {
  id: string;
  sport: string;
  name: string;
}

export interface EventCandidate {
  id: string;
  sport: string;
  league?: string | null;
  name: string;
  startTimeUtc?: string | null;
  homeTeamId?: string | null;
  awayTeamId?: string | null;
}

export interface MatchCandidates {
  teams: TeamCandidate[];
  participants: ParticipantCandidate[];
  events: EventCandidate[];
}

export interface SubjectProposal {
  name: string;
  teamId?: string;
  participantId?: string;
  matched: boolean;
  /**
   * The named player has no Participant record yet and approval should create
   * one (docs/PRD.md §30: "Participant Matching").
   *
   * Only set for player props, where the subject cannot be anything but a
   * player — `allowsTeamSubject` is already false for that category. Everywhere
   * else an unmatched name is ambiguous (a team we don't carry? a typo?), so it
   * stays unmatched for the user to resolve.
   *
   * Without this an unmatched prop subject was dropped on approval, taking the
   * Over/Under direction with it, and nothing in the app ever created a
   * Participant — so no player prop could be graded at all.
   */
  createParticipant?: boolean;
  direction: RootingDirection;
}

export interface LegMatch {
  /** True when the leg named two teams (a single-game leg), false for futures/cross-game matchups. */
  eventExpected: boolean;
  eventId?: string;
  eventMatched: boolean;
  subjects: SubjectProposal[];
}

// Extraction can't always determine Sport (docs/PRD.md section 30 note on
// Sport inference) — when the parsed leg's sport is unknown, fall back to
// matching by name alone rather than failing to match at all.
export function findTeam(name: string, sport: string, teams: TeamCandidate[]): TeamCandidate | undefined {
  const norm = normalizeEventName(name);
  const sportOk = (t: TeamCandidate) => !sport || t.sport === sport;

  const exact = teams.filter(
    (t) =>
      sportOk(t) &&
      (normalizeEventName(t.name) === norm || (t.abbreviation && normalizeEventName(t.abbreviation) === norm)),
  );
  if (exact.length) return soleSport(exact);

  // Sportsbook apps commonly display a team as "<abbreviation> <mascot>"
  // (e.g. "JAX Jaguars") rather than the full name ("Jacksonville Jaguars")
  // or the bare abbreviation ("JAX") — neither of which the exact check
  // above matches. Recognize that hybrid form against each candidate.
  const hybrid = teams.filter((t) => {
    if (!sportOk(t) || !t.abbreviation) return false;
    const mascot = t.name.trim().split(/\s+/).pop();
    if (!mascot) return false;
    return norm === normalizeEventName(`${t.abbreviation} ${mascot}`);
  });
  if (hybrid.length) return soleSport(hybrid);

  // The same hybrid, but shortened by the *city's* initials rather than the
  // team's abbreviation: a slip says "LA Rams" and "NY Giants" where the
  // abbreviations are "LAR" and "NYG", so the check above misses them.
  //
  // Worth its own pass because the failure is silent and inverted rather than
  // merely unmatched: with no team on the selection, `matchParsedLeg` falls
  // back to comparing printed strings, picks the backed side as the opponent,
  // and the leg ends up rooting against the team the user bet on.
  //
  // The mascot has to match too, which is what makes this unambiguous — two
  // teams can share a city, never a city and a mascot.
  const initials = teams.filter((t) => {
    if (!sportOk(t)) return false;
    const words = t.name.trim().split(/\s+/);
    if (words.length < 2) return false;
    const mascot = words[words.length - 1];
    const prefix = words.slice(0, -1).map((w) => w[0]).join("");
    return norm === normalizeEventName(`${prefix} ${mascot}`);
  });
  return initials.length ? soleSport(initials) : undefined;
}

/**
 * The first match, unless they span more than one sport — in which case there
 * is no answer, only a guess.
 *
 * This only ever bites on the unknown-sport path above, because a known sport
 * has already filtered the candidates down to one. It matters because a college
 * program fields more than one team under the very same name: ESPN lists 264
 * schools whose college-football and college-basketball `displayName` are
 * byte-identical (and 266 sharing an abbreviation), so "Auburn Tigers" is two
 * Team rows the moment both sports are tracked.
 *
 * Picking the first would be picking by row order. §20.2 reports an ambiguous
 * match rather than choosing, and here the cost of choosing is concrete: the
 * sport decided here is the sport the Event is filed under and the schedule the
 * leg is graded against, so a football bet resolved to basketball Auburn grades
 * off the wrong game entirely.
 *
 * Matches *within* one sport still take the first, which is the pre-existing
 * behaviour: a duplicate row is the same team either way.
 */
function soleSport(matches: TeamCandidate[]): TeamCandidate | undefined {
  const sports = new Set(matches.map((t) => t.sport));
  return sports.size === 1 ? matches[0] : undefined;
}

function findParticipant(
  name: string,
  sport: string,
  participants: ParticipantCandidate[],
): ParticipantCandidate | undefined {
  const norm = normalizeEventName(name);
  return participants.find((p) => (!sport || p.sport === sport) && normalizeEventName(p.name) === norm);
}

function sameName(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  return normalizeEventName(a) === normalizeEventName(b);
}

/**
 * The team a spread/moneyline selection names, tolerating the line printed
 * alongside it.
 *
 * Books print a spread selection as "LV Raiders +3.5" and only sometimes
 * repeat the team under its own Subject line. Matching the whole string finds
 * no team, which left the leg's primary subject as that raw text with no
 * teamId — and grading reads the backed team off exactly that subject, so
 * every spread leg was silently ungradeable.
 *
 * The full name is tried first so a team whose name genuinely ends in a
 * number keeps matching.
 */
function findSelectionTeam(
  name: string,
  resolve: (name: string) => TeamCandidate | undefined,
): { team?: TeamCandidate; name: string } {
  const exact = resolve(name);
  if (exact) return { team: exact, name };

  const withoutLine = name.replace(/\s*[+-]?\d+(?:\.\d+)?\s*$/, "").trim();
  if (!withoutLine || withoutLine === name) return { name };

  const team = resolve(withoutLine);
  return team ? { team, name: withoutLine } : { name };
}

/**
 * A leg's two sides, already reconciled to Team rows by something that had more
 * to go on than the printed text — `ensureMatchupTeams` pins the pair against a
 * provider game, so the name on the slip has been checked against the
 * provider's canonical spelling rather than against the user's whole roster.
 */
export interface MatchupSides {
  awayTeam: TeamCandidate;
  homeTeam: TeamCandidate;
}

/**
 * `matchup` short-circuits the part of this that the printed text cannot do.
 *
 * Books print the program where the provider prints the full team, and
 * `findTeam` is exact — so "Auburn" never finds the "Auburn Tigers" row, and a
 * leg whose slip spells either side short resolves no Event and, worse, no
 * *backed* subject: grading reads the backed team off the subject, so the leg
 * is ungradeable while still looking saved. Supplying the pair replaces every
 * one of those lookups with a row, and lets the subject names be told apart
 * between just those two teams — a decision `soleMatchingSide` can make safely
 * and `findTeam` cannot make at all.
 */
export function matchParsedLeg(
  leg: ParsedLeg,
  candidates: MatchCandidates,
  timeZone: string,
  matchup?: MatchupSides,
): LegMatch {
  const category = marketCategory(leg.marketType);
  const eventExpected = Boolean(leg.awayTeamName && leg.homeTeamName);

  // Only where the market can have a team subject at all: a player prop's
  // subject is a person, and letting a surname match a team by word-run is how
  // "Washington" would end up stored as the Commanders.
  const sides =
    matchup && allowsTeamSubject(leg.marketType) ? [matchup.awayTeam, matchup.homeTeam] : undefined;
  const resolveTeam = (name: string): TeamCandidate | undefined =>
    (sides ? soleMatchingSide(name, sides) : undefined) ??
    findTeam(name, leg.sport, candidates.teams);

  let eventId: string | undefined;
  if (eventExpected) {
    const awayTeam = matchup?.awayTeam ?? findTeam(leg.awayTeamName!, leg.sport, candidates.teams);
    const homeTeam = matchup?.homeTeam ?? findTeam(leg.homeTeamName!, leg.sport, candidates.teams);
    if (awayTeam && homeTeam) {
      // leg.sport may be unknown (empty); the matched teams' own sport is
      // authoritative and required to build a key comparable to candidates'.
      const effectiveSport = leg.sport || awayTeam.sport || homeTeam.sport;
      const matchKey = buildEventMatchKey(
        {
          sport: effectiveSport,
          league: leg.league,
          name: `${leg.awayTeamName} @ ${leg.homeTeamName}`,
          startTimeUtc: leg.startTimeUtc,
          homeTeamId: homeTeam.id,
          awayTeamId: awayTeam.id,
        },
        timeZone,
      );
      if (matchKey) {
        eventId = candidates.events.find(
          (e) =>
            buildEventMatchKey(
              {
                sport: e.sport,
                league: e.league,
                name: e.name,
                startTimeUtc: e.startTimeUtc,
                homeTeamId: e.homeTeamId,
                awayTeamId: e.awayTeamId,
              },
              timeZone,
            ) === matchKey,
        )?.id;
      }

      // Real bet-slip screenshots frequently don't show a per-leg kickoff
      // time, so leg.startTimeUtc is often missing and the date-keyed match
      // above can't run at all (buildEventMatchKey returns null without a
      // start time). Fall back to matching by team pair alone — two teams
      // rarely have more than one scheduled meeting in the near term — and
      // pick the candidate closest to now when more than one exists.
      if (!eventId) {
        const pairKey = buildTeamPairKey(effectiveSport, awayTeam.id, homeTeam.id);
        const pairCandidates = candidates.events.filter(
          (e) => e.homeTeamId && e.awayTeamId && buildTeamPairKey(e.sport, e.awayTeamId, e.homeTeamId) === pairKey,
        );
        if (pairCandidates.length === 1) {
          eventId = pairCandidates[0].id;
        } else if (pairCandidates.length > 1) {
          const now = Date.now();
          eventId = pairCandidates.reduce<EventCandidate | undefined>((closest, e) => {
            if (!e.startTimeUtc) return closest;
            if (!closest?.startTimeUtc) return e;
            const eDiff = Math.abs(new Date(e.startTimeUtc).getTime() - now);
            const closestDiff = Math.abs(new Date(closest.startTimeUtc).getTime() - now);
            return eDiff < closestDiff ? e : closest;
          }, undefined)?.id;
        }
      }
    }
  }

  const subjects: SubjectProposal[] = [];
  function propose(name: string | undefined, role: "primary" | "opponent", resolved?: TeamCandidate) {
    if (!name) return;
    const team = resolved ?? resolveTeam(name);
    const participant = team ? undefined : findParticipant(name, leg.sport, candidates.participants);
    const unmatchedPlayer = !team && !participant && category === "player_over_under";
    subjects.push({
      name,
      teamId: team?.id,
      participantId: participant?.id,
      matched: Boolean(team || participant),
      // Set only when true, so the review payload carries the flag solely for
      // the subjects approval will act on.
      ...(unmatchedPlayer && { createParticipant: true as const }),
      direction: defaultSubjectDirection(leg.marketType, role, leg.overUnder),
    });
  }

  switch (category) {
    case "game_total":
      propose(leg.awayTeamName, "primary");
      propose(leg.homeTeamName, "primary");
      break;
    case "team_vs_opponent": {
      const primary = findSelectionTeam(leg.subject ?? leg.selection, resolveTeam);
      propose(primary.name, "primary", primary.team);

      // Pick the opposite side by team identity, not by comparing the printed
      // strings. A slip writes the event as "LV @ NE" but the selection as
      // "LV Raiders", and those two spellings are not equal as text — so the
      // side actually bet on was taken for the opponent and proposed
      // "against", leaving the ticket rooting against its own pick and never
      // recording the real opponent at all.
      const opponentName = primary.team
        ? [leg.awayTeamName, leg.homeTeamName].find((n) => n && resolveTeam(n)?.id !== primary.team!.id)
        : [leg.awayTeamName, leg.homeTeamName].find((n) => n && !sameName(n, primary.name));
      propose(opponentName, "opponent");
      break;
    }
    case "matchup": {
      const primaryName = leg.subject ?? leg.selection;
      propose(primaryName, "primary");
      const opponentName =
        leg.opponentSubject ?? [leg.awayTeamName, leg.homeTeamName].find((n) => n && !sameName(n, primaryName));
      propose(opponentName, "opponent");
      break;
    }
    case "team_total":
    case "player_over_under":
      propose(leg.subject, "primary");
      break;
    case "selection_only":
      propose(leg.subject ?? leg.selection, "primary");
      break;
    case "neutral":
    default:
      break;
  }

  return { eventExpected, eventId, eventMatched: Boolean(eventId), subjects };
}
