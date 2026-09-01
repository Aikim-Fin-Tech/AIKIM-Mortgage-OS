import { describe, expect, it } from "vitest";
import { decideBankersSelectScope } from "./decide-bankers-select-scope";

describe("decideBankersSelectScope", () => {
  it("narrows a Banker to the self-only branch", () => {
    expect(decideBankersSelectScope("banker")).toBe("self-only");
  });

  it("leaves Super Admin on the original, unmodified branch", () => {
    expect(decideBankersSelectScope("super_admin")).toBe("original-authenticated-check");
  });

  it("leaves Property Agent on the original, unmodified branch — not narrowed or inferred", () => {
    expect(decideBankersSelectScope("property_agent")).toBe("original-authenticated-check");
  });

  it("leaves Mortgage Outsource Agent on the original, unmodified branch — not narrowed or inferred", () => {
    expect(decideBankersSelectScope("mortgage_outsource_agent")).toBe("original-authenticated-check");
  });

  it("leaves the customer role on the original, unmodified branch", () => {
    expect(decideBankersSelectScope("customer")).toBe("original-authenticated-check");
  });

  it("falls through to the original branch for an unresolved role, matching the SQL CASE's ELSE", () => {
    expect(decideBankersSelectScope(null)).toBe("original-authenticated-check");
  });
});
