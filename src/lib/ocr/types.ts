/**
 * Provider-agnostic OCR contract. Application code (Server Actions, read
 * functions, UI) only ever imports from this file and from
 * get-ocr-provider.ts — never from gemini-provider.ts directly. Swapping
 * providers later means adding a new class that implements OCRProvider and
 * changing one line in get-ocr-provider.ts; nothing else in the app changes.
 *
 * Adding a new document kind (a "future OCR template") is additive: a new
 * entry in OCRDocumentKind, a new Fields type, a new case in the provider's
 * internal prompt/schema map — this interface itself never changes.
 */

export type OCRDocumentKind = "nric" | "salary_slip";

export type NricFields = {
  nricNumber: string | null;
  fullName: string | null;
};

export type SalarySlipFields = {
  employerName: string | null;
  basicSalary: number | null;
  netSalary: number | null;
};

export type OCRFieldsFor<K extends OCRDocumentKind> = K extends "nric"
  ? NricFields
  : K extends "salary_slip"
    ? SalarySlipFields
    : never;

export type OCRFile = {
  bytes: Uint8Array;
  mimeType: string;
};

export type OCRExtractionResult<K extends OCRDocumentKind> = {
  kind: K;
  /** Null if extraction failed — see `error`. Never a guessed/placeholder value. */
  fields: OCRFieldsFor<K> | null;
  modelName: string;
  error: string | null;
};

export interface OCRProvider {
  extract<K extends OCRDocumentKind>(kind: K, file: OCRFile): Promise<OCRExtractionResult<K>>;
}
