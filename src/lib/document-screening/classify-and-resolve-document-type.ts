import type { OCRClassificationResult, OCRDocumentKind, OCRFile } from "@/lib/ocr/types";
import { DOCUMENT_TYPE_ASSIGNMENT_CONFIDENCE_THRESHOLD } from "./important-fields";
import { decideDocumentTypeAssignment } from "./decide-document-type-assignment";
import type { ResolveDocumentTypeForKindResult } from "./decide-resolved-document-type";

/**
 * PD-017 Phase A — upload-time classification, independent of screenDocument()
 * (unchanged by this work): screenDocument() requires an already-known
 * expected kind, read from the document's existing document_types.ocr_kind —
 * at upload time no document_type_id has been assigned yet, so that
 * precondition can't be met. This is a separate, lightweight classify-only
 * call, not a reuse of screenDocument()'s internals, matching ADR 0016's own
 * "small, low-risk duplication over refactoring a shipped flow" precedent.
 *
 * Never throws. Any failure — classify() itself throwing (e.g. provider not
 * configured), classify() returning a non-null `error`, low confidence,
 * `predictedKind === "unrecognized"`, or resolve() throwing (ambiguous
 * ocr_kind tagging) or returning "unresolved" — degrades to `null`, never a
 * guessed fallback type. The caller (recordDocumentUpload) relies on this
 * never-throws contract to guarantee a classification failure can never fail
 * the upload itself.
 *
 * `deps` is a required parameter, not defaulted here — this file
 * deliberately has zero I/O imports (no @/lib/ocr/get-ocr-provider, no
 * @/lib/supabase/server), only types and the two pure helper functions, so
 * it can be unit tested without transitively importing `server-only`/
 * `next/headers` (which cannot be resolved outside the Next.js runtime —
 * the same reason decide-resolved-document-type.ts was split out earlier).
 * The real classify()/resolve() implementations are wired up at the call
 * site in documents/actions.ts, not here.
 */

export type ClassifyAndResolveDocumentTypeDeps = {
  classify: (file: OCRFile) => Promise<OCRClassificationResult>;
  resolve: (kind: OCRDocumentKind) => Promise<ResolveDocumentTypeForKindResult>;
};

export async function classifyAndResolveDocumentType(
  file: OCRFile,
  deps: ClassifyAndResolveDocumentTypeDeps,
): Promise<string | null> {
  try {
    const classification = await deps.classify(file);

    if (classification.error !== null) {
      console.error(`[classifyAndResolveDocumentType] classify() returned an error. message=${classification.error}`);
      return null;
    }

    const decision = decideDocumentTypeAssignment({
      predictedKind: classification.predictedKind,
      confidence: classification.confidence,
      threshold: DOCUMENT_TYPE_ASSIGNMENT_CONFIDENCE_THRESHOLD,
    });

    if (decision !== "AUTO_ASSIGN") {
      return null;
    }

    // decideDocumentTypeAssignment only returns "AUTO_ASSIGN" when
    // predictedKind !== "unrecognized" (see its own implementation) — a
    // provably safe narrowing, not a guess.
    const kind = classification.predictedKind as OCRDocumentKind;

    const resolved = await deps.resolve(kind);
    return resolved.status === "resolved" ? resolved.documentTypeId : null;
  } catch (error) {
    console.error(
      `[classifyAndResolveDocumentType] unexpected error, degrading to unresolved. message=${error instanceof Error ? error.message : "unknown"}`,
    );
    return null;
  }
}
