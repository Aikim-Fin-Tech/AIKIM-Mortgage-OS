import { createClient } from "@/lib/supabase/server";
import type { RequiredDocumentRow } from "@/lib/mortgage-rules/types";

/**
 * Read-only data access for the Documents tab's "Required Documents"
 * section (Sprint 6.2 Phase 1). Distinct from lib/database/documents.ts,
 * which lists what's actually been *uploaded* — this module lists what the
 * matched mortgage rule says *should* be uploaded, and computes completion
 * live against the documents table (never a stored, potentially-stale flag).
 */

type RequiredDocRow = {
  id: string;
  document_type_id: string;
  required_count: number;
  required_months: number | null;
  state: "active" | "not_required";
  document_types: { name: string; document_categories: { name: string } | { name: string }[] | null } | { name: string; document_categories: { name: string } | { name: string }[] | null }[] | null;
};

function normalizeEmbed<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export type GetRequiredDocumentsResult = {
  loanCaseId: string | null;
  rows: RequiredDocumentRow[];
  /** Percentage of *active* requirements that are completed. Null if there are none. */
  completionPercent: number | null;
  error: string | null;
};

export async function getRequiredDocuments(caseNumber: string): Promise<GetRequiredDocumentsResult> {
  const empty: GetRequiredDocumentsResult = { loanCaseId: null, rows: [], completionPercent: null, error: null };

  try {
    const supabase = await createClient();

    const { data: caseRow, error: caseError } = await supabase
      .from("loan_cases")
      .select("id")
      .eq("case_number", caseNumber)
      .maybeSingle();

    if (caseError) {
      console.error(`[getRequiredDocuments] loan_cases lookup failed for ${caseNumber}. code=${caseError.code ?? "unknown"}`);
      return { ...empty, error: caseError.message };
    }

    if (!caseRow) {
      return empty;
    }

    const [requiredResult, uploadedResult] = await Promise.all([
      supabase
        .from("loan_case_required_documents")
        .select("id, document_type_id, required_count, required_months, state, document_types ( name, document_categories ( name ) )")
        .eq("loan_case_id", caseRow.id),
      supabase.from("documents").select("document_type_id").eq("loan_case_id", caseRow.id),
    ]);

    if (requiredResult.error) {
      console.error(
        `[getRequiredDocuments] loan_case_required_documents query failed for ${caseNumber}. code=${requiredResult.error.code ?? "unknown"} message=${requiredResult.error.message}`,
      );
      return { loanCaseId: caseRow.id, rows: [], completionPercent: null, error: requiredResult.error.message };
    }

    if (uploadedResult.error) {
      console.error(
        `[getRequiredDocuments] documents query failed for ${caseNumber}. code=${uploadedResult.error.code ?? "unknown"} message=${uploadedResult.error.message}`,
      );
      return { loanCaseId: caseRow.id, rows: [], completionPercent: null, error: uploadedResult.error.message };
    }

    const uploadedCounts = new Map<string, number>();
    for (const doc of uploadedResult.data ?? []) {
      if (!doc.document_type_id) continue;
      uploadedCounts.set(doc.document_type_id, (uploadedCounts.get(doc.document_type_id) ?? 0) + 1);
    }

    const rawRows = (requiredResult.data ?? []) as RequiredDocRow[];

    const rows: RequiredDocumentRow[] = rawRows.map((row) => {
      const docType = normalizeEmbed(row.document_types);
      const category = docType ? normalizeEmbed(docType.document_categories) : null;
      const uploadedCount = uploadedCounts.get(row.document_type_id) ?? 0;

      const status: RequiredDocumentRow["status"] =
        row.state === "not_required" ? "not_required" : uploadedCount >= row.required_count ? "completed" : "missing";

      return {
        id: row.id,
        documentTypeId: row.document_type_id,
        documentName: docType?.name ?? "Document",
        categoryName: category?.name ?? null,
        requiredCount: row.required_count,
        requiredMonths: row.required_months,
        uploadedCount,
        status,
      };
    });

    const activeRows = rows.filter((r) => r.status !== "not_required");
    const completionPercent =
      activeRows.length === 0
        ? null
        : Math.round((activeRows.filter((r) => r.status === "completed").length / activeRows.length) * 100);

    return { loanCaseId: caseRow.id, rows, completionPercent, error: null };
  } catch (unexpectedError) {
    const message = unexpectedError instanceof Error ? unexpectedError.message : "Unknown error";
    console.error(`[getRequiredDocuments] Unexpected error for ${caseNumber}: ${message}`);
    return { ...empty, error: message };
  }
}
