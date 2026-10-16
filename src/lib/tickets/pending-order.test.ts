import { describe, expect, it } from "vitest";
import { applyPendingOrder } from "./pending-order";

interface Card {
  id: string;
  status: string;
}

const card = (id: string, status = "open"): Card => ({ id, status });
const ids = (items: Card[]) => items.map((c) => c.id);
const idOf = (c: Card) => c.id;

describe("applyPendingOrder", () => {
  it("leaves the server order alone when nothing has been dragged", () => {
    const items = [card("a"), card("b")];
    expect(applyPendingOrder(items, null, idOf)).toBe(items);
  });

  it("shows the dragged order while the server still reports the old one", () => {
    const items = [card("a"), card("b"), card("c")];
    expect(ids(applyPendingOrder(items, ["b", "a", "c"], idOf))).toEqual(["b", "a", "c"]);
  });

  it("stops overriding once the server reports the dragged order", () => {
    // What makes the override expire on its own: no effect, no timer, and no
    // stale order left to fight the next refresh.
    const items = [card("b"), card("a"), card("c")];
    expect(applyPendingOrder(items, ["b", "a", "c"], idOf)).toBe(items);
  });

  it("carries the server's card contents, not a copy taken at drag time", () => {
    // The bug this file exists for: a refresh updates every leg's status, so
    // reordering must never mean rendering remembered cards.
    const refreshed = [card("a", "won"), card("b", "lost")];
    expect(applyPendingOrder(refreshed, ["b", "a"], idOf)).toEqual([
      { id: "b", status: "lost" },
      { id: "a", status: "won" },
    ]);
  });

  it("drops a ticket the server no longer has", () => {
    // Deleting a card mid-drag-order must not resurrect it or crash on a
    // missing lookup.
    const items = [card("a"), card("c")];
    expect(ids(applyPendingOrder(items, ["b", "a", "c"], idOf))).toEqual(["a", "c"]);
  });

  it("puts a ticket added since the drag last, rather than losing it", () => {
    const items = [card("a"), card("b"), card("new")];
    expect(ids(applyPendingOrder(items, ["b", "a"], idOf))).toEqual(["b", "a", "new"]);
  });

  it("expires the override even when every dragged ticket is gone", () => {
    // Otherwise a drag followed by deleting those cards would pin the
    // survivors behind a comparison that can never be satisfied.
    const items = [card("x"), card("y")];
    expect(applyPendingOrder(items, ["a", "b"], idOf)).toBe(items);
  });

  it("treats an empty pending order as no override", () => {
    const items = [card("a")];
    expect(applyPendingOrder(items, [], idOf)).toBe(items);
  });
});
