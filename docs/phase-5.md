# Phase 5: Fantasy and DFS — Exit Criteria Report

Branch: `phase-5-fantasy-dfs`. See `docs/PRD.md` §65 for the source list and §66.1 for reporting rules.

## Schema

`supabase/migrations/20261001000000_create_phase5_fantasy_dfs.sql` adds `fantasy_leagues`, `fantasy_matchups`, `fantasy_roster_slots`, `dfs_lineups`, `dfs_lineup_slots`, and `dfs_entries`, each scoped by `user_id` under RLS, mirroring the manual-override (`automatic_*`/`manual_*`) pattern already used for Tickets/BetLegs/Events. `FantasyMatchupStatus`/`DFSEntryStatus` (`upcoming` | `live` | `final`) have no automatic/manual split — status only moves on an explicit Mark Final action (docs/PRD.md §8).

## Fixture

`src/fixtures/nfl-week-3.ts` was extended per §64.1 with: one `FantasyLeague` ("Friends League") and two `FantasyMatchup`s sharing it — `fantasy-matchup-1` (starters on both the already-final Hawks @ Wolves Event and the still-live Comets @ Miners Event) and `fantasy-matchup-2` (both sides' only linked Event is already final); one `DFSLineup` (`dfs-lineup-1`) used across 3 `DFSEntry` rows with different statuses (upcoming, live, final), plus a second lineup (`dfs-lineup-2`) with a single entry whose only linked Event is final. All slots reuse the fixture's existing Teams/Participants/Events so Fantasy/DFS rooting and exposure combine with the Phase 2/4 betting data. `importFantasyMatchupText` and `importDfsLineupText` are pasted-text "screenshots" in the same hand-authored format as the Phase 3 `importSlipText*` fixtures (no real platform export format was available — see docs/phase-2.md's "Fixture" note, which applies the same way here).

`src/fixtures/nfl-week-3-fantasy-dfs.test.ts` is the new Phase-5 fixture test (20 tests) covering every exit criterion below against this shared fixture data.

## Exit criteria

### The fixture's fantasy matchups and DFS lineup load and link to Events.

**Passed — automated test.**

`nfl-week-3-fantasy-dfs.test.ts`: `fantasy-matchup-1`'s 3 roster slots and `dfs-lineup-1`'s 3 lineup slots each resolve to a real fixture `Event`; both `FantasyMatchup`s belong to the fixture's one `FantasyLeague`.

### The DFS lineup counts once in exposure despite having 3 entries.

**Passed — automated test.**

`dfsExposureCount` (`src/lib/dashboard/exposure.ts`, existing from a prior turn) counts `DFSLineupSlot`s once per linked Event as long as the lineup has at least one active (`upcoming`/`live`) entry — it filters on a `Set` of active lineup IDs rather than multiplying by entry count. The fixture test confirms `dfs-lineup-1`'s 2 slots on `event-hawks-wolves` count as `2`, not `6`, despite its 3 `DFSEntry` rows, and that a lineup whose only entry is `final` drops out of the active set entirely (`dfsExposureCount` returns `0` for it alone).

### When all of a matchup's linked Events are final, Mark Final appears. Status does not change on its own.

**Passed — automated test.**

`allLinkedEventsFinal` (`src/lib/dashboard/active-fantasy-dfs.ts`, existing from a prior turn) requires every linked Event status to be `"final"` and at least one linked Event to exist. The fixture test confirms: `fantasy-matchup-1` (one linked Event still `in_progress`) evaluates `false`; `fantasy-matchup-2` and `dfs-entry-4`'s lineup (`dfs-lineup-2`, whose only linked Event is final) evaluate `true`; `dfs-lineup-1`'s 3 entries (one linked Event still live) all evaluate `false`. In every case the matchup's/entry's own `status` field is asserted unchanged (`"upcoming"`) — the Mark Final condition is a derived prompt, never a write. The "never changes on its own" half is also structural: `markFantasyMatchupFinal`/`markDfsEntryFinal` (`src/lib/fantasy/matchups.ts`, `src/lib/dfs/entries.ts`) are the only functions that write `status`, and both are called exclusively from the explicit "Mark Final" button in `FantasyPane.tsx`/`DFSPane.tsx` — nothing in the Schedule Rail refresh or page-load path calls them.

UI: `src/app/FantasyPane.tsx` and `src/app/DFSPane.tsx` render a "Mark Final" button per active matchup/entry only when `showMarkFinal` is true; `src/app/page.tsx` computes `showMarkFinal` per matchup/entry via `allLinkedEventsFinal` over each item's linked Event statuses (`displayedStatus`), mirroring the existing Ticket/BetLegEvent pattern.

### The fixture's fantasy matchup screenshot and DFS lineup screenshot parse correctly.

**Passed — automated test.**

`buildFantasyMatchupReview(importFantasyMatchupText, candidates)` returns one matchup ("Friends League", "Dynasty Crew" vs. "Rival Squad") with both starters (`T. Sparks`, `D. Egbuka`) and the one opponent starter (`M. Reyes`) matched to their fixture `Participant`s and, through their Team, their `Event` (`M. Reyes` → `event-hawks-wolves`). `buildDfsLineupReview(importDfsLineupText, candidates)` returns one lineup (DraftKings, "Sunday Main") with all 3 slots matched, including `D. Egbuka` → `event-comets-miners`.

### The parser tells a sportsbook ticket, a DFS lineup, and a fantasy matchup apart ("no partial credit").

**Passed — automated test.**

`detectImportKind` (`src/lib/import/detect-kind.ts`, built in a prior turn) picks the kind from each format's unique header line, run before any kind-specific parsing. `detect-kind.test.ts` (7 tests) covers all three kinds plus CRLF tolerance and the unknown-header failure case; `nfl-week-3-fantasy-dfs.test.ts` additionally confirms it against the fixture's real `importSlipTextSingleTicket`, `importDfsLineupText`, and `importFantasyMatchupText` side by side. `runImportPipeline` (`src/app/inbox/actions.ts`) calls `detectImportKind` first and branches to the matching builder/approval path — there is no shared or guessed code path between the three kinds.

## Import pipeline and review screen

`detect-kind.ts`, `parse-dfs-lineup.ts`, and `parse-fantasy-matchup.ts` follow `parse-slip-text.ts`'s structure and share its `text-blocks.ts` helpers. `pipeline.ts` adds `buildDfsLineupReview`/`buildFantasyMatchupReview` (Participant/Event matching via the new `match-fantasy-dfs.ts`, parallel to `match-parsed-legs.ts`) alongside the existing `buildImportReview`. `src/app/inbox/actions.ts`'s `runImportPipeline` detects the kind and stores a discriminated `parsedPayload: { kind, review }` on the `ImportRecord`; `approveParsedDfsLineup`/`approveParsedFantasyMatchup` create the DFSLineup+slots+one DFSEntry or FantasyLeague(find-or-create)+FantasyMatchup+roster slots on explicit approval, delete the stored image, and redirect to `/inbox`, mirroring the existing bet-slip approval flow. `src/app/inbox/[id]/page.tsx` dispatches to `ReviewForm`/`DfsReviewForm`/`FantasyReviewForm` based on `parsedPayload.kind`. DFS/Fantasy review screens are deliberately minimal (remove-group + approve/reject, no split/merge) — docs/PRD.md §42-43 define split/merge only for bet slips.

## UI

- **Event Detail** (`src/app/EventDetail.tsx`): new "My Fantasy", "Fantasy Opponents", and "DFS" sections, each rendered only when non-empty, mirroring the existing Exposure section's badge styling (amber for MIXED).
- **Context panes** (`src/app/FantasyPane.tsx`, `src/app/DFSPane.tsx`): wired into `Dashboard.tsx`'s generalized `openPane` state (`togglePane("what_do_i_need" | "fantasy" | "dfs")`), each with a "+ New" link and a "Mark Final" button per active item.
- **Manual entry**: `src/app/fantasy/new/NewFantasyMatchupForm.tsx` and `src/app/dfs/new/NewDfsLineupForm.tsx`, following the `tickets/new/NewTicketForm.tsx` pattern — player names only, no Participant/Event matching (that's the import pipeline's job, consistent with docs/PRD.md §43's "Manual" being a distinct, simpler entry method).
- **Mixed Rooting Context** (`src/app/page.tsx`): `rootingLabelByKey` now merges `activeBetLegSubjects` with `fantasyRootingSubjects`/`dfsRootingSubjects` (both already built/tested in a prior turn) into one `computeRootingLabels` call, so a player's FOR/AGAINST/MIXED label reflects betting, Fantasy, and DFS exposure together (docs/PRD.md §17, §44 "Unified Player Exposure").

## Delete behavior (§63.1)

| Row | Test |
|---|---|
| FantasyLeague cascades to its matchups and their slots | `src/lib/fantasy/leagues.test.ts` → `deleteFantasyLeague` |
| FantasyMatchup cascades to its slots | `src/lib/fantasy/matchups.test.ts` → `deleteFantasyMatchup` |
| DFSLineup blocked while entries reference it | `src/lib/dfs/lineups.test.ts` → `deleteDfsLineup` ("is blocked while a DFSEntry references the Lineup"), plus the no-entries cascade-to-slots case |
| DFSEntry removes the entry only | `src/lib/dfs/entries.test.ts` → `deleteDfsEntry`, including the "signals the lineup has no remaining entries" case so the caller can offer to delete the lineup too |
| ImportRecord: created FantasyMatchups/DFSLineups keep their rows, `importRecordId` set to null | `src/lib/import-records/import-records.test.ts` → `deleteImportRecord` |

## Test suite

`npx vitest run` — 44 files, 317 tests, all passing. New in this phase (on top of the existing 26 files / 200 tests from Phase 4):

- `src/lib/import/text-blocks.ts` (shared parser helpers, exercised via the parsers below)
- `src/lib/import/detect-kind.ts` / `.test.ts`
- `src/lib/import/parse-dfs-lineup.ts` / `.test.ts`
- `src/lib/import/parse-fantasy-matchup.ts` / `.test.ts`
- `src/lib/import/match-fantasy-dfs.ts` / `.test.ts`
- `src/lib/fantasy/leagues.ts` / `.test.ts`, `matchups.ts` / `.test.ts`, `roster-slots.ts` / `.test.ts`
- `src/lib/dfs/lineups.ts` / `.test.ts`, `lineup-slots.ts` / `.test.ts`, `entries.ts` / `.test.ts`
- `src/lib/dashboard/active-fantasy-dfs.ts` / `.test.ts` (`fantasyDfsSection`, `allLinkedEventsFinal`)
- `src/lib/dashboard/exposure.ts` extended (`fantasyExposureCount`, `dfsExposureCount`, `fantasyRootingSubjects`, `dfsRootingSubjects`) with corresponding additions to `exposure.test.ts`
- `src/fixtures/nfl-week-3-fantasy-dfs.test.ts`

`npx tsc --noEmit`, `npx eslint .`, and `npx next build` all pass clean. `eslint` reports one pre-existing failure, `src/lib/sort/sort-key.test.ts:31` (`prefer-const`) — confirmed present on `main` before this branch and untouched by this phase's work, so it's out of scope here. The production build lists all expected routes, including the two new static manual-entry routes `/fantasy/new` and `/dfs/new`.

## Scoping decisions

- **DFS/Fantasy review screens have no split/merge UI**, unlike the bet-slip `ReviewForm.tsx` — docs/PRD.md §42-43 define split/merge only for sportsbook tickets, and the "one text block → one Lineup/Matchup" parser design (docs/PRD.md §43: additional DFSEntries against an already-approved lineup are a separate action, not something this parser produces) makes a merge concept inapplicable here.
- **"Mark Final" is a new UI pattern, not a port of an existing one.** No prior phase has a manual status-transition button — Ticket status is fully derived (`effectiveTicketStatus`). It was designed from scratch: a button shown per active matchup/entry when `allLinkedEventsFinal` is true, calling a server action then `router.refresh()`, matching the codebase's existing `useTransition` + refresh mutation pattern.
- **Event Detail shows all linked DFS/Fantasy slots regardless of entry/matchup active-vs-settled status**, for transparency, while exposure counting (the exit-criterion-tested number) stays correctly filtered to active items only — deliberately different concerns.
- **Manual-entry forms take player names only**, with no Participant/Event matching, consistent with "Manual" being a distinct, simpler entry method from Screenshot/Paste Text per docs/PRD.md §43.
- **The fixture's fantasy matchup and DFS lineup "screenshots" are hand-authored pasted text**, not real platform exports, for the same reason the Phase 2/3 `importSlipText*` fixtures are — no real screenshots were available, and the screenshot pipeline (`extract-screenshot.ts`) transcribes into this same text format before parsing, so pasted text exercises the identical downstream code path (see docs/phase-2.md's "Fixture" note).

## Deferred

- **Manual live-app verification against a running Supabase project** — unlike Phases 1-4, this phase's work was completed in a fully autonomous, non-interactive session with no opportunity to seed a live project or drive the UI by hand. All exit criteria here are covered by automated tests only; a manual pass (seeding the fixture's Fantasy/DFS rows into a live project, confirming the panes/Event Detail sections/Mark Final button render as expected at 390px) is recommended before this branch is relied on as "done" in the same sense Phases 1-4 were.
- Automatic fantasy-platform sync, Yahoo OAuth, and richer DFS/Fantasy player-stat context — explicitly deferred per docs/PRD.md §66 and §8 (Phase 8).
- Unified Player Exposure's Event Detail display currently lists Fantasy/DFS slots in fixed Fantasy/DFS section order rather than a single merged "Player Exposure" list across all three domains (betting, fantasy, DFS) — docs/PRD.md §44 doesn't specify a particular merged layout, and the three-section split keeps each domain's distinct fields (side, slot, platform) legible; a future phase can revisit this if a single unified list is wanted.
