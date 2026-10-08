# PRD v7: Customizable Sports Tracking Dashboard

**Working title:** Sunday Dashboard  
**Version:** 7 (2026-09-28)  
**Primary platform:** Web  
**Primary user:** Single-user initially  
**Authentication:** Supabase Auth from day one  
**Primary device:** Desktop-first, responsive mobile  
**Initial rich-support sport:** NFL  
**Phase 0 research sports:** NFL, plus one of Golf or F1  
**Additional sports (Phase 7):** MLB, NBA, NHL, NCAAF, NCAAB, and whichever of Golf or F1 Phase 0 did not cover  
**Long-term scope:** Betting + Daily Fantasy + Season-Long Fantasy across sports  
**Backend:** Supabase / PostgreSQL  
**Frontend:** Next.js + TypeScript + Tailwind CSS  
**Deployment:** Vercel + GitHub  
**Default timezone:** America/New_York (Eastern Time), with timestamps stored in UTC

---

# Changes from v6

- Event model, provider mappings, Event creation and matching rules, and Event merge (§20, §20.1, §20.2)
- Manual overrides with stale-override detection (§45)
- BetLeg links moved to join tables for Events and subjects, with rooting direction (§26, §26.1, §26.2)
- Mixed rooting derivation defined from directions (§17)
- Exposure count defined precisely, with DFS lineups counted once (§11.6)
- Card order stored globally on records via `sortKey` (§5.3)
- Saved Views use relative date windows; unsaved working state persists (§46, §46.1)
- "Active" defined concretely, with a day rollover (§8)
- Leg settlement separated from live state; derived Ticket status corrected (§24, §27)
- Money stored as integer cents; bonus bets supported (§25)
- Delete behavior defined (§63.1)
- Refresh locking, cooldown, partial writes, and quota tracking (§21, §22.1, §50)
- `"team"` removed from `ParticipantType`
- Mobile screenshot upload and a Screenshot Inbox from Phase 2; screenshot parsing moved into Phases 3 and 5 (§10, §29.1, §31)
- Phases resequenced with per-phase exit criteria, a test fixture, and agent working rules; Phase 0 narrowed (§64, §64.1, §65, §66.1)

---

# 1. Product Summary

Build a customizable sports command center for visually tracking:

1. Sports bets
2. Daily Fantasy lineups
3. Season-long fantasy matchups

The product should launch around NFL usage but use a sport-agnostic architecture.

The main experience combines:

- a persistent cross-sport Schedule Rail on the left
- a central workspace that defaults to all active tickets
- event-specific exposure detail when a schedule item is selected
- optional contextual panes that can be opened on the right
- manual sports-data refresh
- fully manual overrides when external data is incomplete or unavailable

The application should work even if no sports-data API is configured.

The core value is:

> A flexible, visual, customizable dashboard for tracking everything the user cares about while watching sports.

---

# 2. Product Goals

The application should make it easy to answer:

- What games or events matter to me right now?
- What bets are still active?
- What do I need in this game?
- Which fantasy players do I own?
- Which fantasy players am I facing?
- Which DFS players are involved?
- Where do I have conflicting rooting interests?
- What changed since I last refreshed sports data?
- What should I look at next?

The product should reduce the need to jump among sportsbook slips, fantasy apps, DFS lineups, score apps, screenshots, and handwritten notes.

---

# 3. Non-Goals for MVP

The MVP is not intended to:

- replace a sportsbook
- reproduce sportsbook payout calculations
- manage bankroll
- place bets
- make betting recommendations
- continuously poll sports-data providers
- fully automate settlement for every market
- synchronize live fantasy-platform scoring
- replicate DraftKings DFS contest infrastructure
- provide advanced historical analytics

The application is primarily a tracker and viewing workspace.

---

# 4. Major Product Domains

Do not force Betting, DFS, and Fantasy into one schema.

They should remain separate domain models while sharing a common Event / Team / Participant identity layer.

```text
                       EVENT
                         │
          ┌──────────────┼──────────────┐
          │              │              │
      BETTING           DFS          FANTASY
          │              │              │
      Ticket         DFS Entry     Fantasy Matchup
          │              │              │
        Leg          DFS Lineup     Roster Slot
          │              │              │
          └────── Participant ──────────┘
```

Shared objects:

- Event
- Team
- Participant
- ProviderMapping
- Sport
- League

Domain-specific objects:

- Ticket / BetLeg / BetLegEvent / BetLegSubject
- DFSLineup / DFSEntry / DFSLineupSlot
- FantasyLeague / FantasyMatchup / FantasyRosterSlot

---

# 5. Core Product Principles

## 5.1 One persistent dashboard

The user should not be forced into separate dashboards by week.

The primary dashboard persists and can be customized using:

- filters
- sorting
- card ordering
- collapsed/expanded state
- saved Views
- opened contextual panes

Weeks, slates, and sessions may exist as metadata but do not define the dashboard boundary.

---

## 5.2 Saved Views capture the useful screen

A saved View restores the screen as closely as practical, including:

- domain, sport, league, and tag filters
- a relative date window
- visible sections
- sort mode
- collapsed cards
- density
- schedule grouping
- the opened right-side pane
- the selected Event, if it is still within the date window
- pinned-event visibility

Manual card order is global and shared by every View (§5.3).

Examples:

```text
Sunday NFL
All Active
Late Window
Betting Only
Fantasy Focus
DFS Focus
Night Games
Multi-Sport
```

The full model is in §46.

---

## 5.3 Card Ordering

Manual order belongs to the record itself, not to a View. There is one order per record type, shared by every View.

```ts
// On Ticket, FantasyMatchup, DFSEntry
sortKey: string
```

`sortKey` is a fractional index, such as a LexoRank-style string. A drag rewrites one row instead of renumbering every card.

Containers are the visible sections: Active, Settled, and Final. A card's container comes from its status, and dragging only reorders cards within their current container.

Sorting is a View setting (`sortMode`). Any mode other than `manual` sorts on the fly and never changes `sortKey`, so switching back to `manual` restores the user's order exactly.

MVP customization supports:

- drag-to-reorder cards within their current container
- persistent manual ordering
- collapse / expand
- sort modes that do not destroy manual order

Do not start with a completely freeform canvas.

---

## 5.4 Manual refresh is the default sports-data model

The MVP does not continuously poll sports APIs.

Instead:

- the dashboard loads the latest saved state
- the user presses **Refresh Sports Data**
- the app fetches current data for relevant sports/events
- shared Event records update
- all dependent views recalculate locally
- the UI displays visible freshness information

There should be zero background score activity while the app is unused.

---

## 5.5 Explicit user actions may call sports APIs

Manual refresh is not the only permitted API call.

User-initiated actions may query a configured provider when useful, for example:

- importing `Bucs ML` and resolving the current Buccaneers event
- searching for an event to pin
- matching a manually entered player to an active team
- linking an imported fantasy player to the correct game

These calls are allowed because they are direct consequences of explicit user actions.

Schedule lookups from these actions are cached per §22.1.

---

## 5.6 Everything important can be manually overridden

Manual overrides must be possible for:

- Event score
- Event status
- quarter / period / inning
- game clock
- player stat progress
- fantasy score
- DFS score
- BetLeg status
- BetLeg live state
- Ticket result
- participant matching
- Event matching

Manual values take precedence until explicitly cleared. Rules are in §45.

---

# 6. Authentication and Ownership

Use Supabase Auth from day one.

MVP assumptions:

- single user
- no social/community features
- all records belong to the authenticated user
- row-level security prevents access to another user's records

Every root-level user-owned record carries:

```ts
userId: string
```

---

# 7. Timezone and Time Storage

Store all timestamps in UTC.

Display schedules using a user preference.

Default:

```text
America/New_York
Eastern Time
```

The timezone preference is editable without changing stored event times.

Game/event dates must not be stored as display strings.

Day boundaries use the rollover hour defined in §8, also a user preference.

---

# 8. Default Dashboard State and "Active"

**Day rollover.** A "day" runs from a rollover hour to the next rollover hour, in the user's timezone. The default rollover is 4:00 AM and is editable in settings. A Sunday night game that ends at 12:30 AM still belongs to Sunday.

**Opening the app.**

- If the last activity was after the most recent rollover, restore the working state (§46.1).
- Otherwise, load the default View.

A mid-Sunday reload keeps the current screen. The next week starts clean.

The default View is named **Active**. It shows all active Tickets in the central workspace and does not force-select an Event. Clicking any Schedule item switches the center workspace to Event Detail, and a persistent control returns to All Active Tickets.

**Active Tickets.**

| Status | Section | Visibility |
|---|---|---|
| pending, active | Active | always |
| won, lost, void, cashed_out | Settled, collapsed by default | until the first rollover after `settledAt` |

`settledAt` (§25) is set when a Ticket's displayed status, manual or derived, first becomes terminal. It is cleared if the status returns to non-terminal.

**Active Fantasy matchups and DFS entries.** These use the same rule. They stay in the Active section while `upcoming` or `live`, and move to Settled once marked `final`, until the next rollover after `finalizedAt`.

When every Event linked to a matchup or entry is `final`, its card shows a **Mark Final** prompt. The status never changes automatically.

**Schedule Rail eligibility.** An Event appears when it has exposure (§11.6) or a pin, and it meets one of these conditions:

- its status is `in_progress`
- its start time, or its start-to-end range for long-running Events, overlaps the View's date window
- it went `final`, `postponed`, or `cancelled` during the current day

**Default grouping.**

```text
LIVE      in_progress
UP NEXT   scheduled, starts before the next rollover
LATER     scheduled, starts after the next rollover
FINAL     final / postponed / cancelled today, collapsed by default
```

**Pins.** A pinned Event is automatically unpinned at the first rollover after it goes `final` or `cancelled`. A pin outside the View's date window is kept but hidden.

Futures and long-duration legs with no linked Event never appear in the Schedule Rail, so they cannot flood it.

---

# 9. Desktop Layout

The default desktop information hierarchy is:

```text
┌──────────────────┬──────────────────────────────────┬─────────────────────┐
│ SCHEDULE         │ MAIN WORKSPACE                   │ OPTIONAL PANE       │
│                  │                                  │                     │
│ Relevant events  │ Default: all active Tickets      │ Empty by default or │
│ across sports    │                                  │ user-opened context │
│                  │ Click event: Event Detail        │                     │
└──────────────────┴──────────────────────────────────┴─────────────────────┘
```

The right side is **not required to contain a permanent card stack**.

It may be:

- empty
- closed
- opened as `What Do I Need?`
- opened as Fantasy
- opened as DFS
- opened as Ticket Detail
- opened as Player Exposure
- opened as another future contextual pane

This preserves screen space and makes the workspace adaptable.

---

# 10. Mobile Layout

Mobile should preserve the same data and workflows but not the permanent three-column composition.

Recommended mobile hierarchy:

```text
Schedule selector
Main workspace
Context drawer
```

Mobile priorities:

- large tap targets
- easy manual score/status edits
- easy screenshot upload
- simple View/filter switching
- no requirement to drag cards

The Schedule Rail can become:

- a compact dropdown
- a collapsible schedule panel
- a horizontal event strip

Every workflow must complete at 390px width without dragging.

**Screenshot upload** is a primary mobile action, reachable in one tap from every screen.

- It uses a standard file input (`accept="image/*"`, `multiple`), which opens the photo library or camera on both iOS and Android.
- Images are resized on the device to a 2000px long edge before upload.
- HEIC images are converted to JPEG before parsing.
- One upload can include up to 20 images.

Uploaded images land in the Screenshot Inbox (§29.1).

Share-sheet upload ("Share → Sunday Dashboard") is deferred. Android supports it through a PWA share target; iOS Safari does not.

---

# 11. Persistent Schedule Rail

A chronological schedule appears on the left side of the desktop dashboard.

This is a core navigation feature.

It answers:

> What events currently matter to me, and when are they happening?

## 11.1 Relevant Events

An Event is relevant when it has exposure (§11.6) or a manual pin. Eligibility for display follows §8.

Fantasy bench players are not part of the MVP fantasy workflow and do not affect schedule relevance.

## 11.2 Cross-sport chronology

The schedule is chronological across sports.

Example:

```text
2:10 PM   MLB     BAL @ NYY           2
4:05 PM   NFL     MIN @ TB            8
4:25 PM   NFL     LV @ NO             6
6:30 PM   PGA     Final Round         1
7:30 PM   NBA     BOS @ NYK           3
8:20 PM   NFL     LAR @ DEN           6
```

The count is the exposure count (§11.6).

## 11.3 Schedule grouping

The default grouping is by state, as defined in §8:

```text
LIVE
UP NEXT
LATER
FINAL
```

NFL-specific Views may use `scheduleGrouping: "nfl_window"`:

```text
1 PM
4 PM
NIGHT
MONDAY
```

Views may also use `chronological`, with no grouping. Across mixed sports, chronological ordering takes precedence within each group.

## 11.4 Schedule row data

A Schedule row may show:

- start time
- sport / league
- event name
- live score if available
- event state
- exposure count
- Betting / Fantasy / DFS indicators
- pin indicator
- manual override indicator
- stale-override indicator
- Needs Match indicator
- stale-data indicator if appropriate

## 11.5 Selecting a Schedule item

Clicking an Event changes the center workspace from:

```text
All Active Tickets
```

to:

```text
Selected Event Detail
```

The selected row is visibly highlighted.

A persistent control returns the workspace to:

```text
All Active Tickets
```

## 11.6 Exposure Count

```text
Exposure Count for an Event =
  active BetLegEvent links to this Event
+ user-side FantasyRosterSlots linked to this Event
+ opponent-side FantasyRosterSlots linked to this Event
+ DFSLineupSlots linked to this Event, on lineups with an active entry
```

An active BetLegEvent link is one whose leg is `open` on a Ticket that is `pending` or `active`.

A DFSLineup counts once however many DFSEntries use it. A leg linked to three Events counts once on each of them.

This is not an importance score or recommendation.

## 11.7 Pinning

The user can pin an Event even when there is no Betting/Fantasy/DFS exposure.

Example use case:

> I want this game in my schedule because I plan to watch it.

Pinned Events remain visible within the View's date window until unpinned or auto-unpinned per §8.

---

# 12. Long-Running and Non-Team Events

The shared Event model must support non-team sports.

Examples:

```text
PGA - Masters - Round 4
F1 - United States Grand Prix
Tennis - Player A vs Player B
```

Golf may be represented as a tournament-level or round-level Event depending on provider capabilities.

For MVP:

```text
PGA - Tournament / Current Round
```

is acceptable.

Selecting a golf Event should show only the golfers, bets, or tracked items relevant to the user.

F1 may use:

```text
Practice
Qualifying
Race
```

as separate Events if provider data supports that structure.

Long-running Events use `startTimeUtc` and `endTimeUtc`; window overlap rules are in §8.

---

# 13. Main Workspace: All Active Tickets

The default center workspace shows all currently active Tickets.

Ticket cards should support:

- manual ordering
- collapse / expand
- sort modes
- filtering
- direct edit
- status
- progress
- next unresolved Event

Suggested card:

```text
JERSEY SUNDAY NIGHT SPECIAL

Risk: $10
To Win: $150
Return: $160

1 / 4 settled
ACTIVE

✓ Waddle ATTS
○ Kyren Williams ATTS
○ LAR/DEN Over 45.5
○ Broncos +2.5

Next: LAR @ DEN - 8:20 PM
```

**Next** is the earliest-starting Event linked to any unresolved leg (§26.1).

Settled Tickets move to the Settled section per §8.

---

# 14. Main Workspace: Selected Event Detail

When an Event is selected in the Schedule Rail, the center workspace becomes an Event Detail view.

It answers:

> What matters to me in this Event?

Possible sections:

```text
SCORE / EVENT STATE
BETTING
MY FANTASY
FANTASY OPPONENTS
DFS
PLAYER PROGRESS
NOTES
```

Example:

```text
MIN @ TB
4:05 PM

BETTING
• Bucs ML - Hungry Dogs
• Bucs ML - Money Line Powerball
• Bucky Irving ATTS - TD Powerball

MY FANTASY
• Bucky Irving - Sleeper
• Bucky Irving - Auburn
• Emeka Egbuka - Sleeper
• Emeka Egbuka - Auburn
• Emeka Egbuka - URG
• Baker Mayfield - Tampa

OPPONENTS
• Justin Jefferson - Sleeper opponent
• Emeka Egbuka - Tampa opponent

DFS
• T.J. Hockenson
```

When sports data has been refreshed, the panel may additionally show score/state and player progress.

Event Detail also hosts the **Merge Into…** action (§20.2).

---

# 15. Optional Context Panes

The right side supports optional panes rather than one fixed permanent content type.

Initial pane candidates:

```text
What Do I Need?
Ticket Detail
Fantasy
DFS
Player Exposure
Manual Data Editor
```

Only one pane needs to be open at a time in MVP.

Closing the pane restores more space to the main workspace.

Saved Views preserve which pane is open.

---

# 16. What Do I Need? Pane

This pane provides a compact cross-event summary.

It should include useful context, not merely unresolved winning conditions.

Example:

```text
WHAT DO I NEED?

LIVE

NYJ @ DET
• Jets +6.5 - currently covering
• Gibbs 2+ TD - 1 / 2
• Gibbs - opponent in URG
• Garrett Wilson - DFS

UP NEXT

MIN @ TB
• Bucs ML
• Bucky Irving ATTS
• Egbuka - MIXED
```

The pane should distinguish:

- active Betting need
- Fantasy player owned
- Fantasy opponent
- DFS player
- dead Ticket context
- mixed/conflicting exposure

---

# 17. Mixed Rooting Context

For each Participant and Team, collect directions from active exposures only:

| Source | Direction |
|---|---|
| BetLegSubject on a leg that is `open` | as stored |
| FantasyRosterSlot, side `user` | for |
| FantasyRosterSlot, side `opponent` | against |
| DFSLineupSlot on a lineup with an entry that is `upcoming` or `live` | for |

Settled legs and legs on dead Tickets are excluded. They still appear as dead-Ticket context in panes but do not affect the derived label.

DFS opponents are not tracked, so DFS exposure is always "for."

Derived label:

```text
only "for"                → FOR
only "against"            → AGAINST
both "for" and "against"  → MIXED
only "neutral" or none    → NEUTRAL
```

Example:

```text
Emeka Egbuka
MIXED

Own: 3 fantasy teams
Against: 1 fantasy matchup
Betting: ATTS
```

This is descriptive context only. It carries no weighting or recommendation.

---

# 18. Shared Team Model

```ts
interface Team {
  id: string
  userId: string

  sport: string
  league: string

  name: string
  abbreviation?: string

  createdAt: string
  updatedAt: string
}
```

Provider identifiers live in ProviderMapping (§20.1).

---

# 19. Shared Participant Model

A Participant represents an individual competitor. Teams are represented only by the Team model.

```ts
type ParticipantType =
  | "player"
  | "golfer"
  | "driver"
  | "fighter"
  | "other"

interface Participant {
  id: string
  userId: string

  type: ParticipantType

  sport: string
  league?: string

  name: string

  teamId?: string

  createdAt: string
  updatedAt: string
}
```

Provider identifiers live in ProviderMapping (§20.1).

Duplicate Participants, such as two "Bucky Irving" records created across imports, are resolved with **Merge Into…** (§63.1).

---

# 20. Shared Event Model

```ts
type EventStatus =
  | "scheduled"
  | "in_progress"
  | "final"
  | "postponed"
  | "cancelled"
  | "suspended"
  | "unknown"

interface Event {
  id: string
  userId: string

  sport: string
  league?: string
  name: string

  startTimeUtc?: string
  startTimeTbd?: boolean
  endTimeUtc?: string

  homeTeamId?: string
  awayTeamId?: string

  source: "manual" | "provider"

  // Written only by provider refresh
  automaticStatus?: EventStatus
  automaticHomeScore?: number
  automaticAwayScore?: number
  automaticPeriod?: string
  automaticClock?: string
  automaticChangedAt?: string

  // Written only by the user
  manualStatus?: EventStatus
  manualHomeScore?: number
  manualAwayScore?: number
  manualPeriod?: string
  manualClock?: string
  manualSetAt?: string

  isPinned?: boolean
  notes?: string

  createdAt: string
  updatedAt: string
}
```

Refresh never writes manual fields, and user edits never write automatic fields.

`automaticChangedAt` updates only when a refreshed value differs from the stored one. A refresh that returns the same score leaves it untouched.

Non-team Events leave `homeTeamId` and `awayTeamId` empty.

---

# 20.1 Provider Mappings

```ts
type MappedEntityType = "event" | "team" | "participant"

interface ProviderMapping {
  id: string
  userId: string

  entityType: MappedEntityType
  entityId: string

  providerKey: string
  providerId: string

  matchMethod: "auto" | "manual"
  locked: boolean

  createdAt: string
  updatedAt: string
}
```

Constraints:

- unique on `(userId, entityType, providerKey, providerId)`: one provider record maps to at most one internal entity
- unique on `(userId, entityType, entityId, providerKey)`: one internal entity maps to at most one record per provider

A mapping the user confirms or sets by hand is saved as `manual` and `locked`. Refresh never replaces a locked mapping.

---

# 20.2 Event Creation and Matching

**Creation.** Events are created only through explicit user actions: manual entry, import approval, pin search, or participant lookup. Refresh updates existing Events and never creates new ones.

**Duplicate check on creation.** Before creating an Event, search for existing Events with the same match key. Offer **Use Existing** or **Create Anyway**. Warn, never block.

**Matching during refresh or lookup.**

1. If a ProviderMapping exists for the provider record, use it. This keeps the link intact through time changes and postponements.
2. If not, look for unmapped internal Events using the match key:
   - team sports: sport + the two teams + start date in the user's timezone. The two teams are order-independent: a pair cannot meet twice with the venues swapped on one local date, so an Event entered with home and away the wrong way round still matches, and the scoreline is written in the Event's own orientation.
   - non-team sports: sport + league + normalized event name + start date
3. Exactly one candidate: create an `auto` mapping.
4. Zero or multiple candidates, such as an MLB doubleheader: create no mapping, and show a **Needs Match** indicator on the unmapped Event.

**Lost mappings.** If a mapped provider record stops appearing in results for its date, flag the Event. Do not delete it or remap it.

**Merge.** An Event Detail action, **Merge Into…**, moves every linked leg, roster slot, lineup slot, pin, and mapping to the surviving Event, then deletes the duplicate.

---

# 21. Sports Data Freshness Model

Do not store one ambiguous global `lastUpdated` value.

Track freshness by provider + sport.

```ts
interface SportsRefreshState {
  id: string
  userId: string

  providerKey: string
  sport: string

  inProgressSince?: string

  lastAttemptAt?: string
  lastSuccessAt?: string
  lastError?: string

  lastRequestCount?: number
  requestsTodayCount: number
  requestsTodayDate: string

  createdAt: string
  updatedAt: string
}
```

This allows the UI to say:

```text
NFL updated 4:18 PM
MLB failed - last successful update 2:10 PM
```

without hiding partial failures.

---

# 22. Sports Data Refresh UX

Primary control:

```text
↻ Refresh Sports Data
```

Nearby:

```text
NFL updated 4:18 PM
MLB updated 4:18 PM
2 overrides need review
```

Refresh behavior:

1. Determine relevant sports.
2. Query provider adapters.
3. Normalize provider results.
4. Match provider Events to internal Events (§20.2).
5. Update automatic Event fields.
6. Preserve all manual overrides.
7. Recalculate derived Betting/Event display state, including `automaticLiveState` for supported markets (§24).
8. Update freshness records.

If refresh fails:

- retain prior data
- show a non-blocking error
- retain manual editing

---

# 22.1 Refresh Safety

**In-flight lock.** Refresh sets `inProgressSince` for each sport. A second refresh request for that sport is ignored while the lock is held. A lock older than 2 minutes is treated as stale and cleared.

**Cooldown.** A sport refreshed successfully within `minRefreshIntervalSeconds` (§50) is skipped, and the UI shows the remaining seconds.

**Parallel, partial writes.** Sports refresh in parallel, each with its own timeout. Each sport's results are written in their own transaction as they arrive. One sport failing or timing out never rolls back another.

**Quota.** Each provider request increments `requestsTodayCount`. At 80% of `dailyRequestLimit`, the refresh control shows a warning. At 100%, that provider is skipped until the count resets, and manual editing continues.

**Lookup caching.** Schedule lookups from explicit actions (§5.5) are cached per provider, sport, and date for `scheduleCacheHours`. Importing ten tickets for one NFL Sunday costs one schedule call. Scores are never served from this cache.

---

# 23. Refresh Scope

A refresh fetches only relevant sports where the provider allows.

Relevant sports may come from:

- active Tickets
- active Fantasy matchups
- active DFS lineups
- pinned Events
- current filters

Example:

```text
Dashboard exposure: NFL + MLB

Refresh:
✓ NFL
✓ MLB
Skip NBA
Skip NHL
```

Do not fetch separate score data for Betting, Fantasy, and DFS when those domains refer to the same Event.

---

# 24. Betting Status Types

```ts
type LegSettlement =
  | "open"
  | "won"
  | "lost"
  | "push"
  | "void"

type TicketStatus =
  | "pending"
  | "active"
  | "won"
  | "lost"
  | "void"
  | "cashed_out"

type LiveLegState =
  | "winning"
  | "losing"
  | "even"
  | "unknown"
```

A leg's settlement and its live state are separate:

- `automaticStatus` and `manualStatus` on BetLeg hold settlement only, typed `LegSettlement`.
- Whether a leg is live is derived (§26.1) and never stored.
- Live state is stored separately as `automaticLiveState`, `manualLiveState`, and a free-text `liveDetail` (§26), such as "covering by 3", "1 / 2 TD", or "38 pts, Q3".

**Writers.**

- In the MVP, the user is the only writer of settlement and live state.
- Once refresh exists (Phase 6), `automaticLiveState` is computed from the Event score for four markets: `moneyline`, `spread`, `game_total`, and `team_total`. This needs no player stats.
- `automaticStatus` stays empty until automatic settlement is built (§53).

---

# 25. Ticket Model

A Ticket is sport-agnostic.

```ts
interface Ticket {
  id: string
  userId: string

  name?: string
  generatedName?: string

  sportsbook?: string
  sportsbookTicketId?: string

  stakeCents: number
  toWinCents: number
  totalReturnCents: number
  actualReturnCents?: number

  isBonusBet?: boolean
  oddsAmerican?: number

  placedAt?: string

  notes?: string
  promotionNote?: string

  tags?: string[]

  manualStatus?: TicketStatus
  settledAt?: string

  sortKey: string

  importRecordId?: string

  createdAt: string
  updatedAt: string
}
```

All money is stored as integer cents in a Postgres `bigint`.

Financial semantics:

```text
$10 to win $150

stakeCents = 1000
toWinCents = 15000
totalReturnCents = 16000
```

```text
$10 bonus bet to win $15

isBonusBet = true
stakeCents = 1000
toWinCents = 1500
totalReturnCents = 1500
```

`totalReturnCents` is entered as shown on the slip and is never derived. For a non-bonus ticket whose return doesn't equal stake plus to-win, show a warning but still allow the save.

The Ticket-level `oddsAmerican` holds combined odds. This matters for same-game parlays, where DraftKings shows no per-leg odds.

`actualReturnCents` is optional and records what the sportsbook actually returned.

The app does not attempt to reproduce sportsbook repricing for void legs, cash-outs, boosts, or other unusual cases.

---

# 26. BetLeg Model

```ts
interface BetLeg {
  id: string
  userId: string
  ticketId: string

  sport: string
  league?: string

  rawDescription?: string

  marketType: string
  selection?: string

  line?: number
  oddsAmerican?: number

  automaticStatus?: LegSettlement
  manualStatus?: LegSettlement

  automaticLiveState?: LiveLegState
  manualLiveState?: LiveLegState
  liveDetail?: string

  automaticCurrentValue?: number
  manualCurrentValue?: number
  targetValue?: number
  progressUnit?: string

  automaticChangedAt?: string
  manualSetAt?: string

  notes?: string

  createdAt: string
  updatedAt: string
}
```

Links to Events, Participants, and Teams live in the join tables below.

A leg with no linked Event is valid. Futures and season-long bets can exist before any Event is attached.

---

# 26.1 BetLeg Event Links

```ts
interface BetLegEvent {
  id: string
  userId: string

  betLegId: string
  eventId: string

  matchMethod: "auto" | "manual"

  createdAt: string
}
```

Unique on `(betLegId, eventId)`.

A leg is live when any linked Event is `in_progress` and the leg is still `open`.

A Ticket's **Next** Event is the earliest-starting Event linked to any of its open legs.

Automatic matching never overwrites a `manual` link.

---

# 26.2 BetLeg Subject Links and Direction

```ts
type RootingDirection = "for" | "against" | "neutral"

interface BetLegSubject {
  id: string
  userId: string

  betLegId: string

  participantId?: string
  teamId?: string

  direction: RootingDirection
  directionSource: "auto" | "manual"

  matchMethod: "auto" | "manual"

  createdAt: string
  updatedAt: string
}
```

Exactly one of `participantId` or `teamId` is set on each row. Enforce this with a check constraint.

Direction means "I want this subject to produce or succeed." Default directions by market:

| Market | Subjects and direction |
|---|---|
| moneyline, spread | selected team for, opponent against |
| game_total | both teams for on Over, against on Under |
| team_total | team for on Over, against on Under |
| player props (yards, TDs, ATTS, etc.) | player for on Over/Yes, against on Under/No |
| winner, top_finish, season_future | selection for |
| matchup | selection for, opponent against |
| custom | subjects neutral until set |

Player props do not create team-level subjects. A Walker ATTS leg does not make the user "for" the Seahawks unless the team is linked by hand.

The parser proposes subjects and directions, and they are editable during review. A direction the user edits becomes `manual`, and later re-parsing or re-matching never overwrites it.

---

# 27. Derived Ticket Status

Unless manually overridden:

```text
any leg lost                                 → lost
all legs settled, every one push or void     → void
all legs settled, at least one won           → won
any leg settled, or any linked Event live    → active
otherwise                                    → pending
```

A leg's settlement is `manualStatus ?? automaticStatus ?? "open"`.

A single-leg ticket that pushes shows `void`, since the stake is refunded. `cashed_out` is manual only.

When a manual Ticket status disagrees with the derived status, show both values (§45).

Ticket status derivation is tracker logic only. It does not calculate actual sportsbook payouts.

---

# 28. All Bet Types Supported

The app must include:

```text
custom
```

as a valid market type from day one.

Normalized common markets may include:

```text
moneyline
spread
game_total
team_total
anytime_touchdown
first_touchdown
player_touchdowns
passing_yards
passing_touchdowns
rushing_yards
receiving_yards
receptions
combined_yards
hits
runs
rbis
hits_runs_rbis
home_runs
strikeouts
winner
top_finish
matchup
season_future
exact_result
custom
```

Unknown bets should never block data entry.

---

# 29. Betting Input

Initial sportsbook parsing target:

```text
DraftKings
```

Entry methods:

```text
Upload Screenshot  (capture in Phase 2, parsing in Phase 3)
Paste Text         (Phase 3)
Type Naturally     (Phase 3)
Manual Entry       (Phase 2)
```

Screenshot assumptions:

- one bet normally does not span screenshots
- one screenshot may contain multiple Tickets
- user may split/merge parser results during review
- source image is deleted after approval

---

# 29.1 Screenshot Inbox

Uploading and reviewing are separate steps. The user can upload from a phone during the day and review on desktop later.

**`/inbox`** lists every ImportRecord not yet approved or rejected, newest first, with a thumbnail and status.

- **Before Phase 3:** an inbox item opens the manual entry form beside the screenshot, for transcription. Approval links the new records to the ImportRecord.
- **From Phase 3 on:** upload triggers parsing right away. Because the user started it, this does not violate §51. The item moves to `needs_review` when parsing finishes, or to `failed` with the error, in which case it can still be entered by hand.

The dashboard header shows an inbox count, for example `3 to review`.

**Image retention:**

| Status | Image |
|---|---|
| approved | deleted immediately |
| rejected | deleted immediately |
| uploaded, parsing, parsed, needs_review, or failed | kept until the user approves, rejects, or deletes the item |

---

# 30. Import Pipeline

All unstructured import follows:

```text
Input
→ Extraction
→ Ticket/Lineup Detection
→ Parsing
→ Participant Matching
→ Event Matching
→ Subject and Direction Proposal
→ Review
→ Approval
→ Save
```

The parser must never silently save imported data.

---

# 31. Import Record

The image itself is deleted after approval, but parser evidence is retained.

```ts
type ImportSource =
  | "screenshot"
  | "text"
  | "manual"

type ImportStatus =
  | "uploaded"
  | "parsing"
  | "parsed"
  | "needs_review"
  | "failed"
  | "approved"
  | "rejected"

interface ImportRecord {
  id: string
  userId: string

  source: ImportSource
  status: ImportStatus

  extractedText?: string
  parsedPayload?: unknown

  originalFilename?: string

  storagePath?: string   // cleared when the image is deleted
  parseError?: string

  createdAt: string
  approvedAt?: string
}
```

Records created from an import carry `importRecordId`.

Images are stored in a private Supabase Storage bucket. Row-level security on the bucket restricts each image to its owner.

Do not retain the screenshot after successful approval unless a future setting explicitly allows it.

---

# 32. Duplicate Detection

Warn but never block.

Possible signals:

- sportsbook ticket ID
- sportsbook
- stake
- To Win
- leg set
- placement timestamp

Actions:

```text
View Existing
Import Anyway
Cancel
```

Intentional duplicates are valid.

---

# 33. Promotions, Cash-Outs, Voids, and Sportsbook Money Logic

Promotions may be stored as notes.

Examples:

```text
Profit Boost
Bonus Bet
No Sweat Bet
Free Bet
Insurance
```

Bonus bets are flagged with `isBonusBet` (§25).

The sportsbook remains authoritative for money calculations.

MVP should not attempt to replicate:

- repriced parlays after a void
- promotional stake rules
- cash-out calculations
- sportsbook-specific settlement adjustments

Use:

```text
actualReturnCents
```

when the user wants to record the final sportsbook return.

---

# 34. Season-Long Fantasy

Fantasy-platform live APIs are not an MVP priority.

Fantasy is initially screenshot/text/manual driven.

The expected weekly workflow is:

```text
Import current matchup
Store starters
Store opponent starters
Do not store/manage benches as part of the core weekly workflow
```

---

# 35. FantasyLeague Model

```ts
interface FantasyLeague {
  id: string
  userId: string

  name: string
  platform?: string

  sport: string
  season: string

  userTeamName?: string

  createdAt: string
  updatedAt: string
}
```

---

# 36. FantasyMatchup Model

```ts
type FantasyMatchupStatus =
  | "upcoming"
  | "live"
  | "final"

interface FantasyMatchup {
  id: string
  userId: string
  fantasyLeagueId: string

  week?: number

  userTeamName: string
  opponentTeamName: string

  automaticUserScore?: number
  automaticOpponentScore?: number

  manualUserScore?: number
  manualOpponentScore?: number

  userProjectedScore?: number
  opponentProjectedScore?: number

  automaticChangedAt?: string
  manualSetAt?: string

  status: FantasyMatchupStatus
  finalizedAt?: string

  sortKey: string

  importRecordId?: string

  createdAt: string
  updatedAt: string
}
```

"Automatic" values come from the most recent approved import.

---

# 37. FantasyRosterSlot Model

Only starters/opponent starters are required for MVP.

```ts
interface FantasyRosterSlot {
  id: string
  userId: string
  fantasyMatchupId: string

  side:
    | "user"
    | "opponent"

  slot: string

  participantId?: string
  participantMatchMethod?: "auto" | "manual"

  playerName: string

  projectedPoints?: number

  automaticActualPoints?: number
  manualActualPoints?: number

  automaticChangedAt?: string
  manualSetAt?: string

  eventId?: string
  eventMatchMethod?: "auto" | "manual"

  createdAt: string
  updatedAt: string
}
```

Automatic matching never overwrites a `manual` link.

---

# 38. Fantasy Experience

Fantasy cards should support:

- matchup name
- your team
- opponent
- imported starters
- imported opponent starters
- current score if manually entered
- player/event links
- cross-league exposure counts
- the **Mark Final** prompt (§8)

Example:

```text
SLEEPER

2 Fast 2 Fantasy
vs Team DanCantDraft

MY STARTERS
Bucky Irving
Emeka Egbuka
...

OPPONENT STARTERS
Kyren Williams
Justin Jefferson
...
```

---

# 39. DFS Domain Model

Separate the reusable Lineup from the contest Entry.

This prevents duplicated player-slot data when one lineup is entered into multiple contests.

```text
DFSLineup
  ├─ LineupSlot
  ├─ LineupSlot
  └─ LineupSlot

DFSEntry
  → references DFSLineup
```

---

# 40. DFSLineup Model

```ts
interface DFSLineup {
  id: string
  userId: string

  platform: string
  sport: string

  slateName?: string

  importRecordId?: string

  createdAt: string
  updatedAt: string
}
```

---

# 41. DFSLineupSlot Model

```ts
interface DFSLineupSlot {
  id: string
  userId: string
  dfsLineupId: string

  slot: string

  participantId?: string
  participantMatchMethod?: "auto" | "manual"

  playerName: string

  salary?: number

  automaticActualPoints?: number
  manualActualPoints?: number

  automaticChangedAt?: string
  manualSetAt?: string

  eventId?: string
  eventMatchMethod?: "auto" | "manual"

  createdAt: string
  updatedAt: string
}
```

`salary` is in DFS salary-cap units, not money.

---

# 42. DFSEntry Model

```ts
type DFSEntryStatus =
  | "upcoming"
  | "live"
  | "final"

interface DFSEntry {
  id: string
  userId: string

  dfsLineupId: string

  contestName?: string

  entryFeeCents?: number
  potentialPrizeCents?: number

  automaticCurrentPoints?: number
  manualCurrentPoints?: number

  automaticChangedAt?: string
  manualSetAt?: string

  status: DFSEntryStatus
  finalizedAt?: string

  sortKey: string

  createdAt: string
  updatedAt: string
}
```

One DFSLineup may be used by multiple DFSEntries.

---

# 43. DFS Input

Initial DFS target:

```text
DraftKings
```

Entry methods:

- Screenshot (Phase 5)
- Free text (Phase 5)
- Manual

Fantasy matchups use the same entry methods. Screenshots go through the Screenshot Inbox (§29.1).

Screenshot parsing should distinguish:

- sportsbook Ticket
- DFS Lineup
- Fantasy Matchup

---

# 44. Unified Player Exposure

The application derives Player Exposure across domains, using the rooting rules in §17.

Example:

```text
KENNETH WALKER III

BETTING
• ATTS
• 2+ TD

FANTASY
• Auburn starter
• Tampa starter

DFS
• DraftKings lineup
```

Example conflict:

```text
EMEKA EGBUKA
MIXED

Own: 3
Against: 1
Betting: ATTS
```

---

# 45. Manual Override Rules

```text
displayedValue = manualValue ?? automaticValue ?? null
```

A manual override must:

- be visibly marked
- survive refresh
- offer **Return to Automatic** per field, plus a **Clear All Overrides** action for each record
- keep the latest automatic value stored underneath

**Timestamps.** Overrides are timestamped per record, not per field. Setting any manual field updates `manualSetAt` for the record.

**Stale overrides.** An override is stale when `automaticChangedAt > manualSetAt`. A stale override shows:

- a conflict marker
- the provider value inline
- a one-click **Use Provider Value** action

A status conflict where the provider reports `final` gets the most prominent marker. The refresh control shows a count of stale overrides, for example `2 overrides need review`.

Refresh never clears an override on its own.

**Derived values.** Ticket status has no automatic source to go stale against. When a manual Ticket status disagrees with the derived status, show both values.

**Overridable fields**

| Record | Fields | Automatic source |
|---|---|---|
| Event | status, scores, period, clock | provider refresh |
| BetLeg | status, live state, current value | live state from refresh (Phase 6); settlement and stats later |
| Ticket | status | derived from legs |
| FantasyMatchup | user score, opponent score | latest import |
| FantasyRosterSlot | actual points | latest import |
| DFSEntry | current points | latest import |
| DFSLineupSlot | actual points | latest import |
| Links | ProviderMapping, BetLegEvent, BetLegSubject, slot links | `locked` / `matchMethod: "manual"` |

For imported records, "automatic" means the value from the most recent approved import. A re-import can therefore flag a hand-entered fantasy score as stale.

---

# 46. Saved View Model

```ts
type DateWindow =
  | { kind: "today" }
  | { kind: "rolling"; pastHours: number; futureHours: number }
  | { kind: "nfl_week" }
  | { kind: "absolute"; start: string; end: string }

type SortMode =
  | "manual"
  | "next_event"
  | "stake"
  | "to_win"
  | "legs_remaining"

interface DashboardView {
  id: string
  userId: string

  name: string
  isDefault: boolean

  filters: {
    domains?: ("betting" | "fantasy" | "dfs")[]
    sports?: string[]
    leagues?: string[]
    tags?: string[]
    dateWindow: DateWindow
    includePinned: boolean
  }

  layout: {
    sortMode: SortMode
    visibleSections: ("active" | "settled" | "final")[]
    collapsedIds?: string[]
    density: "comfortable" | "compact"
    activeWorkspace: "tickets" | "event"
    selectedEventId?: string
    expandedEventIds?: string[]
    openPanes?: ("what_do_i_need" | "fantasy" | "dfs")[]
    scheduleGrouping: "state" | "nfl_window" | "chronological"
  }

  createdAt: string
  updatedAt: string
}
```

`today` and `nfl_week` use the day rollover (§8). `nfl_week` runs from the Tuesday rollover through the following Tuesday rollover.

**On restore:**

- If `selectedEventId` is missing or outside the date window, the workspace falls back to All Active Tickets.
- Any `collapsedIds` pointing to records that no longer appear are dropped the next time the View is saved.

The default **Active** View uses `dateWindow: { kind: "rolling", pastHours: 0, futureHours: 168 }` with `includePinned: true`. Upcoming Events more than 7 days out are hidden unless a View widens the window.

---

# 46.1 Working State

```ts
interface WorkspaceState {
  userId: string
  baseViewId?: string
  filters: DashboardView["filters"]
  layout: DashboardView["layout"]
  updatedAt: string
}
```

There is one row per user, saved on every change.

When the working state differs from its base View, the View name shows **Modified** with three actions:

- **Save**
- **Save as New View**
- **Revert**

Dragging a card never marks a View as modified, because order is global (§5.3).

---

# 47. API Research Priority

API research focuses first on schedules, scores, and Event state.

Phase 0 research sports:

```text
NFL
Golf or F1 (one non-team sport, to validate the Event model)
```

The remaining sports (MLB, NBA, NHL, NCAAF, NCAAB, and the other of Golf or F1) are researched in Phase 7 using the same questions.

Fantasy-platform APIs are out of scope for Phase 0.

---

# 48. Phase 0 API Questions

For each candidate provider determine:

- Does it support the required sport?
- Can one call return a full slate/day/round?
- How many requests does one manual refresh cost?
- Does it provide stable Event IDs?
- Does it provide:
  - score
  - status
  - start time
  - period / quarter / inning / lap where relevant
  - clock where available
- How current is data after a manual refresh?
- Can internal Events be matched reliably using the §20.2 match key?
- What happens when quota is exhausted?
- Are player stats available for a later phase?
- Are Golf/F1 represented in a usable Event structure?

---

# 49. API Validation Deliverable

Before sports-data integration, create:

```text
/docs/api-evaluation.md
```

It should contain:

- candidate providers tested
- sports supported
- authentication method
- real sample requests
- real sample normalized payloads
- API calls per manual refresh, measured on a real NFL Sunday slate
- quota/cost notes
- observed freshness
- identifier strategy
- missing fields
- provider recommendation per sport
- fallback plan

The app may use more than one provider.

Do not require a single vendor to support every sport.

---

# 50. Provider Architecture

```ts
interface SportsProvider {
  key: string

  config: ProviderConfig

  supportsSport(
    sport: string
  ): boolean

  getSchedule(
    params: unknown
  ): Promise<ProviderEvent[]>

  getScores?(
    params: unknown
  ): Promise<ProviderEvent[]>

  getEvent?(
    providerEventId: string
  ): Promise<ProviderEvent>

  getPlayerStats?(
    providerEventId: string
  ): Promise<unknown>
}

interface ProviderConfig {
  minRefreshIntervalSeconds: number   // default 60
  dailyRequestLimit?: number
  timeoutMs: number                   // default 15000
  scheduleCacheHours: number          // default 6
}
```

The app must also support:

```text
ManualSportsProvider
```

External providers are adapters, not the source of truth for user-created records.

---

# 51. No Background Polling in MVP

Do not build:

- cron jobs for scores
- scheduled sports refresh
- server polling loops
- browser polling timers
- background score workers

Sports-data network activity happens only through:

- explicit Refresh Sports Data
- explicit lookup/matching/search actions
- future optional auto-refresh

---

# 52. Player Stats

Player-stat automation is later priority (Phase 8).

When available, it may drive:

```text
Jonathan Taylor
72 / 100 Rush Yds

Jahmyr Gibbs
1 / 2 TD

Tyler Shough
214 / 260 Pass Yds
```

Until then:

- player progress can be entered manually through `manualCurrentValue`
- Betting/Fantasy/DFS records can still link to Participants and Events

---

# 53. Automatic Settlement

Not required for the first build.

Automatic live state for `moneyline`, `spread`, `game_total`, and `team_total` arrives in Phase 6 (§24). This computes winning/losing from the Event score and does not settle legs.

When settlement is implemented, start with the same four event-derived markets, writing to `automaticStatus`. Then add props only if the available data is reliable enough.

Manual status entry always remains available.

---

# 54. Completed and Dead Content

Settled Tickets, including lost ones, move to the collapsed Settled section and leave the dashboard at the next rollover (§8).

Completed Events appear in the collapsed FINAL group of the Schedule Rail for the rest of the day (§8).

Both remain available in `/history`.

---

# 55. Print

Support both:

## 55.1 Print Current View

A fast action that prints a simplified representation of the current dashboard/filter state.

## 55.2 Dedicated Print Screen

Route:

```text
/print
```

Possible presets:

```text
Betting Sheet
Fantasy Sheet
Combined Sports Sheet
```

Customizable options may include:

- Betting
- Fantasy
- DFS
- sports
- Events
- completed/dead items
- odds
- player progress
- density

Print design priorities:

- US Letter landscape
- large type
- easy scanning
- minimal dead space
- markable checkboxes
- browser-print friendly

The existing Week 3 sheets are a starting reference, not a locked design.

---

# 56. History

MVP requirement:

```text
Store historical records.
```

Advanced analytics are intentionally deferred.

Future possibilities:

- Betting ROI
- named-Ticket performance
- DFS results
- Fantasy weekly history
- player exposure history
- market/sport breakdowns

---

# 57. Export / Backup

Not required for the first milestone, but the architecture should support user-owned data export.

Future action:

```text
Export My Data
```

Potential formats:

```text
JSON
CSV
```

Do not make the application a data silo.

---

# 58. Bankroll

Not MVP.

Do not build:

- deposits
- withdrawals
- bankroll balances
- bankroll strategy

---

# 59. Notifications

Future only.

Potential examples:

- Ticket won/lost
- one leg remaining
- Event starting
- player prop resolved

No notification infrastructure required now.

---

# 60. Long-Duration Bets and Tracking

The model must support:

- futures
- golf tournaments
- F1 weekends/races
- season-long bets
- bets spanning multiple days/weeks

Legs with no linked Event never appear in the Schedule Rail. Long-running Events appear only under the eligibility rules in §8.

---

# 61. Suggested Routes

```text
/
  Dashboard

/tickets
  Ticket library

/tickets/[id]
  Ticket detail/edit

/add
  Add Betting / Fantasy / DFS

/inbox
  Screenshot Inbox

/import/[id]
  Review import

/print
  Dedicated print workspace

/history
  Historical records

/settings
  User preferences / providers / timezone / rollover hour
```

---

# 62. Suggested Technical Stack

```text
Next.js
TypeScript
Tailwind CSS
Supabase
PostgreSQL
Supabase Auth
Vercel
GitHub
dnd-kit
```

Use server-side environment variables for:

- AI parsing credentials
- sports-data provider credentials

---

# 63. Persistence

Persist:

- authenticated user settings, including timezone and rollover hour
- Teams
- Participants
- Events
- ProviderMappings
- SportsRefreshState
- Tickets
- BetLegs
- BetLegEvents
- BetLegSubjects
- FantasyLeagues
- FantasyMatchups
- FantasyRosterSlots
- DFSLineups
- DFSLineupSlots
- DFSEntries
- tags
- DashboardViews
- WorkspaceState
- manual overrides
- sort keys
- imports
- screenshot images, until approval or rejection (§29.1)
- extracted raw text
- parsed import payloads

Do not retain approved source screenshots by default.

---

# 63.1 Delete Behavior

All deletes are hard deletes behind a confirmation dialog showing what will be affected. There is no soft delete in the MVP.

| Deleting | Effect |
|---|---|
| Ticket | cascades to its legs and their event and subject links |
| BetLeg | cascades to its event and subject links |
| Event | blocked while anything links to it; offers **Merge Into…** or **Unlink All**, then delete; its mappings cascade |
| Team, Participant | blocked while anything links to it; offers **Merge Into…** |
| FantasyLeague | cascades to its matchups and their slots |
| FantasyMatchup | cascades to its slots |
| DFSLineup | blocked while entries reference it |
| DFSEntry | removes the entry only; if the lineup has no remaining entries, offers to delete the lineup too |
| ImportRecord | created records remain; their `importRecordId` is set to null |

Participant and Team merge work like Event merge: every link moves to the surviving record, then the duplicate is deleted.

---

# 64. Build Phases

Each phase ends at its exit criteria (§65). Two milestones sit on top of the phases:

- **First Usable Sunday:** Phases 1 through 4. Mobile screenshot upload, sportsbook import from screenshots or text, manual entry, and the full dashboard, with no sports API.
- **MVP Complete:** Phases 0 through 6.

| Phase | Scope | Depends on |
|---|---|---|
| 0 | API research: NFL and one non-team sport | none; runs in parallel with Phases 1 to 4 |
| 1 | Foundation | none |
| 2 | Betting core and mobile screenshot upload | 1 |
| 3 | DraftKings sportsbook import: screenshot or pasted text | 2 |
| 4 | Core dashboard | 2 |
| 5 | Fantasy and DFS: manual and screenshot import | 3, 4 |
| 6 | Sports refresh: NFL and the Phase 0 sport | 0, 4 |
| 7 | Remaining sports providers | 6 |
| 8 | Player stats and prop progress | 6 |
| 9 | Print | 4 |

**Phase 1: Foundation.** Supabase integration, Auth, user preferences (timezone, rollover hour), Team, Participant, Event, ProviderMapping, manual Event entry, duplicate check, Event merge, manual overrides with stale detection, shared provider interfaces.

**Phase 2: Betting Core.** Ticket and BetLeg CRUD, BetLegEvent and BetLegSubject with default directions, derived Ticket status, manual leg and Ticket status, money in cents, tags, `sortKey` ordering, delete behavior, Participant and Team merge, mobile screenshot upload, private image storage, `/inbox` with manual entry beside the screenshot.

**Phase 3: Sportsbook Import.** DraftKings screenshot and slip-text parsing, multiple Tickets per screenshot, split and merge, parse failures, review screen, Event and Participant matching against internal records, subject and direction proposal, duplicate warnings, ImportRecord retention, image deletion after approval.

**Phase 4: Core Dashboard.** Schedule Rail, All Active Tickets, Event Detail, exposure counts, pinning and auto-unpin, day rollover, Settled section, context panes, What Do I Need?, mixed rooting, Saved Views, working state, mobile layout.

**Phase 5: Fantasy and DFS.** FantasyLeague, FantasyMatchup, starters and opponent starters, DFSLineup reused across DFSEntries, manual scores, fantasy matchup and DFS lineup screenshot import, player/Event links, Mark Final prompt, unified Player Exposure.

**Phase 6: Sports Refresh.** Provider adapter(s) from Phase 0, Refresh Sports Data, Event matching and mapping, per-sport freshness, refresh safety (§22.1), stale-override count, `automaticLiveState` for the four simple markets, explicit-action lookups.

**Phase 7: Remaining Sports.** Phase 0 questions and adapters for MLB, NBA, NHL, NCAAF, NCAAB, and the other of Golf or F1.

**Phase 8: Player Stats.** Player statistics, prop progress, richer DFS and Fantasy context.

**Phase 9: Print.** Print Current View, `/print`, Betting, Fantasy, and Combined presets, large-type landscape output.

---

# 64.1 Test Fixture

Before Phase 2, build `/fixtures/nfl-week-3.ts` from the existing Week 3 sheets. It should contain:

- the NFL Events for that week
- every Ticket and leg, including at least one same-game parlay, one bonus bet, and one futures leg with no Event
- every fantasy matchup, with starters and opponent starters
- one DFS lineup used in 3 entries
- one player with MIXED exposure
- DraftKings screenshots and pasted slip text for the fixture's tickets, including one screenshot with 3 tickets
- one fantasy matchup screenshot and one DFS lineup screenshot
- expected values: Ticket statuses, exposure count per Event, and rooting label per player

Exit criteria below refer to this fixture as "the fixture."

---

# 65. Phase Exit Criteria

**Phase 0: API Research**

- `docs/api-evaluation.md` answers every §48 question for NFL and for one of Golf or F1.
- It includes the measured request count for one full refresh of a real NFL Sunday slate.
- It recommends a provider and states a fallback plan.

**Phase 1: Foundation**

- Sign-in works. A second test account cannot read the first account's rows through the Supabase client.
- Creating a manual Event with the same match key as an existing one shows the duplicate warning.
- A manual score displays with its override marker, and **Return to Automatic** restores a seeded automatic value.
- Writing a newer automatic value after an override shows the stale-override marker.
- **Merge Into…** moves every link to the surviving Event.
- The app runs with no provider environment variables set.

**Phase 2: Betting Core**

- The fixture loads, and every Ticket's derived status matches its expected value.
- A leg can link to two Events, and a leg with no Event saves.
- Default subjects and directions match the §26.2 table for each market in the fixture. A manually set direction survives re-matching.
- Money round-trips in cents. A non-bonus ticket whose return doesn't equal stake plus to-win shows the warning and still saves.
- Each row of the §63.1 delete table has a test.
- Dragging a card persists across reload and writes one row.
- At 390px width, uploading 5 screenshots at once, including one HEIC, puts all 5 in `/inbox`, visible on desktop.
- Transcribing an inbox item by hand and approving it links the new Ticket to the ImportRecord and deletes the image from storage.

**Phase 3: Sportsbook Import**

- The fixture's DraftKings screenshots produce a review screen with the correct tickets and legs. The screenshot containing 3 tickets produces 3. Split and merge work.
- Pasting the fixture's slip text produces the same tickets and legs.
- Nothing is written to Ticket or BetLeg tables before approval.
- Legs match existing internal Events by match key. Unmatched legs are flagged.
- Importing the same ticket twice shows the duplicate warning.
- A parse failure shows `failed` with the error, and the item can still be entered by hand.
- After approval, the source image is gone from storage, and the ImportRecord retains `extractedText` and `parsedPayload`.

**Phase 4: Core Dashboard**

- With the fixture loaded, the Schedule Rail shows the expected Events with the expected exposure counts.
- Clicking an Event opens Event Detail, and the control back to All Active Tickets works.
- The MIXED player in the fixture shows MIXED in Event Detail and in What Do I Need?
- Settled tickets leave the dashboard at the first rollover after `settledAt`. Test this with a mocked clock.
- A saved View restores its filters, sections, pane, and sort mode. A View whose saved Event is outside its window falls back to All Active Tickets.
- Switching sort mode and back to `manual` restores the manual order.
- Reloading mid-day restores the working state. Reloading after rollover loads the default View.
- Every workflow in this phase completes at 390px width without dragging.

**Phase 5: Fantasy and DFS**

- The fixture's fantasy matchups and DFS lineup load and link to Events.
- The DFS lineup counts once in exposure despite having 3 entries.
- When all of a matchup's linked Events are final, **Mark Final** appears. Status does not change on its own.
- The fixture's fantasy matchup screenshot and DFS lineup screenshot parse correctly.
- The parser tells a sportsbook ticket, a DFS lineup, and a fantasy matchup apart.

**Phase 6: Sports Refresh**

- Refresh updates automatic fields on mapped Events and creates no new Events.
- Manual overrides survive refresh. Overrides with newer provider values show as stale, and the refresh control shows their count.
- Simulating a timeout for one sport leaves the other sport's results saved.
- A second click during a refresh does nothing. A click inside the cooldown shows the remaining seconds.
- Moneyline, spread, game total, and team total legs show `automaticLiveState` from the Event score.
- With the app open and idle for 10 minutes, the network log shows zero provider requests.

Phases 7 through 9 get exit criteria when they are scheduled.

---

# 66. Explicitly Deferred

Do not allow Codex to silently expand the MVP to include:

- automatic fantasy-platform sync
- Yahoo OAuth
- continuous live polling
- bankroll management
- advanced ROI analytics
- sportsbook payout engine
- automatic repricing after voids
- round-robin engine
- notifications
- full freeform/resizable dashboard canvas
- comprehensive player-prop settlement
- data export UI
- multi-user sharing
- soft delete / undo
- share-sheet upload (PWA share target)

These can be added later.

---

# 66.1 Agent Working Rules

- Work one phase per branch and pull request.
- Stop when the phase's exit criteria pass. Do not begin the next phase.
- Do not add schema, routes, or UI that belongs to a later phase.
- Make schema changes only through Supabase migrations.
- Each phase ends with `docs/phase-N.md`. It lists every exit criterion, marked as passed by an automated test or by a manual check, with notes on anything deferred.

---

# 67. Definition of Success

The desired workflow is:

```text
1. Sign in.
2. Open one persistent dashboard.
3. See the latest saved sports state immediately.
4. See all active Tickets in the center.
5. Scan the left Schedule Rail for every relevant Event across sports.
6. Click an Event to see everything that matters in that game/race/round.
7. Open a contextual pane when more detail is useful.
8. Add Betting, Fantasy, and DFS information through manual entry or import.
9. Rearrange cards and save the screen as a View.
10. Click Refresh Sports Data whenever current scores are wanted.
11. See shared Event data update across Betting, Fantasy, and DFS.
12. Manually override anything the external data gets wrong or cannot provide.
13. See mixed rooting interests without losing context.
14. Print either the current screen or a dedicated customized sheet.
15. Close the app with zero background API activity.
16. Return days or weeks later without rebuilding the workspace.
```

The core product is not a sportsbook, fantasy platform, or live-score service.

It is:

> A customizable sports-watching workspace that combines the user's bets, fantasy exposure, DFS exposure, and relevant sports schedule in one place.
