"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { STAFF_ROLES } from "@/lib/auth/staff-roles";
import { computeEligibility } from "./compute-eligibility";
import type { EligibilityReason, EligibilityVerdict } from "./types";

/**
 * Server Actions for the Eligibility Engine (Sprint 6.3C). Follows
 * src/lib/dsr-knowledge/actions.ts's and
 * src/lib/property-rules-knowledge/actions.ts's shape: resolve the actor
 * server-side, check STAFF_ROLES for a friendlier error only — real
 * enforcement is RLS (this app-level role check is a UX nicety, not a
 * security boundary; see docs/architecture/security.md and
 * docs/decisions/0002-rls-as-sole-authorization-boundary.md).
 *
 * Unlike every prior domain in this Knowledge Base, `computeEligibilityForCase`
 * writes via the `create_eligibility_verdict` RPC
 * (20260730030000_eligibility_engine_rpc.sql), not a plain `.insert()` —
 * creating one verdict means writing to two tables
 * (`eligibility_verdicts` + `eligibility_verdict_derivation_results`)
 * atomically (see docs/decisions/0004-atomic-multitable-writes-via-security-invoker-rpc.md).
 * That RPC does NOT validate that the given derivation_result_ids are real,
 * case-matching, or correctly-domained — per its own header comment, that is
 * explicitly this file's job, done below before the RPC is ever called.
 *
 * `requested_by_user_id` is resolved server-side inside the RPC via
 * `auth.uid()` — this file never resolves or passes it as a parameter.
 *
 * `propertyValue` and `requestedTenureYears` are caller-supplied external
 * inputs — `loan_cases` has no such columns, same "external input" boundary
 * DSR drew around `proposedInstalmentAmount` (docs/decisions/0012). This
 * function does not infer either value from anything else.
 */

const uuidField = (label: string) => z.string().trim().uuid(`Invalid ${label}.`);

export type ComputeEligibilityForCaseState = {
  eligibilityVerdictId: string | null;
  verdict: EligibilityVerdict["verdict"] | null;
  reasons: EligibilityReason[] | null;
  error: string | null;
};

const computeEligibilityForCaseSchema = z.object({
  loanCaseId: uuidField("loan case id"),
  bankId: uuidField("bank id"),
  bankProductId: uuidField("bank product id"),
  dsrDerivationResultId: uuidField("DSR derivation result id"),
  propertyRulesDerivationResultId: uuidField("property rules derivation result id"),
  propertyValue: z.number().positive("propertyValue must be greater than zero."),
  requestedTenureYears: z.number().positive("requestedTenureYears must be greater than zero."),
});

/** Defensive shape guard for `derivation_results.result_value` when `domain = "dsr"` — see src/lib/dsr-knowledge/actions.ts's `computeDsrForCase`. */
function extractDsrResult(resultValue: unknown): { passed: boolean | null; dsrRatio: number } | null {
  if (typeof resultValue !== "object" || resultValue === null) return null;
  const value = resultValue as { passed?: unknown; dsrRatio?: unknown };
  if (typeof value.dsrRatio !== "number") return null;
  if (value.passed !== null && typeof value.passed !== "boolean") return null;
  return { passed: (value.passed as boolean | null) ?? null, dsrRatio: value.dsrRatio };
}

/** Defensive shape guard for `derivation_results.result_value` when `domain = "property_rules"` — see src/lib/property-rules-knowledge/actions.ts's `computePropertyRulesForCase`. */
function extractPropertyRulesResult(resultValue: unknown): { marginOfFinancePercentage: number | null; maxTenureYears: number | null } | null {
  if (typeof resultValue !== "object" || resultValue === null) return null;
  const value = resultValue as { marginOfFinancePercentage?: unknown; maxTenureYears?: unknown };
  if (value.marginOfFinancePercentage !== null && typeof value.marginOfFinancePercentage !== "number") return null;
  if (value.maxTenureYears !== null && typeof value.maxTenureYears !== "number") return null;
  return {
    marginOfFinancePercentage: (value.marginOfFinancePercentage as number | null) ?? null,
    maxTenureYears: (value.maxTenureYears as number | null) ?? null,
  };
}

/**
 * Reads and verifies the DSR and Property Rules `derivation_results` rows
 * that feed this verdict, the `loan_cases` row (for `loan_amount`), computes
 * the verdict via the pure `computeEligibility`, and persists it atomically
 * via the `create_eligibility_verdict` RPC. Append-only, like every prior
 * domain in this Knowledge Base — a re-evaluation is always a new
 * `eligibility_verdicts` row, never an update to a prior one.
 */
export async function computeEligibilityForCase(
  loanCaseId: string,
  bankId: string,
  bankProductId: string,
  dsrDerivationResultId: string,
  propertyRulesDerivationResultId: string,
  propertyValue: number,
  requestedTenureYears: number,
): Promise<ComputeEligibilityForCaseState> {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return { eligibilityVerdictId: null, verdict: null, reasons: null, error: "Your session has expired. Please sign in again." };
  }
  if (!STAFF_ROLES.has(currentUser.role)) {
    return { eligibilityVerdictId: null, verdict: null, reasons: null, error: "You do not have permission to compute an eligibility verdict." };
  }

  const parsed = computeEligibilityForCaseSchema.safeParse({
    loanCaseId,
    bankId,
    bankProductId,
    dsrDerivationResultId,
    propertyRulesDerivationResultId,
    propertyValue,
    requestedTenureYears,
  });
  if (!parsed.success) {
    return { eligibilityVerdictId: null, verdict: null, reasons: null, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const input = parsed.data;

  const supabase = await createClient();

  // Cross-check bankProductId actually belongs to bankId before proceeding
  // — same "validate then proceed" pattern every prior domain's compute
  // action uses.
  const { data: bankProductRow, error: bankProductError } = await supabase
    .from("bank_products")
    .select("id, bank_id")
    .eq("id", input.bankProductId)
    .maybeSingle();

  if (bankProductError) {
    console.error(`[computeEligibilityForCase] bank_products lookup failed. code=${bankProductError.code ?? "unknown"} message=${bankProductError.message}`);
    return { eligibilityVerdictId: null, verdict: null, reasons: null, error: "Something went wrong while reading the bank product. Please try again." };
  }
  if (!bankProductRow || bankProductRow.bank_id !== input.bankId) {
    return { eligibilityVerdictId: null, verdict: null, reasons: null, error: "The selected bank product does not belong to the selected bank." };
  }

  // Need loan_amount for the margin-of-finance check — RLS-scoped select,
  // same pattern computeIncomeRecognition uses to read loan_cases.
  const { data: caseRow, error: caseError } = await supabase.from("loan_cases").select("id, loan_amount").eq("id", input.loanCaseId).maybeSingle();

  if (caseError) {
    console.error(`[computeEligibilityForCase] loan_cases lookup failed. code=${caseError.code ?? "unknown"} message=${caseError.message}`);
    return { eligibilityVerdictId: null, verdict: null, reasons: null, error: "Something went wrong while reading the case. Please try again." };
  }
  if (!caseRow) {
    return { eligibilityVerdictId: null, verdict: null, reasons: null, error: "Case not found or not accessible." };
  }
  if (typeof caseRow.loan_amount !== "number") {
    console.error(`[computeEligibilityForCase] loan_cases row ${caseRow.id} has a non-numeric loan_amount.`);
    return { eligibilityVerdictId: null, verdict: null, reasons: null, error: "Something went wrong while reading the case. Please try again." };
  }
  const requestedLoanAmount = caseRow.loan_amount;

  // Audit-trail integrity: only compute from a derivation_results row that
  // actually exists, belongs to this case/product, and is the right domain
  // — same discipline every prior sprint applies to its own inputs. Never
  // trust the raw id parameter alone.
  const { data: dsrRow, error: dsrError } = await supabase
    .from("derivation_results")
    .select("id, result_value")
    .eq("id", input.dsrDerivationResultId)
    .eq("loan_case_id", input.loanCaseId)
    .eq("bank_product_id", input.bankProductId)
    .eq("domain", "dsr")
    .maybeSingle();

  if (dsrError) {
    console.error(`[computeEligibilityForCase] DSR derivation_results lookup failed. code=${dsrError.code ?? "unknown"} message=${dsrError.message}`);
    return { eligibilityVerdictId: null, verdict: null, reasons: null, error: "Something went wrong while reading the DSR result. Please try again." };
  }
  if (!dsrRow) {
    return {
      eligibilityVerdictId: null,
      verdict: null,
      reasons: null,
      error: "The supplied DSR derivation result was not found for this case and bank product.",
    };
  }

  const dsrResult = extractDsrResult(dsrRow.result_value);
  if (!dsrResult) {
    console.error(`[computeEligibilityForCase] DSR derivation result ${dsrRow.id} does not have the expected result_value shape.`);
    return {
      eligibilityVerdictId: null,
      verdict: null,
      reasons: null,
      error: "The DSR derivation result does not contain a valid computed result. Please recompute DSR and try again.",
    };
  }

  const { data: propertyRow, error: propertyError } = await supabase
    .from("derivation_results")
    .select("id, result_value")
    .eq("id", input.propertyRulesDerivationResultId)
    .eq("loan_case_id", input.loanCaseId)
    .eq("bank_product_id", input.bankProductId)
    .eq("domain", "property_rules")
    .maybeSingle();

  if (propertyError) {
    console.error(
      `[computeEligibilityForCase] property rules derivation_results lookup failed. code=${propertyError.code ?? "unknown"} message=${propertyError.message}`,
    );
    return { eligibilityVerdictId: null, verdict: null, reasons: null, error: "Something went wrong while reading the property rules result. Please try again." };
  }
  if (!propertyRow) {
    return {
      eligibilityVerdictId: null,
      verdict: null,
      reasons: null,
      error: "The supplied property rules derivation result was not found for this case and bank product.",
    };
  }

  const propertyResult = extractPropertyRulesResult(propertyRow.result_value);
  if (!propertyResult) {
    console.error(`[computeEligibilityForCase] property rules derivation result ${propertyRow.id} does not have the expected result_value shape.`);
    return {
      eligibilityVerdictId: null,
      verdict: null,
      reasons: null,
      error: "The property rules derivation result does not contain a valid computed result. Please recompute property rules and try again.",
    };
  }

  const computed = computeEligibility(dsrResult, propertyResult, requestedLoanAmount, input.propertyValue, input.requestedTenureYears);

  // create_eligibility_verdict resolves requested_by_user_id server-side via
  // auth.uid() — never accepted as a parameter here (see RPC migration and
  // module doc comment above). Uses the verified rows' own ids, not the raw
  // input parameters — same integrity discipline as every prior sprint, even
  // though here they would be the same value in the non-adversarial case.
  const { data: verdictRow, error: rpcError } = await supabase.rpc("create_eligibility_verdict", {
    p_loan_case_id: input.loanCaseId,
    p_bank_product_id: input.bankProductId,
    p_verdict: computed.verdict,
    p_reasons: computed.reasons,
    p_derivation_result_ids: [dsrRow.id, propertyRow.id],
  });

  if (rpcError) {
    console.error(`[computeEligibilityForCase] RPC failed. code=${rpcError.code ?? "unknown"} message=${rpcError.message}`);
    return { eligibilityVerdictId: null, verdict: null, reasons: null, error: "Something went wrong while saving the eligibility verdict. Please try again." };
  }

  const createdVerdict = verdictRow as { id?: string } | null;
  if (!createdVerdict?.id) {
    console.error("[computeEligibilityForCase] RPC succeeded but returned no id.");
    return { eligibilityVerdictId: null, verdict: null, reasons: null, error: "Something went wrong while saving the eligibility verdict. Please try again." };
  }

  return { eligibilityVerdictId: createdVerdict.id, verdict: computed.verdict, reasons: computed.reasons, error: null };
}
