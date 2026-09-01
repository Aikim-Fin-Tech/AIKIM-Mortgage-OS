import { describe, expect, it } from "vitest";
import { decideBankerOptionsForRole } from "./decide-banker-options";
import type { BankerOption } from "./new-loan-case-types";

const platformWideBankers: BankerOption[] = [
  { id: "b1", fullName: "Sarah Lim", bankName: "Maybank" },
  { id: "b2", fullName: "Daniel Tan", bankName: "CIMB Bank" },
  { id: "b3", fullName: "Pilot Test Banker", bankName: "AIKIM Test Bank" },
];

describe("decideBankerOptionsForRole", () => {
  it("gives a Banker only their own record, never other real Bankers' data", () => {
    const own: BankerOption = { id: "b3", fullName: "Pilot Test Banker", bankName: "AIKIM Test Bank" };
    const result = decideBankerOptionsForRole("banker", own, platformWideBankers);

    expect(result).toEqual([own]);
    // Explicitly assert no other Banker's id/name/bank leaked through.
    expect(result.some((b) => b.id === "b1" || b.id === "b2")).toBe(false);
  });

  it("gives a Banker with no linked bankers row an empty list, not the platform-wide list", () => {
    expect(decideBankerOptionsForRole("banker", null, platformWideBankers)).toEqual([]);
  });

  it("gives Super Admin the full platform-wide list, unchanged", () => {
    expect(decideBankerOptionsForRole("super_admin", null, platformWideBankers)).toEqual(platformWideBankers);
  });

  it("gives other staff roles the full platform-wide list, unchanged", () => {
    expect(decideBankerOptionsForRole("property_agent", null, platformWideBankers)).toEqual(platformWideBankers);
  });
});
