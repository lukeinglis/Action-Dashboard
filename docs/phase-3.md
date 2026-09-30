# Phase 3: Sportsbook Import — Exit Criteria Report

Branch: `phase-3-sportsbook-import`. See `docs/PRD.md` §65 for the source list and §66.1 for reporting rules.

## Fixture and format

`docs/PRD.md` §64.1 calls for "DraftKings screenshots and pasted slip text for the fixture's tickets, including one screenshot with 3 tickets." No real DraftKings export or screenshot format is publicly documented, so — following Phase 2's precedent of hand-authoring the fixture where no real data was available — this phase defines its own explicit, labeled "Bet Slip" text format (spec and rationale at the top of `src/lib/import/parse-slip-text.ts`) that stands in for both a pasted slip and a transcribed screenshot. `src/lib/import/extract-screenshot.ts` asks Claude Haiku to transcribe an uploaded image into this same text format, so `parseSlipText` is the single source of parsing truth for both input paths, and "the fixture's screenshots" and "the fixture's pasted slip text" produce identical results by construction. `src/fixtures/nfl-week-3.ts` was extended with slip-text constants for the existing Tickets (`importSlipTextSingleTicket`, `importSlipTextParlay`, `importSlipTextUnmatchedEvent`, `importSlipTextMalformed`, and `importSlipTextThreeTickets` — three separate Bet Slip blocks pasted together, standing in for a 3-ticket screenshot).

## Exit criteria

### The fixture's DraftKings screenshots produce a review screen with the correct tickets and legs. The screenshot containing 3 tickets produces 3. Split and merge work.

**Passed — automated test + manual check.**

Automated: `src/fixtures/nfl-week-3-import.test.ts` runs `buildImportReview` against the fixture's slip text and existing Teams/Participants/Events, asserting correct ticket/leg counts and per-leg match results, including `importSlipTextThreeTickets` producing exactly 3 tickets (`DK-9004`, `DK-9005`, `DK-9006`) in order.

Manual, in the running app against the live Supabase project (a temporary confirmed test account, deleted afterward): uploaded a synthetic screenshot (a PNG rendering of a hand-typed slip — no real DraftKings screenshots were available, same gap Phase 2 noted for HEIC/PNG uploads) and confirmed the Claude Haiku extraction → parse → match pipeline produced a correct single-ticket review screen with the stake/to-win/payout and Event/subject matches all correct. Separately pasted the fixture's `importSlipTextThreeTickets` text and confirmed the review screen showed 3 distinct ticket groups. Used the review screen's "Split Selected Into New Ticket" and "Merge into…" controls on a multi-leg parlay: selecting one leg and splitting created a second ticket group with that leg moved out; merging it back via the dropdown restored the original single ticket.

### Pasting the fixture's slip text produces the same tickets and legs.

**Passed — automated test.**

Because both input paths converge on `parseSlipText`, `src/lib/import/parse-slip-text.test.ts` and `nfl-week-3-import.test.ts` cover this directly — there is no separate code path that could diverge. Manually confirmed in the browser (see above) that the pasted text for the single-ticket and 3-ticket fixtures produced the same ticket/leg shape verified by the automated tests.

### Nothing is written to Ticket or BetLeg tables before approval.

**Passed — inspection + manual check.**

`buildImportReview` (`src/lib/import/pipeline.ts`) and the `pasteSlipText`/`uploadScreenshot` actions (`src/app/inbox/actions.ts`) only read candidates and write the `ImportRecord` row (`status`, `extractedText`, `parsedPayload`); no code path in either function touches `tickets` or `bet_legs`. Only `approveImportRecord` creates a Ticket, and it does so from the client-edited review-screen state, not from re-parsing. Manually confirmed: uploading/pasting and leaving a record at `needs_review` (without clicking Approve) shows nothing new on `/tickets`; clicking Approve is what creates the row.

### Legs match existing internal Events by match key. Unmatched legs are flagged.

**Passed — automated test + manual check.**

Automated: `src/lib/import/match-parsed-legs.test.ts` and `nfl-week-3-import.test.ts` cover matching against seeded Teams/Participants/Events, including a leg whose named teams aren't internal Teams, asserting `eventExpected: true, eventMatched: false`.

Manual: pasted `importSlipTextUnmatchedEvent`-equivalent text against a live account seeded with only some of the fixture's Teams/Events — legs for the seeded Event/Teams matched correctly (shown with "Event: Hawks @ Wolves" and named subjects with for/against labels); legs for the intentionally-unseeded Comets/Miners Event and Sharks subject showed "Event not matched" / "— unmatched" on the review screen instead of silently guessing.

### Importing the same ticket twice shows the duplicate warning.

**Passed — automated test + manual check.**

Automated: `src/lib/import/duplicate-check.test.ts` and `nfl-week-3-import.test.ts` cover `findDuplicateTicket` matching on `sportsbookTicketId`.

Manual: approved a pasted ticket, then re-pasted the identical slip text — the review screen showed a "Possible duplicate" banner with working **View Existing** and **Import Anyway** controls.

### A parse failure shows `failed` with the error, and the item can still be entered by hand.

**Passed — automated test + manual check. Found and fixed one real bug.**

Automated: `src/lib/import/parse-slip-text.test.ts` covers `SlipParseError` for empty text, missing header, missing leg fields, and missing `Wager`; `nfl-week-3-import.test.ts` confirms `buildImportReview` throws `SlipParseError` (caught by the caller in `actions.ts`, which marks the `ImportRecord` `failed` with the message) rather than saving a guess.

Manual, against the live app: submitting malformed text produced a `failed` item on `/inbox` whose detail page showed the error message and the `TranscribeForm` manual-entry fallback, which still let the ticket be entered by hand. Getting here surfaced a real bug: pasting the exact fixture slip text into the live "Paste Text" `<textarea>` and submitting always failed, even though the identical string passed in `parseSlipText` unit tests. Native `<textarea>` form submission normalizes line endings to CRLF before the browser sends the form data, regardless of how the text was typed or pasted; the parser's line-based splits (`block.split("\n")`, `/^Leg \d+:\s*$/m`) had only ever been tested against the LF-only strings JS template literals produce, so they silently broke on real form submissions. Fixed in `src/lib/import/parse-slip-text.ts` by normalizing `\r\n` to `\n` before any line-based parsing, with a permanent regression test added to `parse-slip-text.test.ts` that feeds the parser a CRLF-converted fixture string.

### After approval, the source image is gone from storage, and the ImportRecord retains `extractedText` and `parsedPayload`.

**Passed — inspection + manual check.**

`approveImportRecord` in `src/app/inbox/actions.ts` removes the storage object (for screenshot-sourced records) and then updates the `ImportRecord` row to `approved` without clearing `extracted_text` or `parsed_payload` — the same pattern Phase 2 established for hand-transcribed approval, reused here for parsed approval. Manually confirmed: after approving both a screenshot-derived and a paste-derived record, the resulting Ticket appeared on `/tickets` with correct sportsbook/stake/to-win/legs; storage deletion isn't independently visible through the UI, so it's covered by inspecting the call itself, matching how Phase 2 verified the equivalent step.

## Test suite

`npx vitest run` — 25 files, 180 tests, all passing (146 carried over from Phase 2, 34 new):

- `src/lib/import/parse-slip-text.test.ts`, `extract-screenshot.test.ts`, `match-parsed-legs.test.ts`, `duplicate-check.test.ts`, `pipeline.test.ts`
- `src/fixtures/nfl-week-3-import.test.ts`

`npx tsc --noEmit` and `npx next build` pass clean; the production build lists the same 12 routes as Phase 2 (`/inbox` and `/inbox/[id]` gained the new paste-text and review-screen UI without adding new routes). `npx eslint` has one pre-existing failure in `src/lib/sort/sort-key.test.ts` (`prefer-const`) — that file is untouched by this branch (last modified in the Phase 2 commit) and the error isn't introduced by Phase 3 work.

## Scoping decisions

- **No real DraftKings screenshots or export format are available.** Per docs/phase-2.md's precedent and this file's "Fixture and format" section above, the fixture uses a hand-authored, explicitly labeled "Bet Slip" text format as the single source of truth for both input paths, with a synthetic PIL-rendered PNG standing in for an actual screenshot during manual verification.
- **The review screen only flags unmatched legs; it has no manual re-match picker.** Split, merge, and field editing are supported, but choosing an Event/Team/Participant for an unmatched leg by hand isn't — the same gap Phase 2 deferred for manually linking a BetLeg to an Event, and a more natural fit for whichever phase first needs a general-purpose Event/subject picker UI.

## Deferred

- A manual re-match picker for unmatched legs on the review screen — see "Scoping decisions."
- Real DraftKings screenshots/export-format validation — no samples were available; revisit if real data surfaces.
