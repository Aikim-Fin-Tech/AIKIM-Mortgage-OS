"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { STAFF_ROLES } from "@/lib/auth/staff-roles";
import { getOCRProvider } from "@/lib/ocr/get-ocr-provider";
import type { OCRClassificationResult, OCRDocumentKind, OCRExtractionResult } from "@/lib/ocr/types";
import { recordTimelineEvent } from "@/lib/timeline/record-timeline-event";
import { computeValidation } from "./compute-validation";
import { maskForLog } from "./mask-for-log";
import type { DocumentScreeningEnvelope } from "./types";

/**
 * Document Screening API v1.0 (Sprint 2) — see
 * docs/decisions/0016-document-screening-classification-and-validation.md.
 *
 * Orchestrates classify() + extract() (independent, run in parallel per ADR
 * 0016 Decision 1), computeValidation() (deterministic, never AI-decided —
 * Decision 2), a single complete `document_extractions` insert (append-only,
 * no patch-after — Decision 3), and a timeline event.
 *
 * This is a **new, separate** Server Action, not a refactor of
 * `extractDocumentData` (src/app/(app)/loan-cases/[id]/documents/actions.ts)
 * — it deliberately duplicates that action's lookup/download/actor-resolution
 * logic (resolveVisibleLoanCaseId there is module-private, not exported) per
 * ADR 0016 Decision 3's explicit "small, low-risk duplication" call. Not
 * wired into any UI this sprint.
 *
 * Any STAFF_ROLES check here is a UX nicety, not a security boundary — RLS
 * on `documents`/`document_extractions`/`loan_cases` is the actual
 * authorization boundary (see docs/architecture/security.md).
 */

function isOcrKind(value: string | null): value is OCRDocumentKind {
  return (
    value === "nric" ||
    value === "salary_slip" ||
    value === "bank_statement" ||
    value === "epf_statement" ||
    value === "employment_letter" ||
    value === "ea_form"
  );
}

const KIND_LABELS: Record<OCRDocumentKind, string> = {
  nric: "NRIC",
  salary_slip: "Salary Slip",
  bank_statement: "Bank Statement",
  epf_statement: "EPF Statement",
  employment_letter: "Employment Letter",
  ea_form: "EA Form",
};

async function resolveVisibleLoanCaseId(
  caseNumber: string,
): Promise<{ loanCaseId: string | null; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("loan_cases").select("id").eq("case_number", caseNumber).maybeSingle();

  if (error) {
    console.error(`[screenDocument] loan_cases lookup failed for ${caseNumber}. code=${error.code ?? "unknown"} message=${maskForLog(error.message)}`);
    return { loanCaseId: null, error: error.message };
  }

  if (!data) {
    return { loanCaseId: null, error: "Case not found or not accessible." };
  }

  return { loanCaseId: data.id, error: null };
}

function operationalFailure(error: string): DocumentScreeningEnvelope {
  return { success: false, document: null, extracted_data: null, validation: null, error };
}

export async function screenDocument(caseNumber: string, documentId: string): Promise<DocumentScreeningEnvelope> {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return operationalFailure("Your session has expired. Please sign in again.");
  }
  if (!STAFF_ROLES.has(currentUser.role)) {
    return operationalFailure("You do not have permission to screen documents.");
  }

  const { loanCaseId, error: lookupError } = await resolveVisibleLoanCaseId(caseNumber);
  if (!loanCaseId) {
    return operationalFailure(lookupError ?? "Case not found or not accessible.");
  }

  const supabase = await createClient();

  const { data: docRow, error: fetchError } = await supabase
    .from("documents")
    .select("id, storage_path, mime_type, document_types ( ocr_kind )")
    .eq("id", documentId)
    .eq("loan_case_id", loanCaseId)
    .maybeSingle();

  if (fetchError || !docRow?.storage_path) {
    console.error(`[screenDocument] lookup failed. message=${maskForLog(fetchError?.message ?? "not found")}`);
    return operationalFailure("Document not found or not accessible.");
  }

  const docType = Array.isArray(docRow.document_types) ? docRow.document_types[0] : docRow.document_types;
  const expectedKind = docType?.ocr_kind ?? null;

  if (!isOcrKind(expectedKind)) {
    return operationalFailure("This document type does not support data extraction.");
  }

  if (!docRow.mime_type) {
    return operationalFailure("This document has no recorded file type and cannot be processed.");
  }

  const { data: fileBlob, error: downloadError } = await supabase.storage.from("loan-documents").download(docRow.storage_path);

  if (downloadError || !fileBlob) {
    console.error(`[screenDocument] storage download failed. message=${maskForLog(downloadError?.message ?? "no file")}`);
    return operationalFailure("Could not read the file from storage. Please try again.");
  }

  const bytes = new Uint8Array(await fileBlob.arrayBuffer());

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  let actorProfileId: string | null = null;
  if (authUser) {
    const { data: profileRow } = await supabase
      .from("user_profiles")
      .select("id")
      .eq("auth_user_id", authUser.id)
      .maybeSingle();
    actorProfileId = profileRow?.id ?? null;
  }

  let classificationResult: OCRClassificationResult;
  let extractionResult: OCRExtractionResult<OCRDocumentKind>;
  try {
    const provider = getOCRProvider();
    const file = { bytes, mimeType: docRow.mime_type };
    // Independent calls, run in parallel — classify() is deliberately
    // unprimed and must not know the human-assigned expectedKind, so it
    // cannot be derived from (or short-circuit) the extract() call. See ADR
    // 0016 Decision 1.
    [classificationResult, extractionResult] = await Promise.all([provider.classify(file), provider.extract(expectedKind, file)]);
  } catch (providerError) {
    // e.g. GEMINI_API_KEY not configured — a real, expected state until the
    // key is added, not a bug. Both signals recorded as failed below.
    const message = providerError instanceof Error ? providerError.message : "OCR provider is not configured.";
    console.error(`[screenDocument] provider unavailable. message=${maskForLog(message)}`);
    classificationResult = { predictedKind: "unrecognized", confidence: null, modelName: "unavailable", error: message };
    extractionResult = { kind: expectedKind, fields: null, confidence: null, modelName: "unavailable", error: message };
  }

  const validation = computeValidation({
    expectedKind,
    extractionError: extractionResult.error,
    fields: extractionResult.fields as Record<string, unknown> | null,
    extractionConfidence: extractionResult.confidence,
    classification:
      classificationResult.error === null
        ? { predictedKind: classificationResult.predictedKind, confidence: classificationResult.confidence }
        : null,
  });

  const { error: insertError } = await supabase.from("document_extractions").insert({
    document_id: documentId,
    kind: extractionResult.kind,
    extracted_data: extractionResult.fields,
    model_name: extractionResult.modelName,
    error: extractionResult.error,
    extracted_by_user_id: actorProfileId,
    confidence: extractionResult.confidence,
    validation_status: validation.status,
    validation_issues: validation.issues,
    classification_predicted_kind: classificationResult.error === null ? classificationResult.predictedKind : null,
    classification_confidence: classificationResult.error === null ? classificationResult.confidence : null,
  });

  if (insertError) {
    console.error(`[screenDocument] insert failed. code=${insertError.code ?? "unknown"} message=${maskForLog(insertError.message)}`);
    return operationalFailure("Screening ran but the result could not be saved. Please try again.");
  }

  const kindLabel = KIND_LABELS[expectedKind];
  await recordTimelineEvent(
    supabase,
    loanCaseId,
    "ocr_completed",
    extractionResult.error
      ? `OCR failed for ${kindLabel}`
      : `OCR completed for ${kindLabel} (screening: ${validation.status})`,
    actorProfileId,
  );

  revalidatePath(`/loan-cases/${caseNumber}/documents`);

  return {
    success: true,
    document: {
      id: documentId,
      document_type: expectedKind,
      classification_confidence: classificationResult.error === null ? classificationResult.confidence : null,
      processing_status: extractionResult.error !== null ? "FAILED" : "COMPLETED",
    },
    extracted_data: extractionResult.fields,
    validation: {
      status: validation.status,
      confidence: validation.confidence,
      issues: validation.issues,
    },
    error: null,
  };
}
