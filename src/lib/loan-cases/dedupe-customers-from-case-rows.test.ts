import { describe, expect, it } from "vitest";
import { dedupeCustomersFromCaseRows } from "./dedupe-customers-from-case-rows";

describe("dedupeCustomersFromCaseRows", () => {
  it("returns zero options for zero case rows — the Banker-with-no-cases regression", () => {
    expect(dedupeCustomersFromCaseRows([])).toEqual([]);
  });

  it("dedupes the same customer appearing on multiple cases", () => {
    const result = dedupeCustomersFromCaseRows([
      { customers: { id: "c1", full_name: "Ahmad Firdaus", phone: "+60 12-345 6781" } },
      { customers: { id: "c1", full_name: "Ahmad Firdaus", phone: "+60 12-345 6781" } },
    ]);

    expect(result).toEqual([{ id: "c1", fullName: "Ahmad Firdaus", phone: "+60 12-345 6781" }]);
  });

  it("sorts distinct customers alphabetically by full name", () => {
    const result = dedupeCustomersFromCaseRows([
      { customers: { id: "c2", full_name: "Raj Kumar", phone: null } },
      { customers: { id: "c1", full_name: "Ahmad Firdaus", phone: null } },
    ]);

    expect(result.map((c) => c.fullName)).toEqual(["Ahmad Firdaus", "Raj Kumar"]);
  });

  it("skips rows with no embedded customer", () => {
    expect(dedupeCustomersFromCaseRows([{ customers: null }])).toEqual([]);
  });
});
