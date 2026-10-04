// Screenshot -> text extraction (docs/PRD.md section 30, "Extraction").
//
// Uses raw fetch instead of @anthropic-ai/sdk, same as Reel-Palate's
// src/lib/recommend/anthropic.ts — one endpoint, one JSON shape, no need
// for the SDK's transitive deps.
//
// Claude is asked to transcribe the screenshot directly into one of three
// strict text formats — "Bet Slip", "DFS Lineup", or "Fantasy Matchup" —
// so the screenshot and paste-text inputs converge on the same
// deterministic parsers immediately after extraction (docs/PRD.md section
// 43: "Screenshot parsing should distinguish: sportsbook Ticket, DFS
// Lineup, Fantasy Matchup"). Extraction only has to pick the right format
// and get the layout/field values right; detect-kind.ts then routes the
// transcribed text to the matching parser by its header line.

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
// Sonnet, not Haiku: Sport inference (team/player name -> league) needs
// reliable instruction-following, not just speed — Haiku was observed in
// production dropping the Sport field despite explicit prompt instructions.
const ANTHROPIC_MODEL = "claude-sonnet-4-6";
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_OUTPUT_TOKENS = 4_000;
const REQUEST_TIMEOUT_MS = 30_000;

const SYSTEM_PROMPT = `You transcribe screenshots of sportsbook bet slips, season-long fantasy matchups, or DFS (daily fantasy sports) lineups into one of three strict text formats.

Before transcribing, work out two things silently: (1) which of the three formats the screenshot shows, and (2) the Sport/league for every team, player, or matchup pictured — identify it from the team names, player names, or league branding you recognize (e.g. "Colts" and "Commanders" -> football/NFL; "Lakers" -> basketball/NBA; a name you don't recognize as a team but that sounds like an athlete's name -> infer from context clues like market type, e.g. "passing_yards" implies football). You almost always know this even when the word "football" or "NFL" is never printed — real-world bet slips rarely spell it out. Only use "unknown" for Sport in the rare case where there is truly no identifiable team, player, or league anywhere in the image. Every "Sport:" line in your output must carry this same determination — it is a required field, not an optional one like the "(omit if not shown)" fields below.

Then output ONLY the transcribed text in the one matching format — no commentary, no markdown fences, no mixing formats in one response.

=== FORMAT 1: Bet Slip (sportsbook ticket, e.g. DraftKings/FanDuel Sportsbook) ===

One screenshot may show one or more bet slips ("tickets"). Emit one block per ticket, back to back, each starting with a line of the exact form:
Bet Slip #<ticket id>
(Omit "#<ticket id>" — just "Bet Slip" alone — if no ticket/confirmation ID is visible.)

Real sportsbook tickets (DraftKings/FanDuel) usually show each leg's game context as its own row below the market/selection/odds line, laid out as: <away abbreviation/logo> ... <relative time, e.g. "Today 1:00 PM" or "Mon 8:15 PM"> ... <home abbreviation/logo>, left team = away, right team = home. Use that row for Event; do NOT convert a relative time like "Today 1:00 PM" into a guessed absolute Start date — you don't reliably know "today"'s real calendar date from the image, so a confident-looking but wrong Start is worse than omitting it. Only emit Start when an absolute date is actually printed (e.g. "Sep 21" or a full date/time).

Same Game Parlay (SGP) tickets often nest two or more picks from one game under a single combined odds value, with no individual odds shown per pick — and some tickets ("SGPx") combine several such SGP groups plus standalone legs into one larger parlay. Flatten every individual selection into its own "Leg N:" block regardless of this grouping; when a leg's own odds aren't separately shown (only the group/combined odds is), omit that leg's Odds line rather than guessing a split.

Within each ticket block, in this order:
Type: Straight | <N>-Leg Parlay | <N>-Leg Same Game Parlay
Bonus Bet                              (only include this literal line if the slip is marked as a bonus/free bet)
Leg 1:
Market: <one of: moneyline, spread, game_total, team_total, anytime_touchdown, passing_yards, passing_touchdowns, rushing_yards, receiving_yards, receptions, hits, runs, rbis, home_runs, strikeouts, winner, top_finish, season_future, matchup, custom>
Selection: <the selected outcome as shown, e.g. "Kansas City Chiefs" or "Patrick Mahomes Over 275.5">
Subject: <the canonical player/team name the leg is about, when it differs from Selection — required for player-prop and team_total markets, optional otherwise>
Opponent Subject: <the opposing player/team name, ONLY for "matchup" markets with no single game/Event, e.g. a cross-game player-vs-player bet>
Event: <Away Team> @ <Home Team>       (omit this line entirely if no single game/matchup is shown, e.g. season futures or cross-game matchups)
Sport: <sport>/<league>                (REQUIRED — see the Sport determination above; use "unknown" only if truly undeterminable. Omit only the "/<league>" part if the league specifically can't be determined.)
Start: <ISO 8601 UTC timestamp>        (omit unless an absolute date is shown — see the game-row note above; do not convert a relative time like "Today 1:00 PM")
Line: <numeric line>                   (omit if not applicable)
OverUnder: over | under | yes | no     (omit if not applicable)
Odds: <american odds, e.g. -150 or +120>  (omit if this leg has no individually-shown odds, e.g. an SGP pick under a combined group odds)
(repeat "Leg N:" through "Odds:" for each additional leg, in the order shown, including every individual pick from inside an SGP/SGPx grouping)
Wager: $<amount>
To Win: $<amount>
Payout: $<amount>
Placed: <ISO 8601 UTC timestamp>       (omit if not shown)
Promo: <free-text promo name, e.g. "Profit Boost", "+50% Parlay Boost", "QUALIFYING BET">  (omit if not shown; also use this for boost/qualifying-bet banners even when a struck-through original odds value is shown alongside a boosted one — transcribe only the final boosted Odds value for the leg/ticket in that case)

=== FORMAT 2: Fantasy Matchup (season-long fantasy, e.g. Sleeper/ESPN/Yahoo matchup screen) ===

One screenshot may show one or more matchups. Emit one block per matchup, back to back, each starting with the literal line:
Fantasy Matchup

Within each matchup block, in this order:
Platform: <e.g. Sleeper, ESPN, Yahoo>  (omit if not shown)
League: <the fantasy league's name>
Sport: <sport>/<league>                (REQUIRED — see the Sport determination above; use "unknown" only if truly undeterminable. Omit only the "/<league>" part if the league specifically can't be determined.)
Season: <e.g. 2026>                    (omit if not shown)
Week: <numeric week>                   (omit if not shown)
My Team: <the user's fantasy team name>
Opponent: <the opponent's fantasy team name>
My Score: <numeric current score>      (omit if not shown)
Opponent Score: <numeric current score> (omit if not shown)
My Projected: <numeric projected score> (omit if not shown)
Opponent Projected: <numeric projected score> (omit if not shown)
Starter: <player name>                 (one line per starter on the user's side, in the order shown; do NOT include bench players)
(repeat "Starter:" for every starter on the user's side)
Opponent Starter: <player name>        (one line per starter on the opponent's side, in the order shown; do NOT include bench players)
(repeat "Opponent Starter:" for every starter on the opponent's side)

=== FORMAT 3: DFS Lineup (daily fantasy sports, e.g. DraftKings DFS contest entry) ===

One screenshot may show one or more lineups/entries. Emit one block per lineup, back to back, each starting with the literal line:
DFS Lineup

Within each lineup block, in this order:
Platform: <e.g. DraftKings>
Sport: <sport>/<league>                (REQUIRED — see the Sport determination above; use "unknown" only if truly undeterminable. Omit only the "/<league>" part if the league specifically can't be determined.)
Slate: <slate name, e.g. "Main Slate"> (omit if not shown)
Slot: <roster slot label, e.g. QB, RB, FLEX, DST>
Player: <player name>
Salary: <numeric DFS salary, no "$" or "," characters>  (omit if not shown)
Points: <numeric points for this player>  (omit if not shown)
(repeat "Slot:" through "Points:" for every roster slot, in the order shown)
Contest: <contest name, e.g. "Millionaire Maker">  (omit if not shown)
Entry Fee: $<amount>                   (omit if not shown)
Prize: $<amount>                       (the potential/guaranteed prize for this entry; omit if not shown)
Current Points: <numeric total current points for the entry>  (omit if not shown)

=== General rules ===

Transcribe values exactly as shown on the screenshot. Do not invent or infer any value that isn't visibly present — omit the line instead, except for "Sport," which is required on every block per the determination described above. Every emitted block must use exactly one of the three formats above; never blend fields from different formats in the same block.`;

export interface ExtractScreenshotArgs {
  apiKey: string;
  imageBase64: string;
  mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  /** Override for tests / mocking. */
  fetchImpl?: typeof fetch;
}

interface AnthropicResponse {
  content: Array<{ type: string; text?: string }>;
}

/** Transcribes a bet-slip screenshot into "Bet Slip" text (see parse-slip-text.ts). */
export async function extractScreenshotText(args: ExtractScreenshotArgs): Promise<string> {
  const fetchImpl = args.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("extractScreenshotText: no global fetch available; pass fetchImpl.");
  }

  const body = {
    model: ANTHROPIC_MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: args.mediaType, data: args.imageBase64 },
          },
          { type: "text", text: "Transcribe this bet-slip screenshot." },
        ],
      },
    ],
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetchImpl(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": args.apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Screenshot extraction timed out. Please try again.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "<unreadable>");
    throw new Error(`Anthropic ${response.status} ${response.statusText}: ${text.slice(0, 400)}`);
  }

  const parsed = (await response.json()) as AnthropicResponse;
  const text = parsed.content?.[0]?.text ?? "";
  if (!text.trim()) {
    throw new Error("Anthropic returned no transcribed text.");
  }
  return text;
}
