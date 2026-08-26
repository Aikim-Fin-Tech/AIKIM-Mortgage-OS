import { describe, expect, it } from "vitest";
import { validatePasswordConfirmation, validatePasswordStrength } from "./password-validation";

describe("validatePasswordStrength", () => {
  it("rejects passwords shorter than 8 characters", () => {
    expect(validatePasswordStrength("abc123")).toMatch(/at least 8 characters/);
  });

  it("rejects a password with no letters", () => {
    expect(validatePasswordStrength("12345678")).toMatch(/at least one letter/);
  });

  it("rejects a password with no digits", () => {
    expect(validatePasswordStrength("abcdefgh")).toMatch(/at least one number/);
  });

  it("accepts a password meeting all 3 rules", () => {
    expect(validatePasswordStrength("abcd1234")).toBeNull();
  });

  it("accepts a longer, mixed-case password with digits", () => {
    expect(validatePasswordStrength("Sup3rSecurePassw0rd")).toBeNull();
  });
});

describe("validatePasswordConfirmation", () => {
  it("rejects when the two values differ", () => {
    expect(validatePasswordConfirmation("abcd1234", "abcd1235")).toBe("Passwords do not match.");
  });

  it("accepts when the two values are identical", () => {
    expect(validatePasswordConfirmation("abcd1234", "abcd1234")).toBeNull();
  });

  it("treats empty-vs-empty as matching (the strength check catches emptiness separately)", () => {
    expect(validatePasswordConfirmation("", "")).toBeNull();
  });
});
