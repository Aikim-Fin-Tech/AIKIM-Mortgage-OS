import { describe, expect, it } from "vitest";
import { decideCustomerAuthorizedForBanker } from "./decide-customer-authorized-for-banker";

describe("decideCustomerAuthorizedForBanker", () => {
  it("denies access for a Banker with zero cases", () => {
    expect(decideCustomerAuthorizedForBanker("b1", "c1", [])).toBe(false);
  });

  it("authorizes a customer linked via the Banker's own assigned case", () => {
    const links = [{ customerId: "c1", bankerId: "b1" }];
    expect(decideCustomerAuthorizedForBanker("b1", "c1", links)).toBe(true);
  });

  it("authorizes correctly even with duplicate case rows for the same customer", () => {
    const links = [
      { customerId: "c1", bankerId: "b1" },
      { customerId: "c1", bankerId: "b1" },
    ];
    expect(decideCustomerAuthorizedForBanker("b1", "c1", links)).toBe(true);
  });

  it("denies access to a customer linked only to a different Banker's case", () => {
    const links = [{ customerId: "c1", bankerId: "b2" }];
    expect(decideCustomerAuthorizedForBanker("b1", "c1", links)).toBe(false);
  });

  it("denies access for an unlinked Banker (no bankers row), regardless of case data", () => {
    const links = [{ customerId: "c1", bankerId: "b1" }];
    expect(decideCustomerAuthorizedForBanker(null, "c1", links)).toBe(false);
  });
});
