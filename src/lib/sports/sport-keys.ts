// The one place the internal and provider sport vocabularies are reconciled.
//
// Internally `sport` and `league` are separate columns and teams were seeded as
// sport "football" / league "NFL". Providers namespace by league instead and
// talk about "nfl". Both directions are needed: matching translates provider ->
// internal (§20.2), and refresh scope translates internal -> provider so it can
// ask an adapter whether it covers a sport at all (§23).
//
// Keeping one table means a new sport cannot be half-added.

export interface SportKey {
  /** Provider-facing key, as adapters namespace it. */
  providerSport: string;
  /** Internal `events.sport` / `teams.sport`. */
  sport: string;
  /** Internal `events.league`, used to disambiguate one sport's leagues. */
  league: string;
  /**
   * Other spellings of `league` that turn up on real slips. A book writes the
   * Premier League as "EPL", "Premier League", or "England - Premier League"
   * depending on the screen, and an Event stamped with one of those must still
   * resolve to the same provider key.
   */
  leagueAliases?: string[];
  /**
   * The league to assume for a row carrying this sport but no league at all.
   *
   * Needed because `league` is nullable and most rows predate any sport having
   * more than one league. Without this, adding college football would turn every
   * league-less football Event unsupported overnight (§22 would report it as
   * manual-only), which is a regression dressed up as caution.
   */
  primary?: boolean;
}

/**
 * Exported so the table can be checked against its own invariants, which are
 * the ones a new sport silently breaks: a multi-league sport with no `primary`
 * turns every league-less Event of that sport manual-only, and two keys sharing
 * a league (or an alias) make `toProviderSport` depend on row order.
 *
 * College basketball is the next sport to land here, and it is the case these
 * invariants exist for: it joins the NBA under internal sport "basketball"
 * exactly as NCAAF joined the NFL under "football".
 */
export const SPORT_KEYS: readonly SportKey[] = [
  { providerSport: "nfl", sport: "football", league: "NFL", primary: true },
  {
    providerSport: "college-football",
    sport: "football",
    league: "NCAAF",
    leagueAliases: ["NCAA Football", "College Football", "CFB", "NCAAFB"],
  },
  { providerSport: "golf", sport: "golf", league: "PGA", primary: true },
  {
    providerSport: "eng.1",
    sport: "soccer",
    league: "Premier League",
    leagueAliases: ["EPL", "England - Premier League", "English Premier League"],
    primary: true,
  },
];

function normalizeLeague(league: string): string {
  return league.trim().toLowerCase();
}

function leagueMatches(key: SportKey, league: string): boolean {
  const wanted = normalizeLeague(league);
  if (normalizeLeague(key.league) === wanted) return true;
  return (key.leagueAliases ?? []).some((alias) => normalizeLeague(alias) === wanted);
}

export function toInternalSport(providerSport: string): string {
  return SPORT_KEYS.find((k) => k.providerSport === providerSport)?.sport ?? providerSport;
}

/**
 * Internal sport + league -> provider key, or null when no adapter vocabulary
 * covers it. Null is the honest answer for a sport we track manually: refresh
 * skips it rather than guessing a key an adapter would reject.
 *
 * A *named* league that this table doesn't carry is also null, even when the
 * sport has exactly one candidate. That case used to fall through to the single
 * candidate, which is how a college football leg got looked up against the NFL
 * schedule — and an Event matched against the wrong league's games grades to a
 * confidently wrong result, which is worse than not grading at all.
 */
export function toProviderSport(sport: string, league?: string | null): string | null {
  const candidates = SPORT_KEYS.filter((k) => k.sport === sport);
  if (candidates.length === 0) return null;

  if (league) {
    return candidates.find((k) => leagueMatches(k, league))?.providerSport ?? null;
  }

  // No league recorded: one candidate is unambiguous, and beyond that the
  // sport's primary league is the only non-arbitrary choice.
  if (candidates.length === 1) return candidates[0].providerSport;
  return candidates.find((k) => k.primary)?.providerSport ?? null;
}

/**
 * How an internal sport is named to the user, for messages about the sport
 * itself — §23's "manual-only" list is built from `events.sport`, so it can only
 * speak in internal terms. A sport spanning several leagues gets the sport's own
 * name, because no single league speaks for it.
 *
 * Freshness lines want `providerSportLabel` instead: they are keyed per provider
 * request, so "NFL" and "NCAAF" are two separate lines and "Football" would be
 * ambiguous across both.
 */
export function sportLabel(sport: string): string {
  const leagues = [...new Set(SPORT_KEYS.filter((k) => k.sport === sport).map((k) => k.league))];
  if (leagues.length === 1) return leagues[0];
  return sport.charAt(0).toUpperCase() + sport.slice(1);
}

/**
 * How a provider key is named to the user. §21's freshness lines read "NFL
 * updated 4:18 PM", not "nfl updated 4:18 PM" — the league is the name a bettor
 * uses. Falls back to the key itself, capitalized, for anything uncovered.
 */
export function providerSportLabel(providerSport: string): string {
  const key = SPORT_KEYS.find((k) => k.providerSport === providerSport);
  if (key) return key.league;
  return providerSport.charAt(0).toUpperCase() + providerSport.slice(1);
}
