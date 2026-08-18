import type { OCRDocumentKind, OCRFieldsFor } from "@/lib/ocr/types";

/**
 * Document Screening API v1.0 (Sprint 2) types — shapes copied verbatim from
 * docs/decisions/0016-document-screening-classification-and-validation.md
 * Decision 3, not redesigned here.
 */

export type ValidationStatus = "PASS" | "REVIEW" | "FAIL";

export type ValidationIssue = {
  /** "low_extraction_confidence" | "missing_required_field" | "document_type_mismatch" | "extraction_failed" */
  code: string;
  /** specific field name, when applicable */
  field: string | null;
  /** human-readable, no raw PII */
  message: string;
};

export type DocumentScreeningEnvelope<K extends OCRDocumentKind = OCRDocumentKind> = {
  /**
   * false only for an operational failure (not found, permission denied,
   * storage/provider failure) — distinct from a "FAIL" validation verdict,
   * which is success: true (the operation ran) with a bad verdict.
   */
  success: boolean;
  document: {
    id: string;
    document_type: K;
    /** null if classify() itself failed */
    classification_confidence: number | null;
    /** FAILED only if extraction couldn't run at all; independent of validation.status */
    processing_status: "COMPLETED" | "FAILED";
  } | null; // null when success is false
  extracted_data: OCRFieldsFor<K> | null;
  validation: {
    status: ValidationStatus;
    confidence: number;
    issues: ValidationIssue[];
  } | null; // null only when success is false (no attempt was made)
  /** same convention as every other Server Action in this repo */
  error: string | null;
};
