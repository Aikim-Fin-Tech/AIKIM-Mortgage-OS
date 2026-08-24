import { describe, expect, it } from "vitest";
import { buildForgotPasswordResult, NEUTRAL_RESET_MESSAGE } from "./build-forgot-password-result";

describe("buildForgotPasswordResult", () => {
  it("always returns the neutral message and submitted:true", () => {
    expect(buildForgotPasswordResult()).toEqual({ message: NEUTRAL_RESET_MESSAGE, submitted: true });
  });

  it("is deterministic across repeated calls — nothing to branch on, by design", () => {
    expect(buildForgotPasswordResult()).toEqual(buildForgotPasswordResult());
  });

  it("never phrases the message in a way that reveals account existence", () => {
    const result = buildForgotPasswordResult();
    expect(result.message).not.toMatch(/not found|no account|no such|invalid email|doesn't exist/i);
  });
});
