// The one place the internal and provider sport vocabularies are reconciled.
//
// Internally `sport` and `league` are separate columns and teams were seeded as
// sport "football" / league "NFL". Providers namespace by league instead and
// talk about "nfl". Both directions are needed: matching translates provider ->
// internal (§20.2), and refresh scope translates internal -> provider so it can
// ask an adapter whether it covers a sport at all (§23).
//
// Keeping one table means a new sport cannot be half-added.

interface SportKey {
  /** Provider-facing key, as adapters namespace it. */
  providerSport: string;
  /** Internal `events.sport` / `teams.sport`. */
  sport: string;
  /** Internal `events.league`, used to disambiguate one sport's leagues. */
  league: string;
}

const SPORT_KEYS: SportKey[] = [
  { providerSport: "nfl", sport: "football", league: "NFL" },
  { providerSport: "golf", sport: "golf", league: "PGA" },
];

export function toInternalSport(providerSport: string): string {
  return SPORT_KEYS.find((k) => k.providerSport === providerSport)?.sport ?? providerSport;
}

/**
 * Internal sport + league -> provider key, or null when no adapter vocabulary
 * covers it. Null is the honest answer for a sport we track manually: refresh
 * skips it rather than guessing a key an adapter would reject.
 *
 * League only matters when one internal sport spans several provider keys
 * (basketball -> NBA and college). With one candidate the league is ignored, so
 * an Event whose league was never filled in still resolves.
 */
export function toProviderSport(sport: string, league?: string | null): string | null {
  const candidates = SPORT_KEYS.filter((k) => k.sport === sport);
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0].providerSport;
  return candidates.find((k) => k.league === league)?.providerSport ?? null;
}

/**
 * How a sport is named to the user. §21's freshness lines read "NFL updated
 * 4:18 PM", not "football updated 4:18 PM" — the league is the name a bettor
 * uses. Falls back to the internal sport, capitalized, for anything the table
 * does not cover.
 */
export function sportLabel(sport: string): string {
  const leagues = [...new Set(SPORT_KEYS.filter((k) => k.sport === sport).map((k) => k.league))];
  if (leagues.length === 1) return leagues[0];
  return sport.charAt(0).toUpperCase() + sport.slice(1);
}
