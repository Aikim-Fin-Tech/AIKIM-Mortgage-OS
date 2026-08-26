import { describe, expect, it } from "vitest";
import { decideRecoveryOtpVerification } from "./decide-recovery-otp-verification";

describe("decideRecoveryOtpVerification", () => {
  it("accepts a valid token_hash with type=recovery", () => {
    expect(decideRecoveryOtpVerification("abc123", "recovery")).toEqual({ shouldVerify: true, tokenHash: "abc123" });
  });

  it("rejects a missing type", () => {
    expect(decideRecoveryOtpVerification("abc123", null)).toEqual({ shouldVerify: false });
  });

  it("rejects a missing token_hash", () => {
    expect(decideRecoveryOtpVerification(null, "recovery")).toEqual({ shouldVerify: false });
  });

  it("rejects both missing", () => {
    expect(decideRecoveryOtpVerification(null, null)).toEqual({ shouldVerify: false });
  });

  it("rejects type=signup", () => {
    expect(decideRecoveryOtpVerification("abc123", "signup")).toEqual({ shouldVerify: false });
  });

  it("rejects type=invite", () => {
    expect(decideRecoveryOtpVerification("abc123", "invite")).toEqual({ shouldVerify: false });
  });

  it("rejects type=magiclink", () => {
    expect(decideRecoveryOtpVerification("abc123", "magiclink")).toEqual({ shouldVerify: false });
  });

  it("rejects type=email_change", () => {
    expect(decideRecoveryOtpVerification("abc123", "email_change")).toEqual({ shouldVerify: false });
  });

  it("rejects an empty-string token_hash (malformed) even with a valid type", () => {
    expect(decideRecoveryOtpVerification("", "recovery")).toEqual({ shouldVerify: false });
  });

  it("rejects an empty-string type (malformed) even with a token_hash present", () => {
    expect(decideRecoveryOtpVerification("abc123", "")).toEqual({ shouldVerify: false });
  });

  it("rejects a type value that merely contains 'recovery' as a substring, not an exact match", () => {
    expect(decideRecoveryOtpVerification("abc123", "recovery2")).toEqual({ shouldVerify: false });
    expect(decideRecoveryOtpVerification("abc123", "RECOVERY")).toEqual({ shouldVerify: false });
  });
});
