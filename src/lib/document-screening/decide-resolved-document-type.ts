import type { OCRDocumentKind } from "@/lib/ocr/types";

/**
 * Pure, no I/O — the row-cardinality decision (0 / 1 / >1 matches) behind
 * resolveDocumentTypeIdForKind, split into its own file (like
 * compute-validation.ts) so it can be unit-tested without transitively
 * importing @/lib/supabase/server (which pulls in next/headers and cannot
 * be resolved outside the Next.js runtime — that import chain is exactly
 * why this couldn't stay in the same file as the I/O wrapper and still be
 * testable without a Supabase mocking framework).
 *
 * Never falls through to picking `rows[0]` on any path other than the
 * explicit length === 1 case — the single source of truth for what
 * "ambiguous" means for this lookup.
 */

export type ResolveDocumentTypeForKindResult = { status: "resolved"; documentTypeId: string } | { status: "unresolved" };

/** The only shape this decision needs from a `document_types` row. */
export type DocumentTypeIdRow = { id: string };

export function decideResolvedDocumentType(kind: OCRDocumentKind, rows: DocumentTypeIdRow[]): ResolveDocumentTypeForKindResult {
  if (rows.length === 0) {
    return { status: "unresolved" };
  }

  if (rows.length > 1) {
    throw new Error(
      `resolveDocumentTypeIdForKind: ${rows.length} document_types rows found with ocr_kind = "${kind}" — ambiguous, refusing to guess.`,
    );
  }

  return { status: "resolved", documentTypeId: rows[0].id };
}
