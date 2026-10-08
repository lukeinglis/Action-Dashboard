import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createFakeSupabase } from "@/lib/testing/fake-supabase";
import { ensureParticipant } from "./ensure";

const USER = "user-1";

function seed(participants: Record<string, unknown>[] = []) {
  return createFakeSupabase({ participants });
}

function run(
  fake: ReturnType<typeof createFakeSupabase>,
  input: { name: string; sport?: string; league?: string },
) {
  return ensureParticipant(fake as unknown as SupabaseClient, USER, {
    name: input.name,
    sport: input.sport ?? "football",
    league: input.league,
  });
}

describe("ensureParticipant", () => {
  it("creates the player a prop was imported for", async () => {
    const fake = seed();
    const participant = await run(fake, { name: "CeeDee Lamb", league: "NFL" });

    expect(participant.name).toBe("CeeDee Lamb");
    expect(fake.tables.participants).toHaveLength(1);
    expect(fake.tables.participants[0]).toMatchObject({
      user_id: USER,
      type: "player",
      sport: "football",
      league: "NFL",
      name: "CeeDee Lamb",
    });
  });

  it("leaves the team unset rather than guessing which side the player is on", async () => {
    // The stats matcher breaks surname ties by team, so a wrong team would
    // break the very match this is meant to enable.
    const fake = seed();
    await run(fake, { name: "CeeDee Lamb" });
    expect(fake.tables.participants[0].team_id).toBeNull();
  });

  it("reuses the existing player instead of creating a second one", async () => {
    const fake = seed([
      { id: "p1", user_id: USER, type: "player", sport: "football", name: "CeeDee Lamb" },
    ]);
    const participant = await run(fake, { name: "CeeDee Lamb" });

    expect(participant.id).toBe("p1");
    expect(fake.tables.participants).toHaveLength(1);
  });

  it("matches the same spelling rules the review screen matched on", async () => {
    // Anything looser here would create a duplicate the matcher then cannot
    // choose between on the next import.
    const fake = seed([
      { id: "p1", user_id: USER, type: "player", sport: "football", name: "CeeDee Lamb" },
    ]);
    expect((await run(fake, { name: "  ceedee  lamb " })).id).toBe("p1");
    expect(fake.tables.participants).toHaveLength(1);
  });

  it("never reuses another user's player", async () => {
    const fake = seed([
      { id: "p1", user_id: "user-2", type: "player", sport: "football", name: "CeeDee Lamb" },
    ]);
    const participant = await run(fake, { name: "CeeDee Lamb" });

    expect(participant.id).not.toBe("p1");
    expect(fake.tables.participants).toHaveLength(2);
  });

  it("does not confuse two sports' players who share a name", async () => {
    const fake = seed([
      { id: "p1", user_id: USER, type: "player", sport: "baseball", name: "Will Smith" },
    ]);
    const participant = await run(fake, { name: "Will Smith", sport: "football" });

    expect(participant.id).not.toBe("p1");
    expect(fake.tables.participants).toHaveLength(2);
  });

  it("reuses a player whose sport extraction could not determine", async () => {
    // Refusing to match would duplicate a player the user already has, just
    // because the screenshot never printed the word "football".
    const fake = seed([{ id: "p1", user_id: USER, type: "player", sport: "", name: "CeeDee Lamb" }]);
    expect((await run(fake, { name: "CeeDee Lamb", sport: "football" })).id).toBe("p1");

    const unknownSport = seed([
      { id: "p1", user_id: USER, type: "player", sport: "football", name: "CeeDee Lamb" },
    ]);
    expect((await run(unknownSport, { name: "CeeDee Lamb", sport: "" })).id).toBe("p1");
  });

  it("refuses a blank name rather than creating an unnamed player", async () => {
    const fake = seed();
    await expect(run(fake, { name: "   " })).rejects.toThrow(/name is required/);
    expect(fake.tables.participants).toHaveLength(0);
  });
});
