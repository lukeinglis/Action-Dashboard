# Phase 4: Core Dashboard — Exit Criteria Report

Branch: `phase-4-core-dashboard`. See `docs/PRD.md` §65 for the source list and §66.1 for reporting rules.

## Fixture

`src/fixtures/nfl-week-3.ts` already covered betting-core scenarios from Phase 2. For this phase it was extended with a second open leg for `participant-egbuka` (`leg-g1`'s existing "for" exposure now has a matching "against" leg on another ticket), producing the MIXED-rooting scenario the exit criteria require. `src/fixtures/nfl-week-3-dashboard.test.ts` is a new Phase-4-specific fixture test asserting Schedule Rail exposure counts, Schedule Rail eligibility under the default "Active" View, and the MIXED label — all against the shared fixture data rather than hand-rolled inputs.

## Exit criteria

### With the fixture loaded, the Schedule Rail shows the expected Events with the expected exposure counts.

**Passed — automated test + manual check.**

Automated: `src/fixtures/nfl-week-3-dashboard.test.ts` asserts `eventExposureCount` for all three fixture Events (1, 4, 0) and `isScheduleRailEligible` for each (live game included, finalized-today game included, zero-exposure/unpinned game excluded).

Manual, against the live Supabase project (a temporary confirmed test account, `phase4-test@example.com`, deleted afterward): seeded a live in-progress game with 2 exposed legs, an upcoming game with 1 exposed leg, and a zero-exposure pinned game 3 days out. The Schedule Rail showed exactly these three under LIVE / UP NEXT / LATER with the correct "N exposure" badges, and the pinned zero-exposure Event appeared despite having no exposure.

### Clicking an Event opens Event Detail, and the control back to All Active Tickets works.

**Passed — manual check.**

Clicking the live Event in the Schedule Rail switched the center workspace to Event Detail, showing status/score/period/clock and the linked legs. The "← All Active Tickets" control returned to the ticket list. Clicking the zero-exposure pinned Event correctly showed "Exposure (0)" and "No linked bet legs."

### The MIXED player in the fixture shows MIXED in Event Detail and in What Do I Need?

**Passed — automated test + manual check.**

Automated: `nfl-week-3-dashboard.test.ts` asserts `computeRootingLabels` returns `"MIXED"` for the participant with one open "for" leg and one open "against" leg, and `"FOR"`/`"AGAINST"` for single-direction participants.

Manual: the seeded MIXED scenario (one player with an Over leg on one ticket and an Under leg on another, both open) showed "D. Egbuka MIXED" on both legs in Event Detail, and a single "D. Egbuka MIXED" entry under the LIVE group in the What Do I Need? pane.

### Settled tickets leave the dashboard at the first rollover after `settledAt`. Test this with a mocked clock.

**Passed — automated test.**

`src/lib/dashboard/active-tickets.test.ts` → `ticketSection`: a settled ticket stays in the settled section before the next rollover after `settledAt`, and drops out of the dashboard entirely after the first rollover following it, using an explicit `now` argument rather than a clock-mocking library (consistent with this codebase's pattern of passing `now`/`timeZone`/`rolloverHour` explicitly into pure functions).

### A saved View restores its filters, sections, pane, and sort mode. A View whose saved Event is outside its window falls back to All Active Tickets.

**Passed — automated test + manual check.**

Automated: `src/lib/dashboard/views.test.ts` → `resolveLayoutOnRestore` covers the in-window, out-of-window, and missing-Event cases; `resolveOpeningState` covers restoring working state vs. loading the default View.

Manual: opened the What Do I Need? pane and selected an Event (making the "Active" View "Modified"), clicked **Save**, then reloaded the page — the pane stayed open, the sort mode stayed Manual, and no "Modified" badge appeared, confirming the saved View round-trips through Postgres correctly. Clicking **Revert** after making a further change restored the last-saved state and cleared the badge.

### Switching sort mode and back to `manual` restores the manual order.

**Passed — automated test + manual check.**

Automated: `src/lib/dashboard/active-tickets.test.ts` → `sortTickets` asserts the input array and its `sortKey` values are never mutated, and that manual order is intact after switching to another mode and back.

Manual: with tickets in manual order (Egbuka Over, Egbuka Under, Hawks Moneyline), switched the sort dropdown to Stake (reordered to Hawks Moneyline, Egbuka Over, Egbuka Under) then back to Manual — the original order returned exactly.

### Reloading mid-day restores the working state. Reloading after rollover loads the default View.

**Passed — automated test + manual check.**

Automated: `views.test.ts` → `resolveOpeningState` covers both branches directly against `shouldRestoreWorkingState`.

Manual: verified the mid-day case via the Save/reload check above (working state persisted and restored). The after-rollover branch is exercised only by the automated test — reproducing an actual rollover boundary live would require either manipulating the system clock or waiting for a real rollover, neither of which is practical for a temporary test account; the pure function it depends on (`resolveOpeningState`) is fully covered.

### Every workflow in this phase completes at 390px width without dragging.

**Passed — manual check.**

At a 390×844 viewport the layout (`flex flex-col ... lg:grid`) stacks Schedule Rail, Main Workspace, and the What Do I Need? pane into a single scrollable column with no horizontal overflow. Selecting an Event, returning via the back control, changing sort mode, and expanding the Settled section all worked with taps only — no drag interaction is required for any Phase 4 workflow (manual ticket reordering, the one drag-dependent interaction, is Phase 2 scope and unaffected by this phase).

## Bugs found and fixed during manual verification

1. **The Phase 4 migration had never been pushed to the live Supabase project**, only created locally (`supabase/migrations/20260930170000_create_phase4_dashboard.sql`). The dashboard crashed on load with `PGRST205: Could not find the table 'public.workspace_state'`. Fixed by running `supabase db push` (the required `SUPABASE_ACCESS_TOKEN` was already available via the locally logged-in CLI). Not a code bug, but recorded here since the running app was broken until this was applied.
2. **The "Modified" badge was a false positive whenever a View round-tripped through the database.** `Dashboard.tsx`'s `isModified` compared `filters`/`layout` with `JSON.stringify(...) !== JSON.stringify(...)`, but Postgres `jsonb` columns normalize (reorder) object keys on storage, so a freshly-saved View's `layout` object had different key order than the client's in-memory object even when semantically identical — the badge and Save/Revert controls appeared immediately after a successful Save. Fixed by adding a key-order-insensitive `deepEqual` to `src/lib/dashboard/views.ts` (with unit tests) and using it in `Dashboard.tsx` instead of `JSON.stringify` comparison.

## Test suite

`npx vitest run` — 26 files, 200 tests, all passing. New in this phase:

- `src/fixtures/nfl-week-3-dashboard.test.ts`
- `src/lib/dashboard/date-window.test.ts`
- `src/lib/dashboard/active-tickets.test.ts`
- `src/lib/dashboard/exposure.test.ts`
- `src/lib/dashboard/schedule.test.ts`
- `src/lib/dashboard/what-do-i-need.test.ts`
- `src/lib/dashboard/views.test.ts` (includes `deepEqual` coverage)

`npx tsc --noEmit`, `npx eslint`, and `npx next build` all pass clean; the production build lists all 12 expected routes, with `/` now server-rendered on demand (`ƒ`) as the dashboard rather than a static redirect.

## Scoping decisions

- **The dashboard replaced the root route's redirect to `/events`.** §5.1 ("The primary dashboard persists...") establishes the dashboard as the app's persistent root, not a page reached through navigation.
- **Working state is persisted via one generic `persistWorkingState` server action**, called on every filter/layout change, rather than many narrow per-field actions — matching §46.1's "saved on every change" requirement while keeping the action surface small.
- **Switching Views re-fetches from the server (`router.refresh()`) rather than recomputing Schedule Rail eligibility client-side**, since eligibility depends on the View's date window and duplicating that logic in the client would risk drift from the server computation.
- **Manual sort mode reuses the existing Phase 2 `TicketList`/`TicketCard` drag components** rather than duplicating dnd-kit wiring; the other four sort modes render a separate non-draggable row, since dragging while sorted by stake/to-win/etc. would corrupt `sortKey` semantics.
- **No new UI was added for BetLeg-to-Event linking or BetLegSubject direction-setting** — Phase 2 already deferred this (see `docs/phase-2.md` scoping decisions), and Phase 4's exit criteria don't require it. Live verification of Schedule Rail exposure, Event Detail, and MIXED rooting used data seeded directly into the live Supabase project via the service-role admin API, the same workaround used in Phase 1/2.

## Deferred

- A dedicated UI for manually linking a BetLeg to an Event or setting a BetLegSubject's direction — see "Scoping decisions" and Phase 2's report.
- Automated browser-level (Playwright) test automation for the dashboard's live-only behaviors (Schedule Rail rendering, Event Detail navigation, View save/revert, 390px layout) — currently verified manually against the live Supabase project, same as Phases 1 and 2.
- Reproducing an actual rollover boundary against a live wall clock — the underlying `resolveOpeningState`/`shouldRestoreWorkingState` logic is fully unit-tested; see the "Reloading mid-day..." criterion above.
- Fantasy/DFS-specific Schedule Rail eligibility and What Do I Need? entries — those tables don't exist until Phase 5.
