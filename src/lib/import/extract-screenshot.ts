// Screenshot -> text extraction (docs/PRD.md section 30, "Extraction").
//
// Uses raw fetch instead of @anthropic-ai/sdk, same as Reel-Palate's
// src/lib/recommend/anthropic.ts — one endpoint, one JSON shape, no need
// for the SDK's transitive deps.
//
// Claude is asked to transcribe the screenshot directly into the "Bet
// Slip" text format that parseSlipText expects, so the screenshot and
// paste-text inputs converge on the same deterministic parser
// immediately after extraction — extraction only has to get the layout
// and field values right, not any downstream parsing logic.

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = "claude-haiku-4-5";
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_OUTPUT_TOKENS = 4_000;
const REQUEST_TIMEOUT_MS = 30_000;

const SYSTEM_PROMPT = `You transcribe sportsbook bet-slip screenshots into a strict text format. Output ONLY the transcribed text — no commentary, no markdown fences.

One screenshot may show one or more bet slips ("tickets"). Emit one block per ticket, back to back, each starting with a line of the exact form:
Bet Slip #<ticket id>
(Omit "#<ticket id>" — just "Bet Slip" alone — if no ticket/confirmation ID is visible.)

Within each ticket block, in this order:
Type: Straight | <N>-Leg Parlay | <N>-Leg Same Game Parlay
Bonus Bet                              (only include this literal line if the slip is marked as a bonus/free bet)
Leg 1:
Market: <one of: moneyline, spread, game_total, team_total, anytime_touchdown, passing_yards, passing_touchdowns, rushing_yards, receiving_yards, receptions, hits, runs, rbis, home_runs, strikeouts, winner, top_finish, season_future, matchup, custom>
Selection: <the selected outcome as shown, e.g. "Kansas City Chiefs" or "Patrick Mahomes Over 275.5">
Subject: <the canonical player/team name the leg is about, when it differs from Selection — required for player-prop and team_total markets, optional otherwise>
Opponent Subject: <the opposing player/team name, ONLY for "matchup" markets with no single game/Event, e.g. a cross-game player-vs-player bet>
Event: <Away Team> @ <Home Team>       (omit this line entirely if no single game/matchup is shown, e.g. season futures or cross-game matchups)
Sport: <sport>/<league>                (e.g. "football/NFL"; omit "/<league>" if not shown)
Start: <ISO 8601 UTC timestamp>        (omit if no date/time is shown)
Line: <numeric line>                   (omit if not applicable)
OverUnder: over | under | yes | no     (omit if not applicable)
Odds: <american odds, e.g. -150 or +120>
(repeat "Leg N:" through "Odds:" for each additional leg, in the order shown)
Wager: $<amount>
To Win: $<amount>
Payout: $<amount>
Placed: <ISO 8601 UTC timestamp>       (omit if not shown)
Promo: <free-text promo name, e.g. "Profit Boost">  (omit if not shown)

Transcribe values exactly as shown on the screenshot. Do not invent or infer any value that isn't visibly present — omit the line instead.`;

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
