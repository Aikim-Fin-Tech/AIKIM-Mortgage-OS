import type { OCRDocumentKind } from "@/lib/ocr/types";

/**
 * PD-017 Phase A — pure decision function, no I/O. The confidence threshold
 * is an explicit parameter, never hard-coded here, per product-manager scope
 * confirmation — a future database-configurable setting can supply it
 * without this function changing.
 *
 * Mirrors compute-validation.ts's existing "below threshold" convention: a
 * confidence exactly equal to the threshold is treated as high-confidence
 * (AUTO_ASSIGN-eligible) — only strictly-below fails the bar.
 */

export type DocumentTypeAssignmentDecision = "AUTO_ASSIGN" | "NEEDS_CONFIRMATION";

export type DecideDocumentTypeAssignmentInput = {
  predictedKind: OCRDocumentKind | "unrecognized";
  confidence: number | null;
  threshold: number;
};

export function decideDocumentTypeAssignment(input: DecideDocumentTypeAssignmentInput): DocumentTypeAssignmentDecision {
  const { predictedKind, confidence, threshold } = input;

  if (predictedKind === "unrecognized") {
    return "NEEDS_CONFIRMATION";
  }

  if (confidence === null || confidence < threshold) {
    return "NEEDS_CONFIRMATION";
  }

  return "AUTO_ASSIGN";
}
