import { createClient } from "@/lib/supabase/server";
import { STATUS_LABELS, type LoanCase, type LoanStage } from "@/lib/loan-cases-data";

/**
 * Read-only data access for the Loan Cases list and detail pages.
 *
 * public.loan_cases is the canonical table (see Sprint 4 schema). public.mortgage_cases
 * is a legacy/duplicate table in the Supabase project and must never be queried here.
 *
 * This module only performs SELECTs. It never inserts, updates, or deletes anything.
 *
 * As of Sprint 6.5 this always reflects the real Supabase database — there is no
 * mock-data fallback anymore. Which rows come back is entirely governed by RLS for
 * the currently authenticated user (see the `loan_cases_select_scope` policy).
 */

// Raw enum values stored in loan_cases.stage / loan_cases.status, mapped to the
// display strings the existing UI (LoanCasesExplorer, statusBadgeVariant, etc.) expects.
const STAGE_LABELS: Record<string, LoanStage> = {
  new_enquiry: "New Enquiry",
  document_collection: "Document Collection",
  credit_review: "Credit Review",
  bank_submission: "Bank Submission",
  approved: "Approved",
};

// Shape of a row returned by the shared select below, including the nested
// customers/bankers relationships embedded via loan_cases.customer_id / banker_id.
type LoanCaseRow = {
  case_number: string;
  property_project: string;
  loan_amount: number;
  bank_name: string;
  stage: string;
  status: string;
  customers: { full_name: string; phone: string | null } | null;
  bankers: { full_name: string } | null;
};

const LOAN_CASE_SELECT = `
  case_number,
  property_project,
  loan_amount,
  bank_name,
  stage,
  status,
  customers ( full_name, phone ),
  bankers ( full_name )
`;

function mapRow(row: LoanCaseRow): LoanCase {
  return {
    id: row.case_number,
    customer: row.customers?.full_name ?? "Unknown Customer",
    phone: row.customers?.phone ?? "-",
    project: row.property_project,
    loanAmount: Number(row.loan_amount),
    bank: row.bank_name,
    stage: STAGE_LABELS[row.stage] ?? "New Enquiry",
    status: STATUS_LABELS[row.status] ?? "Under Review",
    banker: row.bankers?.full_name ?? "Unassigned",
  };
}

export type GetLoanCasesResult = {
  cases: LoanCase[];
  error: string | null;
};

/**
 * Fetches every loan case visible to the current user for the Loan Cases list page.
 *
 * Never throws. On a query error, `cases` comes back empty and `error` is set to a
 * safe message the caller can choose to surface — the underlying Supabase error is
 * only ever written to the server console, never returned to the browser as-is.
 * A genuinely empty (or RLS-filtered-to-empty) result set is not an error: `cases`
 * is simply `[]` and `error` stays `null`.
 */
export async function getLoanCases(): Promise<GetLoanCasesResult> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("loan_cases")
      .select(LOAN_CASE_SELECT)
      .order("created_at", { ascending: false })
      .returns<LoanCaseRow[]>();

    if (error) {
      // Never log the Supabase client, keys, cookies, or headers — only the error message/code.
      console.error(
        `[getLoanCases] Supabase query failed. code=${error.code ?? "unknown"} message=${error.message}`,
      );
      return { cases: [], error: error.message };
    }

    if (!data || data.length === 0) {
      console.log(
        "[getLoanCases] Supabase data used — query succeeded but returned zero rows " +
          "(either the table is empty or RLS scoped the current user to no cases).",
      );
      return { cases: [], error: null };
    }

    const cases = data.map(mapRow);

    console.log(`[getLoanCases] Supabase data used — loaded ${cases.length} loan case(s).`);
    return { cases, error: null };
  } catch (unexpectedError) {
    const message = unexpectedError instanceof Error ? unexpectedError.message : "Unknown error";
    console.error(`[getLoanCases] Unexpected error while fetching loan cases: ${message}`);
    return { cases: [], error: message };
  }
}

export type GetLoanCaseResult = {
  loanCase: LoanCase | null;
  error: string | null;
};

/**
 * Fetches a single loan case by its case_number (the human-readable "ML-2026-001"
 * style id used in the URL) for the Loan Case detail page. Same error/empty
 * semantics as getLoanCases: never throws, and an RLS-blocked or missing case is
 * reported as `loanCase: null` with `error: null`, not treated as a hard error.
 */
export async function getLoanCaseByCaseNumber(caseNumber: string): Promise<GetLoanCaseResult> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("loan_cases")
      .select(LOAN_CASE_SELECT)
      .eq("case_number", caseNumber)
      .maybeSingle()
      .returns<LoanCaseRow>();

    if (error) {
      console.error(
        `[getLoanCaseByCaseNumber] Supabase query failed for ${caseNumber}. ` +
          `code=${error.code ?? "unknown"} message=${error.message}`,
      );
      return { loanCase: null, error: error.message };
    }

    if (!data) {
      console.log(
        `[getLoanCaseByCaseNumber] Supabase data used — no case found for ${caseNumber} ` +
          "(either it doesn't exist or RLS hid it from the current user).",
      );
      return { loanCase: null, error: null };
    }

    console.log(`[getLoanCaseByCaseNumber] Supabase data used — loaded case ${caseNumber}.`);
    return { loanCase: mapRow(data), error: null };
  } catch (unexpectedError) {
    const message = unexpectedError instanceof Error ? unexpectedError.message : "Unknown error";
    console.error(`[getLoanCaseByCaseNumber] Unexpected error while fetching ${caseNumber}: ${message}`);
    return { loanCase: null, error: message };
  }
}
