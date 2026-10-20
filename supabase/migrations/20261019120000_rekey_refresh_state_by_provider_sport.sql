-- Re-key sports_refresh_state rows from the internal sport to the provider key.
--
-- sports_refresh_state is unique on (user_id, provider_key, sport) and acts as
-- the per-request lock, cooldown and §22.1 quota counter. It was keyed by the
-- internal sport ("football"), which worked only while every internal sport had
-- exactly one provider key. Adding college football broke that: NFL and NCAAF
-- are two separate ESPN requests but shared one "football" row, so whichever ran
-- first took the lock and set last_success_at and the other was skipped on
-- cooldown every refresh.
--
-- refreshOneSport now keys by scope.providerSport. Existing rows have to move
-- with it, or the old row is orphaned and renders a stale freshness line for a
-- sport that never refreshes again.
--
-- Only the sports that existed before this change need mapping, and only where
-- the internal name and the provider key actually differ:
--   football -> nfl        (the only multi-league sport, hence the only ambiguity)
--   golf     -> golf       (identical; no row to move)
--
-- Guarded by a NOT EXISTS so it cannot collide with a row the application has
-- already seeded under the new key, which would violate the unique constraint.

update sports_refresh_state as s
set sport = 'nfl'
where s.sport = 'football'
  and not exists (
    select 1
    from sports_refresh_state as existing
    where existing.user_id = s.user_id
      and existing.provider_key = s.provider_key
      and existing.sport = 'nfl'
  );

-- Any "football" row that survived the guard is a duplicate of a newer "nfl"
-- row: the application already re-seeded under the new key, so the stale one
-- would show a second, permanently-stale "Football" line.
delete from sports_refresh_state where sport = 'football';
