// The "is this leg winning" indicator. See docs/PRD.md §26.1.
//
// Deliberately a dot and not a word. A ticket card shows several legs at a
// glance and the user is scanning, not reading — colour carries the state and
// the tooltip carries the arithmetic ("covering by 3.5"). An unknown state
// renders nothing at all rather than a grey dot, so a card of player props does
// not look like a card of losing bets.
//
// Colour is never the only channel: the title attribute spells the state out,
// which is also what a screen reader reads.

import type { LiveLegState } from "@/lib/types/domain";

const DOT_CLASS: Record<Exclude<LiveLegState, "unknown">, string> = {
  winning: "bg-emerald-400",
  losing: "bg-rose-400",
  even: "bg-neutral-500",
};

const LABEL: Record<Exclude<LiveLegState, "unknown">, string> = {
  winning: "Winning",
  losing: "Losing",
  even: "Level",
};

export function LiveStateDot({
  state,
  detail,
}: {
  state: LiveLegState;
  detail?: string | null;
}) {
  // Nothing known: say nothing. §26.1's live state is a read on a scoreline, and
  // plenty of legitimate legs (props, futures) have no scoreline to read.
  if (state === "unknown") return null;

  const label = detail ? `${LABEL[state]} — ${detail}` : LABEL[state];

  return (
    <span
      className={`inline-block size-1.5 shrink-0 rounded-full ${DOT_CLASS[state]}`}
      title={label}
      role="img"
      aria-label={label}
    />
  );
}
