/**
 * Plain types and constants for the New Loan Case form. Safe to import from
 * both Client and Server Components — no Supabase client, no `next/headers`,
 * no `server-only` import here, on purpose.
 *
 * public.loan_cases.stage / .status are Postgres enums (see Sprint 4 schema) —
 * the raw values below are exactly what those enums contain, not guessed.
 */

export const STAGE_OPTIONS = [
  { value: "new_enquiry", label: "New Enquiry" },
  { value: "document_collection", label: "Document Collection" },
  { value: "credit_review", label: "Credit Review" },
  { value: "bank_submission", label: "Bank Submission" },
  { value: "approved", label: "Approved" },
] as const;

export const STATUS_OPTIONS = [
  { value: "new", label: "New" },
  { value: "waiting_document", label: "Waiting Document" },
  { value: "under_review", label: "Under Review" },
  { value: "ready_to_submit", label: "Ready to Submit" },
  { value: "submitted", label: "Submitted" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
] as const;
// `on_hold` is retired — not offered as a create-time option — but remains a
// valid legacy DB value; see docs/decisions/0009-loan-processing-workflow.md.

export type CustomerOption = {
  id: string;
  fullName: string;
  phone: string | null;
};

export type BankerOption = {
  id: string;
  fullName: string;
  bankName: string;
};

export type NewLoanCaseFormOptions = {
  customers: CustomerOption[];
  bankers: BankerOption[];
  error: string | null;
};
