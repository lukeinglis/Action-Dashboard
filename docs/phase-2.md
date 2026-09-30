# Phase 2: Betting Core — Exit Criteria Report

Branch: `phase-2-betting-core`. See `docs/PRD.md` §65 for the source list and §66.1 for reporting rules.

## Fixture

`docs/PRD.md` §64.1 describes a fixture built from real Week 3 DraftKings screenshots, spanning betting, fantasy, and DFS. No real screenshots were available while building this phase, and fantasy/DFS don't exist until Phase 5, so `src/fixtures/nfl-week-3.ts` is a hand-authored **Phase 2 slice**: synthetic Teams, Participants, Events, Tickets, BetLegs, BetLegEvents, and BetLegSubjects, sized to exercise every market category in the §26.2 default-direction table and every branch of the §27 derived-status algorithm. It does not contain fantasy matchups, DFS lineups, or screenshot/slip text — those belong to the full fixture once Phases 3 and 5 exist. `src/fixtures/nfl-week-3.test.ts` asserts every expected value the fixture documents.

## Exit criteria

### The fixture loads, and every Ticket's derived status matches its expected value.

**Passed — automated test.**

`src/fixtures/nfl-week-3.test.ts` derives `effectiveTicketStatus` for all 7 fixture Tickets and asserts each against `expectedTicketStatuses`, covering every §27 branch: lost (`ticket-b`), void via an exact push (`ticket-c`), won (`ticket-a`), active via a settled leg with another still open (`ticket-e`), active via a live linked Event (`ticket-d`), active via a leg linked to two Events where only one is live (`ticket-g`), and pending (`ticket-f`). A separate case confirms a manual Ticket status overrides the derived value.

### A leg can link to two Events, and a leg with no Event saves.

**Passed — automated test.**

`leg-g1` in the fixture is linked to both `event-hawks-wolves` and `event-comets-miners` via two `BetLegEvent` rows; `leg-e2` (a season future) and `leg-f1` (a cross-game matchup) have none. `nfl-week-3.test.ts` asserts both shapes directly, and `src/lib/tickets/bet-leg-events.test.ts` covers `linkBetLegEvent`'s uniqueness and manual-link-wins behavior at the lib level.

### Default subjects and directions match the §26.2 table for each market in the fixture. A manually set direction survives re-matching.

**Passed — automated test.**

The fixture's 8 legs cover all 7 `MarketCategory` values (`team_vs_opponent`, `game_total`, `team_total`, `player_over_under`, `selection_only`, `matchup`, `neutral`); `nfl-week-3.test.ts` asserts `marketCategory(leg.marketType)` collectively equals that full set, then checks `defaultSubjectDirection` per category against the table. `subj-b1-hawks` is manually overridden to `"neutral"` (default would be `"against"`); the test calls `resolveSubjectDirection` with a fresh `"against"` proposal and confirms it's discarded because `directionSource` is `"manual"`.

### Money round-trips in cents. A non-bonus ticket whose return doesn't equal stake plus to-win shows the warning and still saves.

**Passed — automated test.**

`src/lib/betting/money.test.ts` covers `dollarsToCents`/`centsToDollars` round-tripping and `hasReturnMismatch` (including the bonus-bet exemption). `hasReturnMismatch` never blocks a save — `createTicket` in `src/lib/tickets/tickets.ts` has no validation gate on it — and the client-side warning in `NewTicketForm.tsx` is display-only. Manually verified in the browser: entering a stake/to-win/return combination that doesn't add up shows the amber warning and the ticket still saves.

### Each row of the §63.1 delete table has a test.

**Passed — automated test.**

Rows that exist in Phase 2 (`FantasyLeague`/`FantasyMatchup`/`DFSLineup`/`DFSEntry` don't exist until Phase 5):

| Row | Test |
|---|---|
| Ticket cascades to legs and their event/subject links | `src/lib/tickets/tickets.test.ts` → `deleteTicket` |
| BetLeg cascades to its event/subject links | `src/lib/tickets/bet-legs.test.ts` → `deleteBetLeg` |
| Event blocked while linked; Merge Into… / Unlink All | `src/lib/events/delete.test.ts`, extended `src/lib/events/merge.test.ts` (moves/drops a `bet_leg_events` link on merge) |
| Team blocked while linked; Merge Into… | `src/lib/teams/delete.test.ts`, `src/lib/teams/merge.test.ts` |
| Participant blocked while linked; Merge Into… | `src/lib/participants/delete.test.ts`, `src/lib/participants/merge.test.ts` |
| ImportRecord: created records remain, `importRecordId` nulled | `src/lib/import-records/import-records.test.ts` → `deleteImportRecord` |

### Dragging a card persists across reload and writes one row.

**Passed — automated test + manual check. Found and fixed two real bugs.**

Automated: `src/lib/sort/sort-key.test.ts` covers the fractional `sortKeyBetween`/`sortKeyAfter`/`sortKeyBefore` scheme; `src/lib/tickets/tickets.test.ts` → `reorderTicket` confirms exactly one row is written.

Manual, in the running app against the live Supabase project (a temporary confirmed test account, deleted afterward): dragging a Tickets card's handle reordered it, and reloading the page (full navigation, not client-side) showed the new order, confirming a real write rather than client-only state. Getting to a clean pass surfaced two bugs in `src/app/tickets/page.tsx`, both fixed in this branch:

1. It selected a `status` column from `events` that doesn't exist — the table only has `automatic_status`/`manual_status` (Phase 1). Fixed to select both and compute `manual_status ?? automatic_status`, matching the `displayedStatus` precedence used elsewhere.
2. Three `.in(...)` queries used a `["__none__"]` sentinel to avoid passing an empty array, but those columns are `uuid`, and `"__none__"` isn't a valid uuid — Postgres rejected it (`22P02`) whenever a ticket had no legs or a leg had no linked Events, i.e. on every fresh account. Fixed by skipping each dependent query entirely when its id list is empty, instead of querying with a fake id.

A third, cosmetic issue turned up during manual testing: dnd-kit generated a different `aria-describedby` id on the server than on the client (a hydration-mismatch console warning, no functional impact). Fixed by passing a stable `id="tickets-dnd"` to `DndContext` in `src/app/tickets/TicketList.tsx`.

### At 390px width, uploading 5 screenshots at once, including one HEIC, puts all 5 in `/inbox`, visible on desktop.

**Passed — manual check.**

At a 390×844 viewport, selected 4 PNGs and 1 HEIC (converted from a PNG with `sips`) in the `/inbox` upload form's multi-file input (`multiple`, `accept="image/*,.heic,.heif"`) and submitted. The header updated to "5 to review" with 5 distinct entries, including the HEIC file, each linking to its own `/inbox/[id]`. The same list is plain HTML with no mobile-only rendering path, so it's equally visible at desktop width.

### Transcribing an inbox item by hand and approving it links the new Ticket to the ImportRecord and deletes the image from storage.

**Passed — automated test + manual check.**

Automated: `src/lib/import-records/import-records.test.ts` covers `approveImportRecord`'s field updates; `approveImportRecord` in `src/app/inbox/actions.ts` creates the Ticket with `importRecordId` set and removes the storage object before calling the lib function.

Manual: filled in the TranscribeForm for one uploaded screenshot and clicked Approve — the pending count decremented, and the resulting Ticket appeared on `/tickets` with the sportsbook/stake/to-win/return values entered in the form, confirming the Ticket→ImportRecord link took effect end to end. Storage deletion isn't independently observable through the UI; it's covered by the direct call to `supabase.storage.from("screenshots").remove(...)` in the same action before the ImportRecord is marked approved.

## Test suite

`npx vitest run` — 19 files, 146 tests, all passing:

- `src/fixtures/nfl-week-3.test.ts` (21)
- `src/lib/betting/derived-status.test.ts`, `money.test.ts`, `subjects.test.ts`
- `src/lib/events/delete.test.ts`, `duplicate-check.test.ts`, `match-key.test.ts`, `merge.test.ts`, `overrides.test.ts`
- `src/lib/import-records/import-records.test.ts`
- `src/lib/participants/delete.test.ts`, `merge.test.ts`
- `src/lib/sort/sort-key.test.ts`
- `src/lib/teams/delete.test.ts`, `merge.test.ts`
- `src/lib/tickets/bet-leg-events.test.ts`, `bet-leg-subjects.test.ts`, `bet-legs.test.ts`, `tickets.test.ts`

`npx tsc --noEmit`, `npx eslint`, and `npx next build` all pass clean; the production build lists all 12 expected routes (`/`, `/_not-found`, `/auth/confirm`, `/events`, `/events/new`, `/inbox`, `/inbox/[id]`, `/login`, `/login/check-email`, `/tickets`, `/tickets/[id]`, `/tickets/new`).

## Scoping decisions

- **BetLeg-to-Event linking has no dedicated UI.** `linkBetLegEvent`/`unlinkBetLegEvent`/`setBetLegSubject` are fully implemented as server actions with lib-level test coverage, but Phase 2's UI only exposes leg creation, manual settlement, and delete. An Event-picker UI for manually linking a leg is deferred — nothing in §65's exit criteria requires it, and Phase 3 (sportsbook import) is a more natural place to build matching UI since that's when auto-matching starts mattering.
- **The §64.1 fixture is a Phase 2 slice, not the full fixture.** See "Fixture" above.
- **`FantasyLeague`, `FantasyMatchup`, `DFSLineup`, `DFSEntry` delete-table rows have no tests yet** — those tables don't exist until Phase 5.

## Deferred

- The full `docs/PRD.md` §64.1 fixture (fantasy matchups, DFS lineups, screenshots, slip text) — waits on Phase 3 and Phase 5.
- A dedicated UI for manually linking a BetLeg to an Event or Team/Participant subject — see "Scoping decisions."
- Automated browser-level (Playwright) test automation for drag-reorder, mobile upload, and inbox approval — currently verified manually against the live Supabase project, same as Phase 1's RLS check.
