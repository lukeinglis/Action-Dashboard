import { describe, expect, it } from "vitest";
import { allLinkedEventsFinal, fantasyDfsSection } from "./active-fantasy-dfs";

const TZ = "America/New_York";

describe("fantasyDfsSection", () => {
  it("keeps upcoming/live matchups and entries in the active section regardless of time", () => {
    const now = new Date("2026-09-21T10:00:00Z");
    expect(fantasyDfsSection("upcoming", null, now, TZ, 4)).toBe("active");
    expect(fantasyDfsSection("live", null, now, TZ, 4)).toBe("active");
  });

  it("keeps a final matchup/entry in the settled section before the next rollover after finalizedAt", () => {
    // finalizedAt 2026-09-21T10:00Z (6am ET); next rollover (4am ET) is 2026-09-22T08:00Z.
    const finalizedAt = "2026-09-21T10:00:00Z";
    const now = new Date("2026-09-22T06:00:00Z");
    expect(fantasyDfsSection("final", finalizedAt, now, TZ, 4)).toBe("settled");
  });

  it("drops a final matchup/entry from the dashboard after the first rollover following finalizedAt", () => {
    const finalizedAt = "2026-09-21T10:00:00Z";
    const now = new Date("2026-09-22T09:00:00Z");
    expect(fantasyDfsSection("final", finalizedAt, now, TZ, 4)).toBe(null);
  });

  it("keeps a final matchup/entry visible if finalizedAt is not yet recorded", () => {
    const now = new Date("2026-09-21T10:00:00Z");
    expect(fantasyDfsSection("final", null, now, TZ, 4)).toBe("settled");
  });
});

describe("allLinkedEventsFinal", () => {
  it("is true only when every linked Event is final", () => {
    expect(allLinkedEventsFinal(["final", "final"])).toBe(true);
    expect(allLinkedEventsFinal(["final", "in_progress"])).toBe(false);
  });

  it("is false when there are no linked Events (never auto-prompts with nothing linked)", () => {
    expect(allLinkedEventsFinal([])).toBe(false);
  });

  it("treats a missing/unknown status as not final", () => {
    expect(allLinkedEventsFinal(["final", null, undefined])).toBe(false);
  });
});
