import { describe, expect, it } from "vitest";
import { asOcrDocumentKind, buildMandatoryLookupKey, resolveIsMandatory } from "./required-document-derivation";

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
