import { describe, expect, it } from "vitest";
import { decideEffectiveBankerId } from "./decide-effective-banker-id";

describe("decideEffectiveBankerId", () => {
  it("forces a Banker's own banker_id, ignoring a different requested id", () => {
    // The core regression: a Banker submitting another real Banker's UUID
    // must never result in that UUID being used.
    expect(decideEffectiveBankerId("banker", "own-id", "someone-elses-id")).toBe("own-id");
  });

  it("self-assigns a Banker even when no bankerId was requested at all", () => {
    expect(decideEffectiveBankerId("banker", "own-id", null)).toBe("own-id");
  });

  it("resolves to null (unassigned) for a Banker with no linked bankers row", () => {
    expect(decideEffectiveBankerId("banker", null, "someone-elses-id")).toBeNull();
  });

  it("lets Super Admin assign to any requested banker id", () => {
    expect(decideEffectiveBankerId("super_admin", null, "any-real-banker-id")).toBe("any-real-banker-id");
  });

  it("lets Super Admin leave a case unassigned", () => {
    expect(decideEffectiveBankerId("super_admin", null, null)).toBeNull();
  });

  it("passes through the requested id unchanged for other staff roles", () => {
    expect(decideEffectiveBankerId("property_agent", null, "any-real-banker-id")).toBe("any-real-banker-id");
    expect(decideEffectiveBankerId("mortgage_outsource_agent", null, "any-real-banker-id")).toBe(
      "any-real-banker-id",
    );
  });
});
