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

/**
 * Same composite-key lookup as resolveIsMandatory, for
 * mortgage_rule_documents.display_order — loan_case_required_documents has
 * no display_order column of its own either. Null (never a guessed 0 or
 * Infinity) whenever the originating rule-document line item can't be
 * found, for the same reasons resolveIsMandatory returns null in that case.
 */
export function resolveDisplayOrder(
  mortgageRuleId: string | null,
  documentTypeId: string,
  displayOrderByKey: ReadonlyMap<string, number>,
): number | null {
  const key = buildMandatoryLookupKey(mortgageRuleId, documentTypeId);
  if (key === null) return null;
  return displayOrderByKey.get(key) ?? null;
}

/**
 * Sorts Required Documents rows by mortgage_rule_documents.display_order,
 * ascending. Never hardcodes a document-name order — the ordering is purely
 * data-driven from the matched rule's own line items. Rows whose
 * display_order couldn't be resolved (legacy checklist generated before
 * this field existed, or the originating rule-document line item was since
 * edited/removed) are placed after every ordered row, so a missing value
 * degrades gracefully instead of appearing first or throwing off the whole
 * list. Ties (including among unordered rows) fall back to the document
 * name, so the result is fully deterministic regardless of input order.
 */
export function sortByDisplayOrder<T extends { displayOrder: number | null; documentName: string }>(
  rows: readonly T[],
): T[] {
  return [...rows].sort((a, b) => {
    if (a.displayOrder !== null && b.displayOrder !== null) {
      return a.displayOrder - b.displayOrder || a.documentName.localeCompare(b.documentName);
    }
    if (a.displayOrder !== null) return -1;
    if (b.displayOrder !== null) return 1;
    return a.documentName.localeCompare(b.documentName);
  });
}

/**
 * Only salary_slip and bank_statement carry a document_period — every other
 * ocr_kind (including epf_statement, which is deliberately required_count=1/
 * required_months=null) is untouched by any of the monthly-coverage logic
 * below.
 */
export function isPeriodBasedDocumentKind(kind: string | null): boolean {
  return kind === "salary_slip" || kind === "bank_statement";
}

/**
 * A period-based document type's required_months must be a positive
 * integer to mean anything as "the last N complete months." Null (never
 * configured), 0, a negative number, or a non-integer are all invalid —
 * callers must treat this as a rule-configuration error, never silently
 * fall back to counting raw uploaded files (see isPeriodBasedDocumentKind
 * call sites in ./required-documents.ts).
 */
export function isValidRequiredMonths(value: number | null): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

function toMonthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** The N complete calendar months immediately before `now`. */
export function expectedCompletedMonthKeys(requiredMonths: number, now = new Date()): string[] {
  if (!Number.isInteger(requiredMonths) || requiredMonths < 1) return [];

  // Product operates in Malaysia. Shift to MYT before reading UTC parts so
  // month-boundary behavior does not depend on the deployment server's TZ.
  const malaysiaNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const months: string[] = [];
  for (let offset = requiredMonths; offset >= 1; offset -= 1) {
    months.push(toMonthKey(new Date(Date.UTC(malaysiaNow.getUTCFullYear(), malaysiaNow.getUTCMonth() - offset, 1))));
  }
  return months;
}

/**
 * The most recent *complete* calendar month, as "YYYY-MM" — the latest
 * month selectable for period-based evidence. The current, still-open
 * month is never a complete evidence period (mirrors the same rule
 * assign_document_type_and_period enforces server-side). Pure and
 * testable via the `now` parameter — callers (e.g. DocumentTypeCell's
 * month-picker `max` attribute) must call this instead of reading
 * Date.now() directly during render, which React's purity rules forbid.
 */
export function latestSelectableMonthKey(now = new Date()): string {
  const malaysiaNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return toMonthKey(new Date(Date.UTC(malaysiaNow.getUTCFullYear(), malaysiaNow.getUTCMonth() - 1, 1)));
}

export function evaluatePeriodCoverage(
  periods: readonly (string | null)[],
  requiredMonths: number,
  now = new Date(),
): { uploadedCount: number; missingMonthKeys: string[]; complete: boolean } {
  const expected = expectedCompletedMonthKeys(requiredMonths, now);
  const uploaded = new Set(
    periods
      .filter((period): period is string => period !== null && /^\d{4}-\d{2}-\d{2}$/.test(period))
      .map((period) => period.slice(0, 7)),
  );
  const missingMonthKeys = expected.filter((month) => !uploaded.has(month));

  return {
    uploadedCount: expected.length - missingMonthKeys.length,
    missingMonthKeys,
    complete: expected.length > 0 && missingMonthKeys.length === 0,
  };
}
