import { createClient } from "@/lib/supabase/server";
import type { EligibilityReason, EligibilityVerdict } from "@/lib/eligibility-engine/types";

/**
 * Read-only data access for the Eligibility Engine (Sprint 6.3C). Same
 * contract as every other file in this directory: never throw, return
 * `{ ..., error }`, log `code`/`message` only.
 *
 * `getEligibilityVerdictsForCase` is case-scoped; its RLS select policy
 * re-checks the parent case's own visibility, so no app-level role/case
 * check is needed here either — RLS is the authorization boundary
 * (docs/decisions/0002-rls-as-sole-authorization-boundary.md).
 */

export type GetEligibilityVerdictsForCaseResult = {
  verdicts: EligibilityVerdict[];
  error: string | null;
};

/** `bankProductId` narrows to one bank product's verdicts; omitted, returns every bank product's verdicts for the case. */
export async function getEligibilityVerdictsForCase(loanCaseId: string, bankProductId?: string): Promise<GetEligibilityVerdictsForCaseResult> {
  try {
    const supabase = await createClient();

    let query = supabase
      .from("eligibility_verdicts")
      .select("id, loan_case_id, bank_product_id, verdict, reasons, computed_at, requested_by_user_id")
      .eq("loan_case_id", loanCaseId)
      .order("computed_at", { ascending: false });

    if (bankProductId) {
      query = query.eq("bank_product_id", bankProductId);
    }

    const { data, error } = await query;

    if (error) {
      console.error(`[getEligibilityVerdictsForCase] query failed. code=${error.code ?? "unknown"} message=${error.message}`);
      return { verdicts: [], error: error.message };
    }

    const verdicts: EligibilityVerdict[] = (data ?? []).map((row) => ({
      id: row.id,
      loanCaseId: row.loan_case_id,
      bankProductId: row.bank_product_id,
      verdict: row.verdict as EligibilityVerdict["verdict"],
      reasons: row.reasons as EligibilityReason[],
      computedAt: row.computed_at,
      requestedByUserId: row.requested_by_user_id,
    }));

    return { verdicts, error: null };
  } catch (unexpectedError) {
    const message = unexpectedError instanceof Error ? unexpectedError.message : "Unknown error";
    console.error(`[getEligibilityVerdictsForCase] Unexpected error: ${message}`);
    return { verdicts: [], error: message };
  }
}
