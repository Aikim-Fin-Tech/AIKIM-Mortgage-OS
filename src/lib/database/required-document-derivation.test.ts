import { describe, expect, it } from "vitest";
import {
  asOcrDocumentKind,
  buildMandatoryLookupKey,
  evaluatePeriodCoverage,
  expectedCompletedMonthKeys,
  isPeriodBasedDocumentKind,
  isValidRequiredMonths,
  latestSelectableMonthKey,
  resolveIsMandatory,
} from "./required-document-derivation";

/**
 * Unit tests for the pure is_mandatory lookup behind getRequiredDocuments —
 * no Supabase client, just the plain key-building/lookup logic. Covers the
 * "never silently default to true or false" requirement directly.
 */

describe("buildMandatoryLookupKey", () => {
  it("returns null when mortgageRuleId is null", () => {
    expect(buildMandatoryLookupKey(null, "doc-type-1")).toBeNull();
  });

  it("combines rule id and document type id into a stable composite key", () => {
    expect(buildMandatoryLookupKey("rule-1", "doc-type-1")).toBe("rule-1:doc-type-1");
  });

  it("produces distinct keys for the same document type under different rules", () => {
    const keyA = buildMandatoryLookupKey("rule-a", "doc-type-1");
    const keyB = buildMandatoryLookupKey("rule-b", "doc-type-1");
    expect(keyA).not.toBe(keyB);
  });
});

describe("resolveIsMandatory", () => {
  it("returns true when the rule-document line item is found and is_mandatory is true", () => {
    const map = new Map([["rule-1:doc-type-1", true]]);
    expect(resolveIsMandatory("rule-1", "doc-type-1", map)).toBe(true);
  });

  it("returns false when the rule-document line item is found and is_mandatory is false", () => {
    const map = new Map([["rule-1:doc-type-1", false]]);
    expect(resolveIsMandatory("rule-1", "doc-type-1", map)).toBe(false);
  });

  it("returns null, not false, when mortgageRuleId is null (no rule was ever matched)", () => {
    const map = new Map([["rule-1:doc-type-1", true]]);
    expect(resolveIsMandatory(null, "doc-type-1", map)).toBeNull();
  });

  it("returns null, not a guessed default, when the rule-document line item can't be found", () => {
    const map = new Map([["rule-1:doc-type-1", true]]);
    expect(resolveIsMandatory("rule-1", "doc-type-does-not-exist", map)).toBeNull();
  });

  it("returns null when the map is empty entirely", () => {
    expect(resolveIsMandatory("rule-1", "doc-type-1", new Map())).toBeNull();
  });
});

describe("asOcrDocumentKind", () => {
  it("returns null unchanged (a document type with no OCR template, not an error)", () => {
    expect(asOcrDocumentKind(null)).toBeNull();
  });

  it("passes through every one of the 6 supported ocr_kind values", () => {
    const kinds = ["nric", "salary_slip", "bank_statement", "epf_statement", "employment_letter", "ea_form"];
    for (const kind of kinds) {
      expect(asOcrDocumentKind(kind)).toBe(kind);
    }
  });

  it("returns null for an unrecognized value rather than passing it through", () => {
    expect(asOcrDocumentKind("some_future_kind_not_yet_supported")).toBeNull();
  });
});

describe("isPeriodBasedDocumentKind", () => {
  it("recognizes only salary slips and bank statements as monthly types", () => {
    expect(isPeriodBasedDocumentKind("salary_slip")).toBe(true);
    expect(isPeriodBasedDocumentKind("bank_statement")).toBe(true);
  });

  it("treats every other kind, including epf_statement, as non-monthly", () => {
    expect(isPeriodBasedDocumentKind("nric")).toBe(false);
    expect(isPeriodBasedDocumentKind("epf_statement")).toBe(false);
    expect(isPeriodBasedDocumentKind("employment_letter")).toBe(false);
    expect(isPeriodBasedDocumentKind("ea_form")).toBe(false);
    expect(isPeriodBasedDocumentKind(null)).toBe(false);
  });
});

describe("isValidRequiredMonths", () => {
  it("accepts positive integers", () => {
    expect(isValidRequiredMonths(1)).toBe(true);
    expect(isValidRequiredMonths(3)).toBe(true);
    expect(isValidRequiredMonths(6)).toBe(true);
  });

  it("rejects null (never configured) — EPF's own required_months value", () => {
    expect(isValidRequiredMonths(null)).toBe(false);
  });

  it("rejects zero and negative values", () => {
    expect(isValidRequiredMonths(0)).toBe(false);
    expect(isValidRequiredMonths(-1)).toBe(false);
  });

  it("rejects non-integer values", () => {
    expect(isValidRequiredMonths(2.5)).toBe(false);
  });
});

describe("monthly document coverage", () => {
  const september = new Date("2026-09-11T00:00:00.000Z");
  const january = new Date("2026-01-15T00:00:00.000Z");

  it("builds the most recent completed N calendar months", () => {
    expect(expectedCompletedMonthKeys(3, september)).toEqual(["2026-06", "2026-07", "2026-08"]);
    expect(expectedCompletedMonthKeys(6, september)).toEqual([
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
    ]);
  });

  it("crosses a year boundary correctly when the current month is January", () => {
    // "Now" is January 2026 — the 3 preceding complete months span back into 2025.
    expect(expectedCompletedMonthKeys(3, january)).toEqual(["2025-10", "2025-11", "2025-12"]);
  });

  it("returns an empty list for requiredMonths below 1", () => {
    expect(expectedCompletedMonthKeys(0, september)).toEqual([]);
    expect(expectedCompletedMonthKeys(-1, september)).toEqual([]);
  });

  it("latestSelectableMonthKey is always the single most recent complete month, including across a year boundary", () => {
    expect(latestSelectableMonthKey(september)).toBe("2026-08");
    expect(latestSelectableMonthKey(january)).toBe("2025-12");
  });

  it("excludes null and malformed period values from coverage entirely", () => {
    const result = evaluatePeriodCoverage([null, "not-a-date", "2026-13-01", "2026-08-01"], 3, september);
    expect(result.uploadedCount).toBe(1);
    expect(result.missingMonthKeys).toEqual(["2026-06", "2026-07"]);
    expect(result.complete).toBe(false);
  });

  it("completes only when every one of 3 consecutive expected months is present", () => {
    const result = evaluatePeriodCoverage(["2026-06-01", "2026-07-01", "2026-08-01"], 3, september);
    expect(result.complete).toBe(true);
    expect(result.missingMonthKeys).toEqual([]);
    expect(result.uploadedCount).toBe(3);
  });

  it("reports exactly the one missing month out of 3 expected", () => {
    const result = evaluatePeriodCoverage(["2026-06-01", "2026-08-01"], 3, september);
    expect(result.complete).toBe(false);
    expect(result.missingMonthKeys).toEqual(["2026-07"]);
    expect(result.uploadedCount).toBe(2);
  });

  it("collapses duplicate periods for the same month rather than inflating coverage", () => {
    const result = evaluatePeriodCoverage(["2026-06-01", "2026-06-01", "2026-06-01", "2026-08-01"], 3, september);
    // Three uploads for June still count as exactly one covered month — the
    // database's own partial unique index prevents this case from ever
    // existing for real, but the derivation logic must not double-count if
    // it ever does (e.g. a null-period row and a confirmed row momentarily
    // coexisting for the same document_type before confirmation lands).
    expect(result.uploadedCount).toBe(2);
    expect(result.missingMonthKeys).toEqual(["2026-07"]);
    expect(result.complete).toBe(false);
  });

  it("supports a 6-month requirement", () => {
    const sixMonths = [
      "2026-03-01",
      "2026-04-01",
      "2026-05-01",
      "2026-06-01",
      "2026-07-01",
      "2026-08-01",
    ];
    expect(evaluatePeriodCoverage(sixMonths, 6, september).complete).toBe(true);
    expect(evaluatePeriodCoverage(sixMonths.slice(1), 6, september).complete).toBe(false);
  });
});

describe("fail-closed configuration check (mirrors getRequiredDocuments' branching)", () => {
  /**
   * getRequiredDocuments (./required-documents.ts) computes:
   *   isMisconfigured = isPeriodBasedDocumentKind(ocrKind) && !isValidRequiredMonths(requiredMonths)
   * and never falls back to a raw uploadedCount >= requiredCount check when
   * this is true. These tests lock in that exact formula's truth table
   * directly, independent of any Supabase mocking.
   */
  function isMisconfigured(ocrKind: string | null, requiredMonths: number | null): boolean {
    return isPeriodBasedDocumentKind(ocrKind) && !isValidRequiredMonths(requiredMonths);
  }

  it("flags salary_slip with a null required_months as misconfigured", () => {
    expect(isMisconfigured("salary_slip", null)).toBe(true);
  });

  it("flags bank_statement with an invalid (zero) required_months as misconfigured", () => {
    expect(isMisconfigured("bank_statement", 0)).toBe(true);
  });

  it("does not flag salary_slip/bank_statement when required_months is a valid positive integer", () => {
    expect(isMisconfigured("salary_slip", 3)).toBe(false);
    expect(isMisconfigured("bank_statement", 6)).toBe(false);
  });

  it("never flags EPF, which is required_count=1/required_months=null by design — not a period-based kind", () => {
    expect(isMisconfigured("epf_statement", null)).toBe(false);
  });

  it("never flags NRIC or any other non-monthly kind regardless of required_months", () => {
    expect(isMisconfigured("nric", null)).toBe(false);
    expect(isMisconfigured("employment_letter", null)).toBe(false);
    expect(isMisconfigured(null, null)).toBe(false);
  });
});
