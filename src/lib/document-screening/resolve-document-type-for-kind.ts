import { createClient } from "@/lib/supabase/server";
import type { OCRDocumentKind } from "@/lib/ocr/types";
import { decideResolvedDocumentType, type ResolveDocumentTypeForKindResult } from "./decide-resolved-document-type";

export type { ResolveDocumentTypeForKindResult } from "./decide-resolved-document-type";

/**
 * PD-017 Phase A — resolves the single `document_types` row tagged with a
 * given `ocr_kind`, for auto-assigning `documents.document_type_id` from a
 * classification result. Not wired into any upload flow yet — this is the
 * smallest first implementation slice, built and reviewable in isolation.
 *
 * `document_types.ocr_kind` carries no database uniqueness constraint (see
 * the Database OCR Readiness migration review), so this never guesses:
 * exactly one match resolves, zero matches is a normal "unresolved" outcome
 * (the caller leaves `document_type_id` null and surfaces "Needs type
 * confirmation" per PD-017 scope), and more than one match is a hard
 * failure — the caller must not proceed to auto-assign for that kind until
 * the duplicate `ocr_kind` tagging in `document_types` is fixed by a human.
 *
 * This function does nothing but fetch the rows and delegate the
 * 0/1/>1-match decision to decideResolvedDocumentType (a pure, no-I/O
 * function in ./decide-resolved-document-type.ts) — see that file for the
 * actual decision logic and its unit tests.
 */
export async function resolveDocumentTypeIdForKind(kind: OCRDocumentKind): Promise<ResolveDocumentTypeForKindResult> {
  const supabase = await createClient();

  const { data, error } = await supabase.from("document_types").select("id").eq("ocr_kind", kind);

  if (error) {
    console.error(`[resolveDocumentTypeIdForKind] query failed for kind="${kind}". code=${error.code ?? "unknown"} message=${error.message}`);
    throw new Error(`resolveDocumentTypeIdForKind: query failed for kind "${kind}".`);
  }

  try {
    return decideResolvedDocumentType(kind, data ?? []);
  } catch (decisionError) {
    console.error(`[resolveDocumentTypeIdForKind] ${decisionError instanceof Error ? decisionError.message : "ambiguous match"}`);
    throw decisionError;
  }
}
