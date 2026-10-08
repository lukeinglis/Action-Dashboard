// Resolves the user's participants to a stats provider's players. See
// docs/PRD.md §20.2 (the matching ladder) and §30 (extraction).
//
// Pure, so the matching can be tested against a captured stat payload with no
// network and no database.
//
// The problem this solves is that the two sides name players differently. A
// DraftKings slip prints "D. Egbuka"; Sleeper carries "Devin Egbuka". Exact
// name matching — which is all the import path does today — fails on every
// abbreviated first name, which is to say on almost every prop.
//
// So the ladder is, in order:
//
//   1. an existing mapping, which a user may have fixed by hand
//   2. exact normalized full name            "devin egbuka"
//   3. first initial + surname               "d egbuka" -> "devin egbuka"
//   4. surname alone, only if unique         "egbuka"
//
// Each rung narrows by team first when the participant has one, because
// surnames repeat across the league and a prop slip almost always shows the
// player's team. §20.2's rule is inherited throughout: exactly one candidate is
// a match, zero or several is not, and a near-miss is reported for the user to
// resolve rather than guessed at. A wrong player mapping would quietly grade a
// prop against a stranger's stat line.

import { normalizeEventName } from "@/lib/events/match-key";
import type { ProviderPlayerStat } from "./types";

export interface ParticipantCandidate {
  id: string;
  name: string;
  sport: string;
  /** Used to narrow by team before falling back to a looser name rung. */
  teamAbbreviation?: string | null;
}

export interface PlayerStatMatch {
  participantId: string;
  providerPlayerId: string;
  /** Which rung matched, for the "how was this matched" affordance in §20.2. */
  via: "mapping" | "full_name" | "initial_surname" | "surname";
}

export interface MatchPlayerStatsResult {
  matches: PlayerStatMatch[];
  /** Participants no rung resolved, so their props stay silent. */
  unmatchedParticipantIds: string[];
  /**
   * Participants whose name matched several players. Reported rather than
   * guessed: picking one would grade a prop against the wrong player.
   */
  ambiguous: { participantId: string; name: string; candidateProviderIds: string[] }[];
}

/**
 * Participant -> provider player id for every participant that can be resolved.
 *
 * `existingMappings` is consulted first and never overridden, so a mapping the
 * user corrected by hand survives a refresh (§20.2).
 */
export function matchPlayerStats(
  participants: ParticipantCandidate[],
  stats: ProviderPlayerStat[],
  existingMappings: { participantId: string; providerPlayerId: string }[] = [],
): MatchPlayerStatsResult {
  const result: MatchPlayerStatsResult = { matches: [], unmatchedParticipantIds: [], ambiguous: [] };

  const mappedProviderId = new Map(existingMappings.map((m) => [m.participantId, m.providerPlayerId]));

  // Only players who actually have a name to match on. Sleeper's directory is
  // incomplete at the edges and a nameless row cannot be matched to anything.
  const named = stats.filter((s) => s.playerName);

  for (const participant of participants) {
    const existing = mappedProviderId.get(participant.id);
    if (existing) {
      result.matches.push({
        participantId: participant.id,
        providerPlayerId: existing,
        via: "mapping",
      });
      continue;
    }

    const found = resolve(participant, named);
    if (found.kind === "one") {
      result.matches.push({
        participantId: participant.id,
        providerPlayerId: found.stat.providerPlayerId,
        via: found.via,
      });
    } else if (found.kind === "several") {
      result.ambiguous.push({
        participantId: participant.id,
        name: participant.name,
        candidateProviderIds: found.stats.map((s) => s.providerPlayerId),
      });
    } else {
      result.unmatchedParticipantIds.push(participant.id);
    }
  }

  return result;
}

type Resolution =
  | { kind: "one"; stat: ProviderPlayerStat; via: PlayerStatMatch["via"] }
  | { kind: "several"; stats: ProviderPlayerStat[] }
  | { kind: "none" };

function resolve(participant: ParticipantCandidate, stats: ProviderPlayerStat[]): Resolution {
  const target = parseName(participant.name);
  if (!target.surname) return { kind: "none" };

  // Rungs are tried in order of how much evidence they require, and each one
  // narrows by team first: a looser name rung on a narrowed pool is safer than
  // a tighter rung across the whole league.
  const rungs: { via: PlayerStatMatch["via"]; test: (parsed: ParsedName) => boolean }[] = [
    {
      via: "full_name",
      test: (p) => p.full === target.full,
    },
    {
      via: "initial_surname",
      test: (p) =>
        p.surname === target.surname &&
        target.firstInitial != null &&
        p.firstInitial === target.firstInitial,
    },
    {
      via: "surname",
      test: (p) => p.surname === target.surname,
    },
  ];

  let lastAmbiguous: ProviderPlayerStat[] | null = null;

  for (const rung of rungs) {
    const hits = stats.filter((s) => rung.test(parseName(s.playerName!)));
    if (hits.length === 1) return { kind: "one", stat: hits[0], via: rung.via };

    if (hits.length > 1) {
      // Same surname, different players. The participant's team is the
      // tiebreaker a slip almost always gives us.
      const sameTeam = participant.teamAbbreviation
        ? hits.filter(
            (s) =>
              s.teamAbbreviation &&
              s.teamAbbreviation.toUpperCase() === participant.teamAbbreviation!.toUpperCase(),
          )
        : [];
      if (sameTeam.length === 1) return { kind: "one", stat: sameTeam[0], via: rung.via };

      // Remember it, but keep trying tighter-to-looser rungs in case a later
      // one resolves cleanly. If nothing does, this is reported as ambiguous.
      lastAmbiguous ??= sameTeam.length > 1 ? sameTeam : hits;
    }
  }

  if (lastAmbiguous) return { kind: "several", stats: lastAmbiguous };
  return { kind: "none" };
}

interface ParsedName {
  full: string;
  surname: string;
  /** Null for a single-token name, which carries no first initial to compare. */
  firstInitial: string | null;
}

/**
 * Splits a display name into the pieces the rungs compare.
 *
 * Handles the two forms that actually occur: "Devin Egbuka" and "D. Egbuka".
 * The punctuation is already gone by the time normalizeEventName is done, so
 * "D." and "D" are the same token, and a one-letter first token is exactly what
 * an initial looks like.
 */
export function parseName(name: string): ParsedName {
  const normalized = normalizeEventName(name);
  const parts = normalized.split(" ").filter(Boolean);

  if (parts.length === 0) return { full: "", surname: "", firstInitial: null };
  if (parts.length === 1) return { full: normalized, surname: parts[0], firstInitial: null };

  // Suffixes are not surnames. "Odell Beckham Jr" has to match "Odell Beckham".
  const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);
  const meaningful = parts.filter((p, i) => i === 0 || !SUFFIXES.has(p));
  const surname = meaningful[meaningful.length - 1] ?? parts[parts.length - 1];

  return {
    // Compared without suffixes so the two forms agree.
    full: meaningful.join(" "),
    surname,
    firstInitial: parts[0][0] ?? null,
  };
}
