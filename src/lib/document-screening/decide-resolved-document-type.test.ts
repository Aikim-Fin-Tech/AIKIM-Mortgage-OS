import { describe, expect, it } from "vitest";
import { decideResolvedDocumentType } from "./decide-resolved-document-type";

/**
 * Unit tests for the pure row-cardinality decision behind
 * resolveDocumentTypeIdForKind — no Supabase client, no mocking framework,
 * just the plain-array decision logic.
 */

describe("decideResolvedDocumentType", () => {
  it("returns { status: 'unresolved' } for 0 rows", () => {
    const result = decideResolvedDocumentType("nric", []);
    expect(result).toEqual({ status: "unresolved" });
  });

  it("returns { status: 'resolved', documentTypeId } for exactly 1 row", () => {
    const result = decideResolvedDocumentType("nric", [{ id: "type-123" }]);
    expect(result).toEqual({ status: "resolved", documentTypeId: "type-123" });
  });

  it("takes the returned ID from the single matching row, not a constant or the kind itself", () => {
    const result = decideResolvedDocumentType("salary_slip", [{ id: "8f2e9c40-aaaa-4b11-9c3d-000000000001" }]);
    expect(result).toEqual({ status: "resolved", documentTypeId: "8f2e9c40-aaaa-4b11-9c3d-000000000001" });
  });

  it("throws an explicit ambiguity error for 2 rows", () => {
    expect(() => decideResolvedDocumentType("bank_statement", [{ id: "a" }, { id: "b" }])).toThrow(
      /2 document_types rows found with ocr_kind = "bank_statement" — ambiguous, refusing to guess/,
    );
  });

  it("throws an explicit ambiguity error for more than 2 rows, naming the exact count", () => {
    expect(() =>
      decideResolvedDocumentType("epf_statement", [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }]),
    ).toThrow(/4 document_types rows found with ocr_kind = "epf_statement"/);
  });

  it("does not silently select the first row when there is more than one match", () => {
    const rows = [{ id: "first-row-id" }, { id: "second-row-id" }, { id: "third-row-id" }];
    let thrown = false;
    let sawResolvedWithFirstRow = false;
    try {
      const result = decideResolvedDocumentType("employment_letter", rows);
      // If this ever returns instead of throwing, explicitly fail the assumption
      // that it silently picked rows[0] — this branch should be unreachable.
      sawResolvedWithFirstRow = result.status === "resolved" && result.documentTypeId === rows[0].id;
    } catch {
      thrown = true;
    }
    expect(thrown).toBe(true);
    expect(sawResolvedWithFirstRow).toBe(false);
  });

  it("throws an Error instance (not a plain string or other value) for ambiguous matches", () => {
    try {
      decideResolvedDocumentType("ea_form", [{ id: "a" }, { id: "b" }]);
      expect.unreachable("expected decideResolvedDocumentType to throw");
    } catch (caught) {
      expect(caught).toBeInstanceOf(Error);
    }
  });

  it.each(["nric", "salary_slip", "bank_statement", "epf_statement", "employment_letter", "ea_form"] as const)(
    "resolves correctly for kind %s with exactly one matching row",
    (kind) => {
      const result = decideResolvedDocumentType(kind, [{ id: `${kind}-type-id` }]);
      expect(result).toEqual({ status: "resolved", documentTypeId: `${kind}-type-id` });
    },
  );
});
