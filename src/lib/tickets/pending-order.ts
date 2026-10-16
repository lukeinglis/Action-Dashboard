// Holding a drag's new order on screen until the server confirms it. See
// docs/PRD.md §5.3.
//
// A drag has to look instant, but the order it produces is persisted as a
// `sortKey` on the server (§5.3), and the round trip plus revalidation takes a
// moment. The naive fix — copying the list into local state on mount — makes
// the card list stop tracking the server entirely, so a refresh that changes
// every leg's status renders the old statuses until a full page reload.
//
// So local state holds only the *order*, as ids, and never the cards
// themselves. Card contents always come straight from the server. Once the
// server's own order agrees with the pending one, the override stops applying
// on its own and there is nothing to clean up.

/**
 * Reorders `items` to match `pendingIds`, the order a drag just produced.
 *
 * Returns `items` untouched when there is no pending drag, or when the server
 * has already caught up — which is what lets the override expire without a
 * timer or an effect. Items the pending order has never seen (a Ticket created
 * since the drag) go last; they land in their real position as soon as the
 * override expires.
 */
export function applyPendingOrder<T>(
  items: T[],
  pendingIds: string[] | null,
  idOf: (item: T) => string,
): T[] {
  if (!pendingIds || pendingIds.length === 0) return items;

  const pending = new Set(pendingIds);
  const byId = new Map(items.map((item) => [idOf(item), item]));

  // Only the ids the drag actually moved are compared. A Ticket that has since
  // appeared or been deleted must not keep the override alive forever.
  const known = pendingIds.filter((id) => byId.has(id));
  const onServer = items.map(idOf).filter((id) => pending.has(id));
  if (known.length === onServer.length && known.every((id, i) => id === onServer[i])) {
    return items;
  }

  const ordered = known.map((id) => byId.get(id) as T);
  return [...ordered, ...items.filter((item) => !pending.has(idOf(item)))];
}
