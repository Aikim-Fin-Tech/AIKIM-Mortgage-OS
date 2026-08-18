import { describe, expect, it } from "vitest";
import { computeValidation, type ComputeValidationInput } from "./compute-validation";

/**
 * Unit tests for the deterministic PASS/REVIEW/FAIL rules in ADR 0016
 * Decision 2. Pure-function target — no mocking needed.
 *
 * NOTE: Vitest is not installed yet in this repo (a required human step per
 * ADR 0016 Decision 5 — `npm install -D vitest` + a `"test"` script in
 * package.json). This file is written against standard Vitest globals but
 * has not been executed by a runner as part of this sprint's work.
 */

const baseInput: ComputeValidationInput = {
  expectedKind: "salary_slip",
  extractionError: null,
  fields: {
    employerName: "Acme Sdn Bhd",
    basicSalary: 5000,
    netSalary: 4200,
  },
  extractionConfidence: 0.95,
  classification: { predictedKind: "salary_slip", confidence: 0.9 },
};

describe("computeValidation", () => {
  it("returns PASS for a clean extraction with no issues", () => {
    const result = computeValidation(baseInput);
    expect(result.status).toBe("PASS");
    expect(result.issues).toEqual([]);
    expect(result.confidence).toBe(0.95);
  });

  it("returns FAIL when extraction itself errored", () => {
    const result = computeValidation({
      ...baseInput,
      extractionError: "Gemini request timed out",
      fields: null,
      extractionConfidence: null,
    });
    expect(result.status).toBe("FAIL");
    expect(result.confidence).toBe(0);
    expect(result.issues).toEqual([{ code: "extraction_failed", field: null, message: "Gemini request timed out" }]);
  });

  it("returns FAIL when fields is null even without an explicit error", () => {
    const result = computeValidation({ ...baseInput, fields: null });
    expect(result.status).toBe("FAIL");
    expect(result.confidence).toBe(0);
    expect(result.issues[0].code).toBe("extraction_failed");
  });

  it("returns REVIEW when extraction confidence is below the threshold", () => {
    const result = computeValidation({ ...baseInput, extractionConfidence: 0.5 });
    expect(result.status).toBe("REVIEW");
    expect(result.issues.some((issue) => issue.code === "low_extraction_confidence")).toBe(true);
  });

  it("returns REVIEW when an important field is missing", () => {
    const result = computeValidation({
      ...baseInput,
      fields: { employerName: "Acme Sdn Bhd", basicSalary: null, netSalary: 4200 },
    });
    expect(result.status).toBe("REVIEW");
    expect(result.issues).toEqual([{ code: "missing_required_field", field: "basicSalary", message: expect.any(String) }]);
  });

  it("returns REVIEW when classification mismatches expectedKind above MISMATCH_MIN_CONFIDENCE", () => {
    const result = computeValidation({
      ...baseInput,
      classification: { predictedKind: "bank_statement", confidence: 0.8 },
    });
    expect(result.status).toBe("REVIEW");
    expect(result.issues.some((issue) => issue.code === "document_type_mismatch")).toBe(true);
  });

  it("stays PASS when classification mismatch confidence is below MISMATCH_MIN_CONFIDENCE", () => {
    const result = computeValidation({
      ...baseInput,
      classification: { predictedKind: "bank_statement", confidence: 0.4 },
    });
    expect(result.status).toBe("PASS");
    expect(result.issues).toEqual([]);
  });

  it("raises all simultaneous issues at once", () => {
    const result = computeValidation({
      expectedKind: "salary_slip",
      extractionError: null,
      fields: { employerName: null, basicSalary: null, netSalary: 4200 },
      extractionConfidence: 0.3,
      classification: { predictedKind: "nric", confidence: 0.9 },
    });
    expect(result.status).toBe("REVIEW");
    const codes = result.issues.map((issue) => issue.code).sort();
    expect(codes).toEqual(
      ["document_type_mismatch", "low_extraction_confidence", "missing_required_field", "missing_required_field"].sort(),
    );
  });

  it("does not run a mismatch check when classification is null (classify() failed/skipped)", () => {
    const result = computeValidation({ ...baseInput, classification: null });
    expect(result.status).toBe("PASS");
    expect(result.issues).toEqual([]);
  });
});
