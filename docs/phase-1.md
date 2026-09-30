# Phase 1: Foundation — Exit Criteria Report

Branch: `phase-1-foundation`. See `docs/PRD.md` §65 for the source list and §66.1 for reporting rules.

## Exit criteria

### Sign-in works. A second test account cannot read the first account's rows through the Supabase client.

**Passed — manual check.**

Verified live against the deployed Supabase project: created two confirmed accounts via the admin API, signed in as account A, created an Event, then signed out and signed in as account B. Account B's `/events` page showed "No events yet." — Row Level Security (`auth.uid() = user_id`, applied to `teams`, `participants`, `events`, `provider_mappings`, `user_preferences` in `supabase/migrations/20260930153555_create_phase1_schema.sql`) correctly scoped the read. Test accounts and their data were deleted afterward.

Not yet automated — would need a Supabase test project or the local Supabase CLI stack wired into CI to run RLS checks as part of `npm test`. Deferred to whenever Phase 2+ introduces CI infrastructure.

### Creating a manual Event with the same match key as an existing one shows the duplicate warning.

**Passed — automated test + manual check.**

Automated: `src/lib/events/duplicate-check.test.ts` (6 cases: no-start-time short-circuit, non-team match with no league on either side, matching leagues, mismatched leagues, team-sport match by team ids, non-match on a different local day).

Manual: exercised through the running app via `/events/new`. This surfaced and fixed a real bug — the duplicate query compared `league` with `.eq("league", candidate.league ?? "")`, but an unset league is stored as SQL `NULL`, not `''`, so `NULL = ''` never matched and the check silently found nothing whenever league was omitted. Fixed in `src/lib/events/duplicate-check.ts` to use `.is("league", null)` for the empty case. Re-verified in the browser afterward: entering "MIN @ TB" twice with no league now shows the "same match key" warning with both **Use Existing** and **Create Anyway**.

### A manual score displays with its override marker, and Return to Automatic restores a seeded automatic value.

**Passed — automated test + manual check.**

Automated: `src/lib/events/overrides.test.ts` covers `displayedHomeScore`/`displayedAwayScore` precedence, `hasManualOverride`, and `setManualOverride` / `returnFieldToAutomatic` (including the "clears `manualSetAt` only once no manual field remains" case).

Manual: in the browser, set a manual score of 21–17 on a live Event — the "manual override" badge appeared and the score displayed 21/17. Seeded an automatic score of 24–17 directly against the DB (no Phase 6 refresh UI exists yet to do this through the product), then clicked **Return score to automatic** — the badge cleared and the display fell back to 24/17.

### Writing a newer automatic value after an override shows the stale-override marker.

**Passed — automated test + manual check.**

Automated: `src/lib/events/overrides.test.ts` → `isOverrideStale` (false with no override, false when the automatic value hasn't changed since the override, true when a newer automatic value arrived after) and `applyAutomaticUpdate` (stamps `automaticChangedAt` only when a value actually changes, never touches manual fields).

Manual: with a manual override already set and its badge showing, applied a simulated automatic update (again via direct DB write, since there's no Phase 6 refresh trigger yet) — the "stale — provider value differs" badge appeared alongside "manual override," and the displayed score correctly kept showing the manual value per the `manualValue ?? automaticValue ?? null` precedence rule.

### Merge Into… moves every link to the surviving Event.

**Passed — automated test + manual check.**

Automated: `src/lib/events/merge.test.ts` — rejects self-merge, moves a `provider_mappings` row to the target when the target has none for that provider, drops the source's mapping instead when the target already has one for that provider (avoiding a unique-constraint collision), transfers `isPinned` when the source was pinned, and deletes the source Event.

Manual: created a genuine duplicate pair in the browser, used the **Merge into…** picker and confirmed the `window.confirm` prompt — one Event remained afterward, the other was gone.

`provider_mappings` is the only link table that exists in Phase 1; later phases (BetLegEvent, FantasyRosterSlot, DFSLineupSlot) will extend `mergeEventInto` to cover their own tables when those tables exist — noted in a comment in `src/lib/events/merge.ts`.

### The app runs with no provider environment variables set.

**Passed — true by construction, confirmed by manual check.**

`ManualSportsProvider` (`src/lib/providers/manual.ts`) is the only registered `SportsProvider` and requires no configuration or environment variables — `supportsSport()` returns `false` and `getSchedule()` returns `[]`. `npm run build` and the local dev server both ran clean with only the Supabase env vars set in `.env.local`; no provider-specific env vars exist yet since no real adapters are implemented until later phases.

## Test suite

`npm test` — 4 files, 32 tests, all passing:
- `src/lib/events/match-key.test.ts` (6)
- `src/lib/events/overrides.test.ts` (15)
- `src/lib/events/merge.test.ts` (5)
- `src/lib/events/duplicate-check.test.ts` (6)

`npx tsc --noEmit`, `npm run lint`, and `npm run build` all pass clean.

## Deferred

- Automated RLS cross-user test (needs a test Supabase stack wired into CI; currently verified manually).
- Any UI/route beyond what Phase 1 needs to exercise its own logic — the current `/events` and `/events/new` pages are intentionally minimal and will be superseded by Phase 4's Core Dashboard.
