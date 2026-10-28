import { describe, expect, it } from "vitest";
import { soleMatchingSide } from "./match-side";

const side = (name: string, abbreviation?: string) => ({ name, abbreviation });

/** The printed name resolved against one game's two sides, by name. */
function pick(printed: string, sides: { name: string; abbreviation?: string }[]) {
  return soleMatchingSide(printed, sides)?.name;
}

describe("soleMatchingSide", () => {
  const cfb = [side("Auburn Tigers", "AUB"), side("Georgia Bulldogs", "UGA")];

  it("accepts the program without the mascot", () => {
    // The whole point: books print "Auburn", providers print "Auburn Tigers".
    expect(pick("Auburn", cfb)).toBe("Auburn Tigers");
    expect(pick("Georgia", cfb)).toBe("Georgia Bulldogs");
  });

  it("accepts a name the side prefixes", () => {
    // The reverse case: the slip says "Bournemouth", ESPN says "AFC
    // Bournemouth", so the printed words can be a trailing run too.
    expect(pick("Bournemouth", [side("AFC Bournemouth"), side("Chelsea")])).toBe("AFC Bournemouth");
  });

  it("accepts the abbreviation", () => {
    expect(pick("AUB", cfb)).toBe("Auburn Tigers");
  });

  it("accepts the full name unchanged", () => {
    expect(pick("Auburn Tigers", cfb)).toBe("Auburn Tigers");
  });

  it("refuses a word from the middle of a name", () => {
    // A bare "State" sits inside both "Florida State Seminoles" and "Ohio
    // State Buckeyes", so matching it decides nothing.
    expect(pick("State", [side("Florida State Seminoles"), side("Clemson Tigers")])).toBeUndefined();
  });

  it("refuses a name that matches both sides", () => {
    // Two hits is not a near miss, it is a decision this cannot make — and
    // returning the first would be returning whichever the caller listed first.
    expect(pick("Tigers", [side("Auburn Tigers"), side("Clemson Tigers")])).toBeUndefined();
  });

  it("refuses a name that matches neither", () => {
    expect(pick("Cole Palmer", [side("Chelsea"), side("AFC Bournemouth")])).toBeUndefined();
  });

  it("does not match on a shared prefix", () => {
    // "fl" prefixes "florida", and this pair is a real one — Florida State
    // played the Gators the same week it played Miami.
    expect(pick("Miami FL", [side("Florida Gators"), side("Florida State Seminoles")])).toBeUndefined();
  });

  describe("state qualifiers", () => {
    it("drops a trailing state the side does not contradict", () => {
      expect(pick("Miami FL", [side("Miami Hurricanes"), side("Clemson Tigers")])).toBe("Miami Hurricanes");
    });

    it("refuses a state that contradicts the side's own", () => {
      expect(pick("Miami FL", [side("Miami (OH) RedHawks"), side("Akron Zips")])).toBeUndefined();
    });

    it("matches the state the side spells parenthetically", () => {
      // Needs no loosening — the parentheses normalise away, so this is already
      // a leading run. Pinned so the slip's own spelling stays covered.
      expect(pick("Miami OH", [side("Miami (OH) RedHawks"), side("Akron Zips")])).toBe("Miami (OH) RedHawks");
    });

    it("refuses a trailing word that is not a state", () => {
      expect(pick("Miami Dolphins", [side("Miami Hurricanes"), side("Clemson Tigers")])).toBeUndefined();
    });

    it("does not read a leading state code as the side's qualifier", () => {
      // "La Salle" opens with Louisiana's code without being qualified by it,
      // so a slip naming the school's actual state must not be refused on a
      // conflict between LA and PA.
      expect(pick("La Salle PA", [side("La Salle Explorers"), side("Fordham Rams")])).toBe("La Salle Explorers");
    });
  });
});
