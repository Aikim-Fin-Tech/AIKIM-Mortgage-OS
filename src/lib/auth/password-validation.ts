/**
 * Pure, no I/O — shared password-strength rule for both the recovery
 * "set new password" flow (src/app/reset-password) and the My Profile
 * "Change Password" section (src/app/profile). Kept in one place so the two
 * flows can never silently drift apart on what counts as a strong-enough
 * password.
 *
 * Deliberately basic (per scope): minimum length + at least one letter and
 * one digit. Not a full entropy/zxcvbn-style check — this is the "basic
 * password-strength validation" the task asked for, not a security-research
 * exercise.
 */

export const MIN_PASSWORD_LENGTH = 8;

export function validatePasswordStrength(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (!/[a-zA-Z]/.test(password)) {
    return "Password must include at least one letter.";
  }
  if (!/[0-9]/.test(password)) {
    return "Password must include at least one number.";
  }
  return null;
}

export function validatePasswordConfirmation(password: string, confirmPassword: string): string | null {
  if (password !== confirmPassword) {
    return "Passwords do not match.";
  }
  return null;
}
