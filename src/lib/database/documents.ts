import { createClient } from "@/lib/supabase/server";
import { DOCUMENT_STATUS_LABELS, type DocumentStatus } from "@/lib/documents/document-status";
import type { OCRDocumentKind, OCRFieldsFor } from "@/lib/ocr/types";

/**
 * Read-only data access for the Loan Case "Documents" tab (Sprint 6.1).
 *
 * Distinct from the summary counts in lib/database/loan-case-details.ts (which
 * back the Overview tab's DocumentSummaryCard) — this module returns the full
 * per-document metadata needed for the dedicated list/upload/preview/download/
 * delete surface. Never throws; failures degrade to an empty list plus an
 * `error` string, same contract as every other file in this directory.
 */

export type DocumentTypeOption = {
  id: string;
  name: string;
};

/** The most recent OCR attempt for a document, if its type is OCR-eligible. */
export type DocumentExtractionSummary = {
  kind: OCRDocumentKind;
  fields: OCRFieldsFor<OCRDocumentKind> | null;
  error: string | null;
  extractedAt: string;
};

export type LoanCaseDocument = {
  id: string;
  fileName: string | null;
  storagePath: string | null;
  documentType: string | null;
  uploadedByName: string | null;
  uploadedAt: string;
  fileSize: number | null;
  mimeType: string | null;
  status: DocumentStatus;
  statusLabel: string;
  /** Null if this document's type isn't OCR-eligible (document_types.ocr_kind). */
  ocrKind: OCRDocumentKind | null;
  /** Null if OCR-eligible but never attempted yet. */
  latestExtraction: DocumentExtractionSummary | null;
};

export type GetLoanCaseDocumentsResult = {
  /** null if the case itself doesn't exist or isn't visible to the current user. */
  loanCaseId: string | null;
  documents: LoanCaseDocument[];
  error: string | null;
};

type DocumentTypeEmbed = { name: string; ocr_kind: string | null };

type DocumentRow = {
  id: string;
  file_name: string | null;
  storage_path: string | null;
  file_size: number | null;
  mime_type: string | null;
  status: string;
  created_at: string;
  uploaded_by_user_id: string | null;
  document_types: DocumentTypeEmbed | DocumentTypeEmbed[] | null;
};

function normalizeEmbed<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function isOcrKind(value: string | null): value is OCRDocumentKind {
  return value === "nric" || value === "salary_slip";
}

export async function getLoanCaseDocuments(caseNumber: string): Promise<GetLoanCaseDocumentsResult> {
  const empty: GetLoanCaseDocumentsResult = { loanCaseId: null, documents: [], error: null };

  try {
    const supabase = await createClient();

    const { data: caseRow, error: caseError } = await supabase
      .from("loan_cases")
      .select("id")
      .eq("case_number", caseNumber)
      .maybeSingle();

    if (caseError) {
      console.error(
        `[getLoanCaseDocuments] loan_cases lookup failed for ${caseNumber}. code=${caseError.code ?? "unknown"} message=${caseError.message}`,
      );
      return { ...empty, error: caseError.message };
    }

    if (!caseRow) {
      // Not found or hidden by RLS — treated as "no documents" by the caller.
      return empty;
    }

    const { data: documentRows, error: documentsError } = await supabase
      .from("documents")
      .select(
        "id, file_name, storage_path, file_size, mime_type, status, created_at, uploaded_by_user_id, document_types ( name, ocr_kind )",
      )
      .eq("loan_case_id", caseRow.id)
      .order("created_at", { ascending: false });

    if (documentsError) {
      console.error(
        `[getLoanCaseDocuments] documents query failed for ${caseNumber}. code=${documentsError.code ?? "unknown"} message=${documentsError.message}`,
      );
      return { loanCaseId: caseRow.id, documents: [], error: documentsError.message };
    }

    const rows = (documentRows ?? []) as DocumentRow[];

    // Separate lookup for uploader names (avoids assuming an unambiguous
    // embed between documents.uploaded_by_user_id and user_profiles).
    const uploaderIds = Array.from(
      new Set(rows.map((r) => r.uploaded_by_user_id).filter((id): id is string => Boolean(id))),
    );

    let uploaderNames = new Map<string, string>();
    if (uploaderIds.length > 0) {
      const { data: uploaderRows, error: uploaderError } = await supabase
        .from("user_profiles")
        .select("id, full_name")
        .in("id", uploaderIds);

      if (uploaderError) {
        console.error(
          `[getLoanCaseDocuments] uploader lookup failed for ${caseNumber}. code=${uploaderError.code ?? "unknown"} message=${uploaderError.message}`,
        );
      } else if (uploaderRows) {
        uploaderNames = new Map(uploaderRows.map((u) => [u.id, u.full_name]));
      }
    }

    // Latest extraction per document, for the OCR-eligible ones. A separate
    // query (rather than an embed) since we only want the single most recent
    // row per document_id, which PostgREST embeds can't limit per-parent.
    const documentIds = rows.map((r) => r.id);
    const latestExtractionByDocId = new Map<string, DocumentExtractionSummary>();
    if (documentIds.length > 0) {
      const { data: extractionRows, error: extractionError } = await supabase
        .from("document_extractions")
        .select("document_id, kind, extracted_data, error, created_at")
        .in("document_id", documentIds)
        .order("created_at", { ascending: false });

      if (extractionError) {
        console.error(
          `[getLoanCaseDocuments] document_extractions query failed for ${caseNumber}. code=${extractionError.code ?? "unknown"} message=${extractionError.message}`,
        );
      } else {
        for (const row of extractionRows ?? []) {
          // Rows are ordered newest-first; keep only the first (latest) per document.
          if (latestExtractionByDocId.has(row.document_id)) continue;
          if (!isOcrKind(row.kind)) continue;
          latestExtractionByDocId.set(row.document_id, {
            kind: row.kind,
            fields: row.extracted_data as OCRFieldsFor<OCRDocumentKind> | null,
            error: row.error,
            extractedAt: row.created_at,
          });
        }
      }
    }

    const documents: LoanCaseDocument[] = rows.map((row) => {
      const status = (row.status as DocumentStatus) ?? "pending";
      const docType = normalizeEmbed(row.document_types);
      const ocrKind = isOcrKind(docType?.ocr_kind ?? null) ? (docType!.ocr_kind as OCRDocumentKind) : null;
      return {
        id: row.id,
        fileName: row.file_name,
        storagePath: row.storage_path,
        documentType: docType?.name ?? null,
        uploadedByName: row.uploaded_by_user_id ? (uploaderNames.get(row.uploaded_by_user_id) ?? null) : null,
        uploadedAt: row.created_at,
        fileSize: row.file_size,
        mimeType: row.mime_type,
        status,
        statusLabel: DOCUMENT_STATUS_LABELS[status] ?? status,
        ocrKind,
        latestExtraction: latestExtractionByDocId.get(row.id) ?? null,
      };
    });

    return { loanCaseId: caseRow.id, documents, error: null };
  } catch (unexpectedError) {
    const message = unexpectedError instanceof Error ? unexpectedError.message : "Unknown error";
    console.error(`[getLoanCaseDocuments] Unexpected error for ${caseNumber}: ${message}`);
    return { ...empty, error: message };
  }
}

/** Options for the upload form's Document Type picker. */
export async function getDocumentTypeOptions(): Promise<{ types: DocumentTypeOption[]; error: string | null }> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase.from("document_types").select("id, name").order("name", { ascending: true });

    if (error) {
      console.error(`[getDocumentTypeOptions] Supabase query failed. code=${error.code ?? "unknown"} message=${error.message}`);
      return { types: [], error: error.message };
    }

    return { types: data ?? [], error: null };
  } catch (unexpectedError) {
    const message = unexpectedError instanceof Error ? unexpectedError.message : "Unknown error";
    console.error(`[getDocumentTypeOptions] Unexpected error: ${message}`);
    return { types: [], error: message };
  }
}
