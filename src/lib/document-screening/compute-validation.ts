import type { OCRDocumentKind } from "@/lib/ocr/types";
import { IMPORTANT_FIELDS, LOW_CONFIDENCE_THRESHOLD, MISMATCH_MIN_CONFIDENCE } from "./important-fields";
import type { ValidationIssue, ValidationStatus } from "./types";

/**
 * Pure function, no I/O — the AI reports extraction-quality facts
 * (confidence, classification), this function deterministically decides
 * PASS/REVIEW/FAIL from them. See ADR 0016 Decision 2 for the exact rules;
 * this is a direct implementation, not a reinterpretation.
 */

export type ComputeValidationInput = {
  expectedKind: OCRDocumentKind;
  /** The extraction result's own error — non-null means extraction itself failed. */
  extractionError: string | null;
  /** The extraction result's fields — null means extraction produced nothing usable. */
  fields: Record<string, unknown> | null;
  /** The extraction's self-reported confidence (0-1), or null if unavailable. */
  extractionConfidence: number | null;
  /**
   * classify()'s result, or null if classify() itself failed/was skipped —
   * a missing classification signal means no mismatch check runs, it does
   * not by itself cause FAIL/REVIEW (see ADR 0016 Decision 1).
   */
  classification: {
    predictedKind: OCRDocumentKind | "unrecognized";
    confidence: number | null;
  } | null;
};

export type ComputeValidationResult = {
  status: ValidationStatus;
  confidence: number;
  issues: ValidationIssue[];
};

export function computeValidation(input: ComputeValidationInput): ComputeValidationResult {
  const { expectedKind, extractionError, fields, extractionConfidence, classification } = input;

  // FAIL: extraction itself errored, or produced no usable fields at all.
  if (extractionError !== null || fields === null) {
    return {
      status: "FAIL",
      confidence: 0,
      issues: [
        {
          code: "extraction_failed",
          field: null,
          message: extractionError ?? "Extraction did not return any usable data for this document.",
        },
      ],
    };
  }

  const issues: ValidationIssue[] = [];

  if (extractionConfidence !== null && extractionConfidence < LOW_CONFIDENCE_THRESHOLD) {
    issues.push({
      code: "low_extraction_confidence",
      field: null,
      message: `Extraction confidence (${extractionConfidence.toFixed(2)}) is below the acceptable threshold.`,
    });
  }

  const importantFields = IMPORTANT_FIELDS[expectedKind];
  for (const fieldName of importantFields) {
    if (fields[fieldName] === null || fields[fieldName] === undefined) {
      issues.push({
        code: "missing_required_field",
        field: fieldName,
        message: `Required field "${fieldName}" could not be extracted from this document.`,
      });
    }
  }

  if (
    classification !== null &&
    classification.predictedKind !== expectedKind &&
    classification.confidence !== null &&
    classification.confidence >= MISMATCH_MIN_CONFIDENCE
  ) {
    issues.push({
      code: "document_type_mismatch",
      field: null,
      message: `This document looks like it may be a "${classification.predictedKind}", not the assigned "${expectedKind}".`,
    });
  }

  const status: ValidationStatus = issues.length > 0 ? "REVIEW" : "PASS";

  return {
    status,
    confidence: extractionConfidence ?? 0,
    issues,
  };
}
