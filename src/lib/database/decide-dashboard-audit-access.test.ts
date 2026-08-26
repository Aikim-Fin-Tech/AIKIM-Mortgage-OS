import { describe, expect, it } from "vitest";
import { shouldFetchDashboardAuditLogs } from "./decide-dashboard-audit-access";

describe("shouldFetchDashboardAuditLogs", () => {
  it("returns true for super_admin", () => {
    expect(shouldFetchDashboardAuditLogs("super_admin")).toBe(true);
  });

  it("returns false for banker — the role that surfaced the production warning", () => {
    expect(shouldFetchDashboardAuditLogs("banker")).toBe(false);
  });

  it("returns false for property_agent", () => {
    expect(shouldFetchDashboardAuditLogs("property_agent")).toBe(false);
  });

  it("returns false for mortgage_outsource_agent", () => {
    expect(shouldFetchDashboardAuditLogs("mortgage_outsource_agent")).toBe(false);
  });

  it("returns false for customer", () => {
    expect(shouldFetchDashboardAuditLogs("customer")).toBe(false);
  });

  it("returns false when role is null (no session / lookup failed)", () => {
    expect(shouldFetchDashboardAuditLogs(null)).toBe(false);
  });

  it("is case-sensitive — does not treat 'Super_Admin' or 'SUPER_ADMIN' as a match", () => {
    expect(shouldFetchDashboardAuditLogs("Super_Admin")).toBe(false);
    expect(shouldFetchDashboardAuditLogs("SUPER_ADMIN")).toBe(false);
  });

  it("does not match a role value that merely contains 'super_admin' as a substring", () => {
    expect(shouldFetchDashboardAuditLogs("super_admin_2")).toBe(false);
  });
});
