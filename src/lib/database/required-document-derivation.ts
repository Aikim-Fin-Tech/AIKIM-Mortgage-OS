import type { OCRDocumentKind } from "@/lib/ocr/types";

/**
 * Pure, no I/O — the field-derivation logic behind getRequiredDocuments
 * (./required-documents.ts), split into its own file the same way
 * src/lib/document-screening/decide-resolved-document-type.ts is split from
 * resolve-document-type-for-kind.ts: so it's testable without mocking the
 * Supabase client.
 */

const OCR_DOCUMENT_KINDS: readonly OCRDocumentKind[] = [
  "nric",
  "salary_slip",
  "bank_statement",
  "epf_statement",
  "employment_letter",
  "ea_form",
];

/** Null (not the raw string) for anything outside the 6 supported ocr_kind values — a document type with no OCR template yet, not an error. */
export function asOcrDocumentKind(value: string | null): OCRDocumentKind | null {
  return value !== null && (OCR_DOCUMENT_KINDS as readonly string[]).includes(value) ? (value as OCRDocumentKind) : null;
}

/**
 * loan_case_required_documents has no is_mandatory column of its own — that
 * property belongs to mortgage_rule_documents (the rule template), looked up
 * live at read time rather than duplicated at generation time, matching this
 * module's existing pattern of never storing a derivable value. Returns null
 * — never a defaulted true/false — whenever the originating rule-document
 * line item can't be found (no rule ever matched, or it was since
 * edited/removed from the rule after this case's checklist was generated).
 */
export function buildMandatoryLookupKey(mortgageRuleId: string | null, documentTypeId: string): string | null {
  return mortgageRuleId === null ? null : `${mortgageRuleId}:${documentTypeId}`;
}

export function resolveIsMandatory(
  mortgageRuleId: string | null,
  documentTypeId: string,
  mandatoryByKey: ReadonlyMap<string, boolean>,
): boolean | null {
  const key = buildMandatoryLookupKey(mortgageRuleId, documentTypeId);
  if (key === null) return null;
  return mandatoryByKey.get(key) ?? null;
}
