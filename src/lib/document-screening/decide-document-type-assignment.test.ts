import { describe, expect, it } from "vitest";
import { decideDocumentTypeAssignment, type DecideDocumentTypeAssignmentInput } from "./decide-document-type-assignment";

/**
 * Unit tests for the pure PD-017 Phase A assignment decision — all branches
 * plus boundary values around the caller-supplied threshold.
 */

const base: DecideDocumentTypeAssignmentInput = {
  predictedKind: "salary_slip",
  confidence: 0.9,
  threshold: 0.7,
};

describe("decideDocumentTypeAssignment", () => {
  it("returns AUTO_ASSIGN for a recognized kind above the threshold", () => {
    expect(decideDocumentTypeAssignment(base)).toBe("AUTO_ASSIGN");
  });

  it("returns AUTO_ASSIGN when confidence is exactly equal to the threshold (inclusive boundary)", () => {
    expect(decideDocumentTypeAssignment({ ...base, confidence: 0.7, threshold: 0.7 })).toBe("AUTO_ASSIGN");
  });

  it("returns NEEDS_CONFIRMATION when confidence is just below the threshold", () => {
    expect(decideDocumentTypeAssignment({ ...base, confidence: 0.6999, threshold: 0.7 })).toBe("NEEDS_CONFIRMATION");
  });

  it("returns NEEDS_CONFIRMATION when confidence is null", () => {
    expect(decideDocumentTypeAssignment({ ...base, confidence: null })).toBe("NEEDS_CONFIRMATION");
  });

  it("returns NEEDS_CONFIRMATION for predictedKind = 'unrecognized', even with high confidence", () => {
    expect(decideDocumentTypeAssignment({ predictedKind: "unrecognized", confidence: 0.99, threshold: 0.7 })).toBe(
      "NEEDS_CONFIRMATION",
    );
  });

  it("returns NEEDS_CONFIRMATION for predictedKind = 'unrecognized' with null confidence", () => {
    expect(decideDocumentTypeAssignment({ predictedKind: "unrecognized", confidence: null, threshold: 0.7 })).toBe(
      "NEEDS_CONFIRMATION",
    );
  });

  it("returns NEEDS_CONFIRMATION when confidence is 0 and threshold is above 0", () => {
    expect(decideDocumentTypeAssignment({ ...base, confidence: 0, threshold: 0.7 })).toBe("NEEDS_CONFIRMATION");
  });

  it("returns AUTO_ASSIGN when confidence is 0 and threshold is also 0 (both-zero boundary)", () => {
    expect(decideDocumentTypeAssignment({ ...base, confidence: 0, threshold: 0 })).toBe("AUTO_ASSIGN");
  });

  it("returns AUTO_ASSIGN when confidence is 1 and threshold is 1 (both-one boundary)", () => {
    expect(decideDocumentTypeAssignment({ ...base, confidence: 1, threshold: 1 })).toBe("AUTO_ASSIGN");
  });

  it("returns NEEDS_CONFIRMATION when confidence is just below a threshold of 1", () => {
    expect(decideDocumentTypeAssignment({ ...base, confidence: 0.9999, threshold: 1 })).toBe("NEEDS_CONFIRMATION");
  });

  it("is not hard-coded to any single threshold — the same confidence can flip decisions across calls", () => {
    const input = { ...base, confidence: 0.5 };
    expect(decideDocumentTypeAssignment({ ...input, threshold: 0.4 })).toBe("AUTO_ASSIGN");
    expect(decideDocumentTypeAssignment({ ...input, threshold: 0.6 })).toBe("NEEDS_CONFIRMATION");
  });

  it.each(["nric", "salary_slip", "bank_statement", "epf_statement", "employment_letter", "ea_form"] as const)(
    "returns AUTO_ASSIGN for recognized kind %s above threshold, NEEDS_CONFIRMATION below it",
    (kind) => {
      expect(decideDocumentTypeAssignment({ predictedKind: kind, confidence: 0.8, threshold: 0.7 })).toBe("AUTO_ASSIGN");
      expect(decideDocumentTypeAssignment({ predictedKind: kind, confidence: 0.6, threshold: 0.7 })).toBe("NEEDS_CONFIRMATION");
    },
  );
});
