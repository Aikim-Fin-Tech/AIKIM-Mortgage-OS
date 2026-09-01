import { describe, expect, it } from "vitest";
import { decideCustomersSelectScope } from "./decide-customers-select-scope";

describe("decideCustomersSelectScope", () => {
  it("narrows a Banker to the case-scoped branch", () => {
    expect(decideCustomersSelectScope("banker")).toBe("case-scoped-to-banker");
  });

  it("leaves Super Admin on the original, unmodified branch", () => {
    expect(decideCustomersSelectScope("super_admin")).toBe("original-staff-or-self-check");
  });

  it("leaves Property Agent on the original, unmodified branch", () => {
    expect(decideCustomersSelectScope("property_agent")).toBe("original-staff-or-self-check");
  });

  it("leaves Mortgage Outsource Agent on the original, unmodified branch", () => {
    expect(decideCustomersSelectScope("mortgage_outsource_agent")).toBe("original-staff-or-self-check");
  });

  it("leaves a customer's own self-access on the original, unmodified branch", () => {
    expect(decideCustomersSelectScope("customer")).toBe("original-staff-or-self-check");
  });

  it("falls through to the original branch for an unresolved role, matching the SQL CASE's ELSE", () => {
    expect(decideCustomersSelectScope(null)).toBe("original-staff-or-self-check");
  });
});
