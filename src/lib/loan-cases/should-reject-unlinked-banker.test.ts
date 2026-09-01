import { describe, expect, it } from "vitest";
import { shouldRejectUnlinkedBanker } from "./should-reject-unlinked-banker";

describe("shouldRejectUnlinkedBanker", () => {
  it("rejects a Banker with no linked bankers row", () => {
    expect(shouldRejectUnlinkedBanker("banker", null)).toBe(true);
  });

  it("does not reject a Banker with a linked bankers row", () => {
    expect(shouldRejectUnlinkedBanker("banker", "own-id")).toBe(false);
  });

  it("never rejects a non-Banker role, even with no linked bankers row", () => {
    expect(shouldRejectUnlinkedBanker("super_admin", null)).toBe(false);
    expect(shouldRejectUnlinkedBanker("property_agent", null)).toBe(false);
    expect(shouldRejectUnlinkedBanker("mortgage_outsource_agent", null)).toBe(false);
  });
});
