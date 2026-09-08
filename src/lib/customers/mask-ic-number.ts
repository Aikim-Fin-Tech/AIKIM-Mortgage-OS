/**
 * Masks all but the last 4 alphanumeric characters of an IC/NRIC number,
 * e.g. "900101-01-1234" -> "XXXXXX-XX-1234". Separators (dashes, spaces)
 * are left untouched. ic_number must always be masked before it reaches
 * the browser — see docs/DATABASE.md ("ic_number always masked in the
 * UI") and CLAUDE.md's rule against logging raw NRIC/IC numbers.
 *
 * Extracted from loan-case-details.ts so every screen that displays a
 * customer's IC number (loan case detail, Customers list) applies the
 * exact same masking rule instead of each keeping its own copy.
 */
export function maskIcNumber(ic: string): string {
  const visibleCount = 4;
  const chars = ic.split("");
  let visible = 0;
  for (let i = chars.length - 1; i >= 0; i--) {
    if (/[0-9a-zA-Z]/.test(chars[i])) {
      if (visible < visibleCount) {
        visible++;
        continue;
      }
      chars[i] = "X";
    }
  }
  return chars.join("");
}
