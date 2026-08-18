/**
 * Masks NRIC/account-number-like substrings in a log/error string before it
 * is ever passed to `console.error`/`console.log`. This is a new, local
 * helper — not a shared refactor of the existing private `maskIcNumber` in
 * `src/lib/database/loan-case-details.ts` — but follows the same masking
 * convention already established there: keep the last 4 alphanumeric
 * characters visible, replace every alphanumeric character before them with
 * "X" (non-alphanumeric characters, e.g. dashes/spaces, are left as-is).
 *
 * screen-document.ts must never log a raw extracted NRIC/account number —
 * prefer logging field names and error codes only; use this helper for the
 * rare case a log line needs to reference an extracted value at all.
 */
function maskAlphanumericTail(value: string): string {
  const visibleCount = 4;
  const chars = value.split("");
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

/**
 * Finds NRIC-like (12 digits, optionally dashed as 6-2-4) and generic
 * long-digit-run (8+ digits, e.g. bank/EPF account numbers) substrings
 * within `message` and masks each one using the same tail-visible
 * convention as `maskIcNumber`. Everything else in `message` is left
 * untouched.
 */
export function maskForLog(message: string): string {
  return message.replace(/\d{6}-?\d{2}-?\d{4}|\d{8,}/g, (match) => maskAlphanumericTail(match));
}
