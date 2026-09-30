// Fractional (LexoRank-style) sort keys for drag-and-drop reorder. Ticket
// is typed with sortKey: string (docs/PRD.md section 25) specifically so a
// card can move between two neighbors by writing exactly one row: no
// renumbering of the rest of the list.
//
// Keys are base-36 strings that compare correctly with plain `<`/`>`. Given
// neighbors lower < upper, sortKeyBetween finds a string that sorts
// strictly between them.

const DIGITS = "0123456789abcdefghijklmnopqrstuvwxyz";

function midpoint(lower: string, upper: string | null): string {
  if (upper != null && lower >= upper) {
    throw new Error(`sortKeyBetween: "${lower}" is not before "${upper}"`);
  }

  if (upper) {
    let n = 0;
    while ((lower[n] ?? DIGITS[0]) === upper[n]) n++;
    if (n > 0) {
      return upper.slice(0, n) + midpoint(lower.slice(n), upper.slice(n));
    }
  }

  const digitLower = lower ? DIGITS.indexOf(lower[0]) : 0;
  const digitUpper = upper != null ? DIGITS.indexOf(upper[0]) : DIGITS.length;

  if (digitUpper - digitLower > 1) {
    const mid = Math.round((digitLower + digitUpper) / 2);
    return DIGITS[mid];
  }

  if (upper && upper.length > 1) {
    return upper.slice(0, 1);
  }

  return DIGITS[digitLower] + midpoint(lower.slice(1), null);
}

/** A key that sorts strictly between `lower` and `upper`. Either bound may be null (no bound). */
export function sortKeyBetween(lower: string | null, upper: string | null): string {
  return midpoint(lower ?? "", upper);
}

/** A key that sorts after `key` (or a starting key, if `key` is null). */
export function sortKeyAfter(key: string | null): string {
  return sortKeyBetween(key, null);
}

/** A key that sorts before `key` (or a starting key, if `key` is null). */
export function sortKeyBefore(key: string | null): string {
  return sortKeyBetween(null, key);
}
