import { describe, expect, it } from "vitest";
import { maskIcNumber } from "./mask-ic-number";

describe("maskIcNumber", () => {
  it("masks all but the last 4 alphanumeric characters", () => {
    expect(maskIcNumber("900101-01-1234")).toBe("XXXXXX-XX-1234");
  });

  it("leaves separator characters untouched", () => {
    expect(maskIcNumber("900101-01-1234")).toContain("-");
  });

  it("does not mask a value with 4 or fewer alphanumeric characters", () => {
    expect(maskIcNumber("1234")).toBe("1234");
    expect(maskIcNumber("12")).toBe("12");
  });

  it("never returns the raw digits beyond the last 4", () => {
    const masked = maskIcNumber("A1234567");
    expect(masked).toBe("XXXX4567");
  });
});
