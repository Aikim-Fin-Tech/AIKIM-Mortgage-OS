import { describe, expect, it } from "vitest";
import { deriveBankerFilterOptions } from "./derive-banker-filter-options";

describe("deriveBankerFilterOptions", () => {
  it("returns zero options for zero visible cases — the exact Banker-with-no-cases regression", () => {
    // Before this fix, the filter always showed a hardcoded 5-name list
    // (Sarah Lim, Daniel Tan, Amir Rahman, Priya Nathan, Wong Mei Ling)
    // regardless of how many cases were actually visible.
    expect(deriveBankerFilterOptions([])).toEqual([]);
  });

  it("derives options only from the bankers actually present in the visible cases", () => {
    const result = deriveBankerFilterOptions([
      { banker: "Pilot Test Banker" },
      { banker: "Pilot Test Banker" },
      { banker: "Wong Mei Ling" },
    ]);

    expect(result).toEqual(["Pilot Test Banker", "Wong Mei Ling"]);
  });

  it("never fabricates a name absent from the visible cases", () => {
    const result = deriveBankerFilterOptions([{ banker: "Pilot Test Banker" }]);

    expect(result).not.toContain("Sarah Lim");
    expect(result).not.toContain("Daniel Tan");
    expect(result).not.toContain("Amir Rahman");
    expect(result).not.toContain("Priya Nathan");
  });

  it("includes Unassigned as a plain derived value when present", () => {
    expect(deriveBankerFilterOptions([{ banker: "Unassigned" }])).toEqual(["Unassigned"]);
  });
});
