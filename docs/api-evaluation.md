# API Evaluation (Phase 0)

Deliverable for PRD §49. Every number here was measured against the live APIs on
2026-10-05 (NFL season week 4) rather than taken from vendor documentation.

**Recommendation: ESPN for Events, Sleeper for player stats, Tank01 as the
documented fallback.** The two primaries are complementary, not competing —
ESPN has no fantasy points and Sleeper has no scores or clock.

---

## 1. Summary

| Need | Provider | Auth | Calls per refresh | Cost |
| --- | --- | --- | --- | --- |
| NFL schedule, score, status, period, clock | ESPN `site.api.espn.com` | none | 1 | free |
| NFL per-player live stats + fantasy points | Sleeper `api.sleeper.app` | none | 1 | free |
| Golf tournament + leaderboard | ESPN `golf/pga` | none | 1 | free |

**Two calls per manual refresh covers every NFL game and every player**, no
matter how many games the user has action in. That is the single most important
finding: both primaries are slate-wide rather than per-game, so refresh cost is
flat.

---

## 2. Candidates tested

Evaluated for the access pattern this app actually has: manual refresh only
(§51), one user, 20-50 refreshes across an NFL Sunday. Cost and free-tier limits
dominate; throughput and streaming are irrelevant.

| Provider | Verdict | Why |
| --- | --- | --- |
| **ESPN** (unofficial) | **primary, Events** | Free, no key, one call per slate, has period + clock. Undocumented and against Disney ToS. |
| **Sleeper** (unofficial) | **primary, player stats** | Free, no key, one call for every player's stats, includes PPR points. Explicit non-commercial grant. |
| **Tank01** (RapidAPI) | **documented fallback** | Free 1,000 req/month, $10/mo for 1,000/day. Keyed, documented, ToS-clean. |
| api-sports.io | fallback, scores only | Free 100 req/day forever, keyed, documented, has quarter + clock. 100/day is ~11 refreshes at 9 calls each. |
| The Odds API | rejected | 500 credits/mo free, but no period, no clock, no player stats. |
| nflverse / nflfastR | rejected | Not live. Play-by-play lands ~15 min after a game *ends*. |
| MySportsFeeds | rejected | $5 Personal tier is explicitly non-live; player stats are a paid add-on. |
| SportsDataIO | rejected | Free tier serves last season. Live starts $99/mo. |
| balldontlie | rejected | $9.99/mo per sport, period/clock unverified. |
| TheSportsDB | rejected | $9/mo for 2-minute livescores, ID stability unverified. |
| Slash Golf | golf fallback | Free 250 calls/month, Pro $25/mo. |
| SportRadar, Rolling Insights, FantasyNerds, Goalserve | rejected | Enterprise pricing: $200-600/mo or quote-only. |

---

## 3. ESPN — sample requests

Base: `https://site.api.espn.com/apis/site/v2/sports`

### 3.1 Current slate (the main refresh call)

```
GET /football/nfl/scoreboard
→ 200, 289,377 bytes, 187 ms, 16 events
```

### 3.2 Single date

```
GET /football/nfl/scoreboard?dates=20261005
→ 200, 22,778 bytes, 136 ms, 1 event
```

### 3.3 Date ranges are broken — do not use

```
GET /football/nfl/scoreboard?dates=20261001-20261006
→ 400 {"code":400,"message":"Failed to get events endpoint."}
```

Range queries began failing on 2026-09-18 across every ESPN team sport and were
still failing when measured. Single-date and no-date queries are unaffected, and
golf ranges still return 200. The adapter only ever issues single-date or no-date
requests, so this regression does not affect us — but it is the clearest evidence
that this endpoint changes without notice.

### 3.4 Per-player box score

```
GET /football/nfl/summary?event=401872978
→ 200, 666,034 bytes, 131 ms
```

`boxscore.players[]` carries one entry per team, each with stat categories
`passing, rushing, receiving, fumbles, defensive, interceptions, kickReturns,
puntReturns, kicking, punting`. Stats arrive as a parallel `labels` / `stats`
string array, e.g. receiving is `REC | YDS | AVG | TD | LONG | TGTS`.

**This endpoint is one call per game**, which is why Sleeper is preferred for
player stats. ESPN's box score is retained only as the fallback path.

### 3.5 Free player data on the slate call

Each `competitions[0].leaders[]` holds the top three for `passingYards`,
`rushingYards`, and `receivingYards` with athlete IDs. Useful for a glance, not
sufficient for a prop on an arbitrary player.

### 3.6 Golf

```
GET /golf/pga/scoreboard
→ 200, 713,556 bytes, 269 ms, 1 event, 120 competitors
```

Tournament-level Event with `date` + `endDate` spanning four days, and
competitors carrying `order` (position) and `score` (`"-26"`). This maps onto the
tournament-level option already allowed by PRD §12, so the Event model needs no
change.

### 3.7 Why golf and not F1

```
GET /racing/f1/scoreboard
→ 200, 44,394 bytes, 146 ms, 1 event, 5 competitions, 22 competitors
```

An F1 Grand Prix returns **five** competitions per weekend — practice,
qualifying, sprint, race — each with its own `type` and `date`. That forces a
product decision ("is qualifying an Event?") before any code can be written.
Golf is one Event with one leaderboard, and still exercises the non-team path:
N competitors, position, score-to-par, a cut line, and no clock. Golf is
therefore the Phase 0 non-team sport. F1 moves to Phase 7.

---

## 4. Sleeper — sample requests

Base: `https://api.sleeper.app/v1`

### 4.1 Current week

```
GET /state/nfl
→ 200 {"week":4,"season":"2026","season_type":"regular","display_week":4}
```

### 4.2 All player stats for a week (the main refresh call)

```
GET /stats/nfl/regular/2026/4
→ 200, 445,320 bytes, 2,230 entries
```

Keyed by Sleeper player ID, with no names in the payload. Per-player fields
include `pass_yd, pass_td, pass_att, pass_cmp, pass_int, rush_att, rush_yd,
rec, rec_yd, rec_td, rec_tgt, rec_lng` and precomputed `pts_ppr`,
`pts_half_ppr`, `pts_std`.

Of the 2,230 entries, 299 players had yardage and 357 recorded any counting
stat or fantasy points — the number the adapter keeps. The remainder are
inactive players plus 30 `TEAM_*` aggregates, which are not players.

### 4.3 Player directory

```
GET /players/nfl
→ 200, 14,661,480 bytes, 421 ms, 12,229 entries
```

14.6 MB. Fetch at most once per day and cache — Sleeper's own docs say so. This
is the name/team/position source needed to resolve the stats payload. It
resolved a name for 357/357 of week 4's statted players.

### 4.4 Accuracy check against ESPN

Same game (DET @ CAR, event `401872978`), Sleeper stats vs the ESPN box score:

| Player | Sleeper | ESPN | Match |
| --- | --- | --- | --- |
| Jared Goff | 412 pass yd, 1 TD | 412 YDS, 1 TD | yes |
| Jameson Williams | 6 rec, 102 yd, 8 tgt | 6 \| 102 \| 8 | yes |
| Sam LaPorta | 8 rec, 84 yd, 1 TD, 13 tgt | 8 \| 84 \| 1 \| 13 | yes |
| Bryce Young | 329 pass yd, 2 TD | 329 YDS, 2 TD | yes |

Exact agreement on every field checked, plus fantasy points ESPN does not
provide.

---

## 5. Calls per manual refresh

Measured against the real week 4 slate (16 games).

| Strategy | Calls | Notes |
| --- | --- | --- |
| **ESPN slate + Sleeper stats** | **2** | Flat. Every game, every player. |
| ESPN slate + ESPN box scores | 1 + *g* | *g* = games with action. 9 calls for 8 games. |
| Sleeper player directory | +1/day | 14.6 MB, cached daily, not per refresh. |

At 50 refreshes on a Sunday the recommended path costs ~100 ESPN calls and ~50
Sleeper calls. Sleeper's stated ceiling is 1,000 calls per *minute*; ESPN
publishes no limit. Neither is close to a constraint, which is why §22.1's quota
machinery is implemented but will not trigger in practice.

---

## 6. Observed freshness

**Not yet verified in-game.** Every week 4 game was already `STATUS_FINAL` when
these measurements were taken, except one not-yet-started game, so no
in-progress diff was possible.

- ESPN scoreboard carried a live `STATUS_END_PERIOD` state with `period: 3` and
  `displayClock` during the Sunday slate, so ESPN is live beyond doubt.
- **Sleeper's in-game update cadence is the one open risk.** Third-party
  write-ups describe ~60-second live scoring; this is unconfirmed. Verify by
  polling `/stats/nfl/regular/2026/4` twice during a game in progress and
  diffing a receiver's `rec_yd`.

If Sleeper turns out to be post-game only, the fallback is ESPN's
`summary?event=` box score at one call per game — more expensive but live.

---

## 7. Identifier strategy

| Entity | Provider | ID | Stability |
| --- | --- | --- | --- |
| NFL Event | espn | `event.id`, e.g. `401872978` | numeric, stable |
| NFL team | espn | `competitor.team.id` + `abbreviation` | stable |
| Golf tournament | espn | `event.id` | stable |
| Player stats | sleeper | Sleeper `player_id`, e.g. `3163` | stable |

All of these persist to `provider_mappings`, which is already keyed on
`(user_id, entity_type, provider_key, provider_id)` and therefore holds ESPN and
Sleeper mappings for the same entity side by side (§20.1).

**Do not use Sleeper's `espn_id` field for the crosswalk.** Measured coverage:

- 46.0% of active QB/RB/WR/TE/K (1,472/3,201)
- **27.7%** of players who actually recorded week 4 stats (99/357)

Match Sleeper players to internal Participants on normalized name + team +
position instead, then persist the result as an `auto` mapping so the lookup
happens once. Sleeper's directory also exposes `gsis_id`, `yahoo_id`,
`sportradar_id`, and `oddsjam_id` if a better crosswalk is needed later.

---

## 8. Missing fields

| Field | Status |
| --- | --- |
| Score, status, start time, period, clock | ESPN, complete |
| Per-player counting stats | Sleeper, complete |
| Fantasy points (PPR / half / standard) | Sleeper, precomputed |
| Golf position + score to par | ESPN `order` + `score` |
| Golf clock | n/a for the sport |
| Live win probability, odds | present in ESPN `summary` but out of scope |
| Player stats for golf/F1 | not evaluated, Phase 7 |

No required field is missing from the recommended pair.

---

## 9. Risks and fallback plan

### ESPN is undocumented and against Disney's terms

ESPN shut down its official public API in 2014. `site.api.espn.com` is the
internal JSON API behind espn.com: no key, no docs, no changelog, no published
rate limit, no support. [Disney's Terms of Use](https://disneytermsofuse.com/english/)
prohibit accessing their products "using a robot, spider, script, or other
automated means" and license content for personal, non-commercial use only.
There is no API carve-out, so this app satisfies non-commercial but violates
automated access. At ~100 requests on a Sunday from one residential IP,
practical enforcement risk is negligible — but it is a known, accepted
compromise, not an oversight.

### Sleeper is undocumented but explicitly permitted

[Sleeper's docs](https://docs.sleeper.app/) cover users, leagues, drafts, and
players — the stats and projections endpoints used here are absent. However the
docs grant the API as "free to use for non-commercial purposes," require no
token, and set a 1,000-call-per-minute ceiling. An explicit grant for an
undocumented endpoint is a materially better position than ESPN's.

### Required adapter behavior

The 2026-09-18 range regression returned a clean HTTP 400, and several
open-source projects silently stored zero events because they treated the error
as "no games today."

**Both adapters must treat an empty slate as an error, never as "no action."**
A refresh that parses successfully but yields nothing must set `lastError` and
leave stored values untouched, per §45 (refresh never clears user data).

### Fallback plan

1. **ESPN Events fail** → api-sports.io API-AMERICAN-FOOTBALL (free 100/day,
   keyed, documented, has quarter + clock). Scores only; tight quota.
2. **Sleeper player stats fail** → ESPN `summary?event=` box scores, one call
   per game with action.
3. **Both fail** → Tank01 on RapidAPI (free 1,000/month, $10/mo for 1,000/day),
   the only documented keyed option covering live player stats at this budget.
4. **All providers fail** → `ManualSportsProvider`. Manual score and status entry
   already works and is unaffected, by design (§50, §51).

Because `provider_mappings` is keyed per provider, adding any fallback is a new
adapter plus mapping rows, not a migration.

---

## 10. Unconfirmed

Carried forward deliberately rather than guessed:

- Sleeper's in-game update cadence (§6) — the one material open risk.
- Whether api-sports.io's free 100/day tier populates player statistics
  *during* a game; their docs return 403 to non-browser clients.
- Tank01's live payload shape, which needs a RapidAPI key to inspect.
- MySportsFeeds' DETAILS add-on price.
- SportsBlaze pricing, which is not published anywhere findable.
