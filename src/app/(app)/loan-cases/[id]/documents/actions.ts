"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { STAFF_ROLES } from "@/lib/auth/staff-roles";
import { ALLOWED_DOCUMENT_MIME_TYPES, MAX_DOCUMENT_FILE_SIZE_BYTES } from "@/lib/documents/document-status";
import { getOCRProvider } from "@/lib/ocr/get-ocr-provider";
import type { OCRDocumentKind } from "@/lib/ocr/types";
import { recordTimelineEvent } from "@/lib/timeline/record-timeline-event";

/**
 * Server Actions for the Loan Case "Documents" tab (Sprint 6.1).
 *
 * The file itself is uploaded to Supabase Storage directly from the browser
 * (see DocumentUploadDialog) using the same authenticated session as the
 * server — that upload is already governed by the storage RLS policies in
 * supabase/migrations/20260721010000_document_management_mvp.sql. These
 * actions only ever touch small JSON payloads (metadata, signed URLs), never
 * raw file bytes, so there's no Server Action body-size concern.
 *
 * Nothing here trusts the browser for: role, uploaded_by_user_id, or which loan_case_id
 * a document belongs to — every action re-derives the case from `caseNumber`
 * (RLS-scoped) rather than accepting a raw loan_case_id from the client.
 */

async function resolveVisibleLoanCaseId(
  caseNumber: string,
): Promise<{ loanCaseId: string | null; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("loan_cases").select("id").eq("case_number", caseNumber).maybeSingle();

  if (error) {
    console.error(`[documents/actions] loan_cases lookup failed for ${caseNumber}. code=${error.code ?? "unknown"}`);
    return { loanCaseId: null, error: error.message };
  }

  if (!data) {
    return { loanCaseId: null, error: "Case not found or not accessible." };
  }

  return { loanCaseId: data.id, error: null };
}

export type RecordDocumentUploadState = {
  error: string | null;
};

export async function recordDocumentUpload(
  caseNumber: string,
  input: {
    storagePath: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    documentTypeId: string | null;
  },
): Promise<RecordDocumentUploadState> {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return { error: "Your session has expired. Please sign in again." };
  }
  if (!STAFF_ROLES.has(currentUser.role)) {
    return { error: "You do not have permission to upload documents." };
  }

  if (!ALLOWED_DOCUMENT_MIME_TYPES.includes(input.mimeType as (typeof ALLOWED_DOCUMENT_MIME_TYPES)[number])) {
    return { error: "Unsupported file type. Only PDF, JPG, and PNG are allowed." };
  }
  if (input.fileSize <= 0 || input.fileSize > MAX_DOCUMENT_FILE_SIZE_BYTES) {
    return { error: "File size must be between 1 byte and 20MB." };
  }

  const { loanCaseId, error: lookupError } = await resolveVisibleLoanCaseId(caseNumber);
  if (!loanCaseId) {
    return { error: lookupError ?? "Case not found or not accessible." };
  }

  // Defense in depth: the uploaded object's folder must match this case, even
  // though the storage RLS policy already enforces this at the storage layer.
  if (!input.storagePath.startsWith(`${loanCaseId}/`)) {
    return { error: "Upload path does not match this case." };
  }

  const supabase = await createClient();

  // Resolve the acting user_profiles.id server-side (never trusted from the
  // client) — same pattern as create_loan_case's created_by resolution.
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  let uploaderProfileId: string | null = null;
  if (authUser) {
    const { data: profileRow } = await supabase
      .from("user_profiles")
      .select("id")
      .eq("auth_user_id", authUser.id)
      .maybeSingle();
    uploaderProfileId = profileRow?.id ?? null;
  }

  const { error: insertError } = await supabase.from("documents").insert({
    loan_case_id: loanCaseId,
    document_type_id: input.documentTypeId,
    file_name: input.fileName,
    storage_path: input.storagePath,
    file_size: input.fileSize,
    mime_type: input.mimeType,
    uploaded_by_user_id: uploaderProfileId,
    status: "pending",
    // storage_provider defaults to 'supabase' and processing_status defaults
    // to 'UPLOADED' at the database level — not set explicitly here so the
    // default lives in exactly one place (the migration).
  });

  if (insertError) {
    console.error(`[recordDocumentUpload] insert failed. code=${insertError.code ?? "unknown"} message=${insertError.message}`);
    const isPermissionError = insertError.code === "42501" || insertError.message.toLowerCase().includes("row-level security");
    return {
      error: isPermissionError
        ? "You do not have permission to upload documents to this case."
        : "Something went wrong while saving the document. Please try again.",
    };
  }

  await recordTimelineEvent(supabase, loanCaseId, "document_uploaded", `Document uploaded: ${input.fileName}`, uploaderProfileId);

  revalidatePath(`/loan-cases/${caseNumber}/documents`);
  revalidatePath(`/loan-cases/${caseNumber}`);
  return { error: null };
}

export type DeleteDocumentState = {
  error: string | null;
};

export async function deleteDocumentAction(caseNumber: string, documentId: string): Promise<DeleteDocumentState> {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return { error: "Your session has expired. Please sign in again." };
  }
  if (!STAFF_ROLES.has(currentUser.role)) {
    return { error: "You do not have permission to delete documents." };
  }

  const { loanCaseId, error: lookupError } = await resolveVisibleLoanCaseId(caseNumber);
  if (!loanCaseId) {
    return { error: lookupError ?? "Case not found or not accessible." };
  }

  const supabase = await createClient();

  const { data: docRow, error: fetchError } = await supabase
    .from("documents")
    .select("id, storage_path, loan_case_id")
    .eq("id", documentId)
    .eq("loan_case_id", loanCaseId)
    .maybeSingle();

  if (fetchError) {
    console.error(`[deleteDocumentAction] lookup failed. code=${fetchError.code ?? "unknown"} message=${fetchError.message}`);
    return { error: "Something went wrong while deleting the document. Please try again." };
  }

  if (!docRow) {
    return { error: "Document not found or not accessible." };
  }

  if (docRow.storage_path) {
    const { error: storageError } = await supabase.storage.from("loan-documents").remove([docRow.storage_path]);
    if (storageError) {
      console.error(`[deleteDocumentAction] storage remove failed. message=${storageError.message}`);
      return { error: "Could not delete the file from storage. Please try again." };
    }
  }

  const { error: deleteError } = await supabase.from("documents").delete().eq("id", documentId);

  if (deleteError) {
    console.error(`[deleteDocumentAction] delete failed. code=${deleteError.code ?? "unknown"} message=${deleteError.message}`);
    const isPermissionError = deleteError.code === "42501" || deleteError.message.toLowerCase().includes("row-level security");
    return {
      error: isPermissionError
        ? "You do not have permission to delete this document."
        : "Something went wrong while deleting the document. Please try again.",
    };
  }

  revalidatePath(`/loan-cases/${caseNumber}/documents`);
  revalidatePath(`/loan-cases/${caseNumber}`);
  return { error: null };
}

export type GetSignedUrlResult = {
  url: string | null;
  error: string | null;
};

const SIGNED_URL_EXPIRY_SECONDS = 60;

export async function getDocumentSignedUrlAction(
  caseNumber: string,
  documentId: string,
  options?: { download?: boolean },
): Promise<GetSignedUrlResult> {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return { url: null, error: "Your session has expired. Please sign in again." };
  }

  const { loanCaseId, error: lookupError } = await resolveVisibleLoanCaseId(caseNumber);
  if (!loanCaseId) {
    return { url: null, error: lookupError ?? "Case not found or not accessible." };
  }

  const supabase = await createClient();

  const { data: docRow, error: fetchError } = await supabase
    .from("documents")
    .select("id, storage_path, file_name")
    .eq("id", documentId)
    .eq("loan_case_id", loanCaseId)
    .maybeSingle();

  if (fetchError || !docRow?.storage_path) {
    console.error(`[getDocumentSignedUrlAction] lookup failed. message=${fetchError?.message ?? "not found"}`);
    return { url: null, error: "Document not found or not accessible." };
  }

  // `download: true` sets Content-Disposition: attachment (with the original
  // file name) so the browser downloads rather than displays the file — used
  // by the Download action but not the Preview action.
  const { data: signed, error: signError } = await supabase.storage
    .from("loan-documents")
    .createSignedUrl(
      docRow.storage_path,
      SIGNED_URL_EXPIRY_SECONDS,
      options?.download ? { download: docRow.file_name ?? true } : undefined,
    );

  if (signError || !signed?.signedUrl) {
    console.error(`[getDocumentSignedUrlAction] sign failed. message=${signError?.message ?? "no url"}`);
    return { url: null, error: "Could not generate a link for this file. Please try again." };
  }

  return { url: signed.signedUrl, error: null };
}

export type ExtractDocumentDataState = {
  error: string | null;
};

function isOcrKind(value: string | null): value is OCRDocumentKind {
  return value === "nric" || value === "salary_slip";
}

/**
 * Runs OCR (Gemini 2.5 Pro, via the OCRProvider interface — see
 * src/lib/ocr/) on an already-uploaded document and stores the result as a
 * new document_extractions row. Every attempt is stored, including
 * failures — never silently retried over a past record.
 */
export async function extractDocumentData(caseNumber: string, documentId: string): Promise<ExtractDocumentDataState> {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return { error: "Your session has expired. Please sign in again." };
  }
  if (!STAFF_ROLES.has(currentUser.role)) {
    return { error: "You do not have permission to extract document data." };
  }

  const { loanCaseId, error: lookupError } = await resolveVisibleLoanCaseId(caseNumber);
  if (!loanCaseId) {
    return { error: lookupError ?? "Case not found or not accessible." };
  }

  const supabase = await createClient();

  const { data: docRow, error: fetchError } = await supabase
    .from("documents")
    .select("id, storage_path, mime_type, document_types ( ocr_kind )")
    .eq("id", documentId)
    .eq("loan_case_id", loanCaseId)
    .maybeSingle();

  if (fetchError || !docRow?.storage_path) {
    console.error(`[extractDocumentData] lookup failed. message=${fetchError?.message ?? "not found"}`);
    return { error: "Document not found or not accessible." };
  }

  const docType = Array.isArray(docRow.document_types) ? docRow.document_types[0] : docRow.document_types;
  const kind = docType?.ocr_kind ?? null;

  if (!isOcrKind(kind)) {
    return { error: "This document type does not support data extraction." };
  }

  if (!docRow.mime_type) {
    return { error: "This document has no recorded file type and cannot be processed." };
  }

  const { data: fileBlob, error: downloadError } = await supabase.storage.from("loan-documents").download(docRow.storage_path);

  if (downloadError || !fileBlob) {
    console.error(`[extractDocumentData] storage download failed. message=${downloadError?.message ?? "no file"}`);
    return { error: "Could not read the file from storage. Please try again." };
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

  let result;
  try {
    const provider = getOCRProvider();
    result = await provider.extract(kind, { bytes, mimeType: docRow.mime_type });
  } catch (providerError) {
    // e.g. GEMINI_API_KEY not configured — a real, expected state until the
    // key is added, not a bug. Still recorded as a failed attempt below.
    const message = providerError instanceof Error ? providerError.message : "OCR provider is not configured.";
    console.error(`[extractDocumentData] provider unavailable. message=${message}`);
    result = { kind, fields: null, modelName: "unavailable", error: message };
  }

  const { error: insertError } = await supabase.from("document_extractions").insert({
    document_id: documentId,
    kind: result.kind,
    extracted_data: result.fields,
    model_name: result.modelName,
    error: result.error,
    extracted_by_user_id: actorProfileId,
  });

  if (insertError) {
    console.error(`[extractDocumentData] insert failed. code=${insertError.code ?? "unknown"} message=${insertError.message}`);
    return { error: "Extraction ran but the result could not be saved. Please try again." };
  }

  const kindLabel = kind === "nric" ? "NRIC" : "Salary Slip";
  await recordTimelineEvent(
    supabase,
    loanCaseId,
    "ocr_completed",
    result.error ? `OCR failed for ${kindLabel}` : `OCR completed for ${kindLabel}`,
    actorProfileId,
  );

  revalidatePath(`/loan-cases/${caseNumber}/documents`);

  if (result.error) {
    return { error: `Extraction failed: ${result.error}` };
  }
  return { error: null };
}
