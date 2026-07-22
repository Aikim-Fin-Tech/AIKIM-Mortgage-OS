import type { BadgeVariant } from "@/components/ui/badge";

export type LoanStage =
  | "New Enquiry"
  | "Document Collection"
  | "Credit Review"
  | "Bank Submission"
  | "Approved";

/**
 * MVP Sprint Day 2: full loan processing pipeline. Raw DB enum values are
 * lowercase snake_case (new, waiting_document, under_review, ready_to_submit,
 * submitted, approved, rejected) — see
 * supabase/migrations/20260725010000_loan_workflow.sql. `on_hold` remains a
 * valid (but retired) DB value for any pre-existing row; it is intentionally
 * not offered here anymore. See docs/decisions/0009-loan-processing-workflow.md.
 */
export type LoanStatus =
  | "New"
  | "Waiting Document"
  | "Under Review"
  | "Ready to Submit"
  | "Submitted"
  | "Approved"
  | "Rejected";

export type LoanCase = {
  id: string;
  customer: string;
  phone: string;
  project: string;
  loanAmount: number;
  bank: string;
  stage: LoanStage;
  status: LoanStatus;
  banker: string;
};

export const stages: LoanStage[] = [
  "New Enquiry",
  "Document Collection",
  "Credit Review",
  "Bank Submission",
  "Approved",
];

export const statuses: LoanStatus[] = [
  "New",
  "Waiting Document",
  "Under Review",
  "Ready to Submit",
  "Submitted",
  "Approved",
  "Rejected",
];

export const banks = [
  "Maybank",
  "CIMB Bank",
  "Public Bank",
  "RHB Bank",
  "Hong Leong Bank",
  "AmBank",
  "Bank Islam",
  "UOB Malaysia",
] as const;

export const bankers = [
  "Sarah Lim",
  "Daniel Tan",
  "Amir Rahman",
  "Priya Nathan",
  "Wong Mei Ling",
] as const;

/**
 * Single source of truth for raw DB enum value -> display label, used by
 * every lib/database/*.ts file that reads loan_cases.status (dashboard.ts,
 * loan-cases.ts, loan-case-details.ts) — previously each kept its own copy.
 * `on_hold` is mapped for legacy rows only; never offered as an option
 * anywhere (see STATUS_OPTIONS in new-loan-case-types.ts).
 */
export const STATUS_LABELS: Record<string, LoanStatus> = {
  new: "New",
  waiting_document: "Waiting Document",
  under_review: "Under Review",
  ready_to_submit: "Ready to Submit",
  submitted: "Submitted",
  approved: "Approved",
  rejected: "Rejected",
  on_hold: "Waiting Document",
};

export const statusBadgeVariant: Record<LoanStatus, BadgeVariant> = {
  New: "default",
  "Waiting Document": "warning",
  "Under Review": "warning",
  "Ready to Submit": "info",
  Submitted: "neutral",
  Approved: "success",
  Rejected: "danger",
};

/**
 * Linear pipeline order for Workflow Progress (Loan Health Score) and the
 * Next Action Card. Rejected is a terminal state reached from anywhere, not
 * a step on the path to Approved — see healthScore.ts for how it's scored.
 */
export const STATUS_PIPELINE_ORDER: LoanStatus[] = [
  "New",
  "Waiting Document",
  "Under Review",
  "Ready to Submit",
  "Submitted",
  "Approved",
];
