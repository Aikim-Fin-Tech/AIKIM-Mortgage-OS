import { createClient } from "@/lib/supabase/server";
import type { DsrRule } from "@/lib/dsr-knowledge/types";

/**
 * Read-only data access for DSR Rules Knowledge (Sprint 6.3B-3). Same
 * contract as every other file in this directory: never throw, return
 * `{ ..., error }`, log `code`/`message` only.
 *
 * `getDsrRules` reads reference data — same posture as
 * getIncomeRecognitionRules / getCommitmentRecognitionRules: no app-level
 * role check is needed here (assumed no-role-check select RLS policy, same
 * shape as the prior two domains' rule tables).
 *
 * `getBanks`, `getBankProducts`, `getEvidenceForCase`, and
 * `getDerivationResultsForCase` already exist and are domain-agnostic — not
 * duplicated here; import from src/lib/database/income-knowledge.ts.
 */

export type GetDsrRulesResult = {
  rules: DsrRule[];
  error: string | null;
};

/** `bankId` narrows to one bank's rules; omitted, returns every bank's rules. */
export async function getDsrRules(bankId?: string): Promise<GetDsrRulesResult> {
  try {
    const supabase = await createClient();

    let query = supabase
      .from("dsr_rules")
      .select(
        "id, bank_id, bank_product_id, rule_name, max_dsr_percentage, stress_test_rate_buffer_percentage, income_tier_lower_bound, income_tier_upper_bound, description, version, is_active, effective_from, effective_to, created_at, updated_at",
      )
      .order("updated_at", { ascending: false });

    if (bankId) {
      query = query.eq("bank_id", bankId);
    }

    const { data, error } = await query;

    if (error) {
      console.error(`[getDsrRules] query failed. code=${error.code ?? "unknown"} message=${error.message}`);
      return { rules: [], error: error.message };
    }

    const rules: DsrRule[] = (data ?? []).map((row) => ({
      id: row.id,
      bankId: row.bank_id,
      bankProductId: row.bank_product_id,
      ruleName: row.rule_name,
      maxDsrPercentage: row.max_dsr_percentage,
      stressTestRateBufferPercentage: row.stress_test_rate_buffer_percentage,
      incomeTierLowerBound: row.income_tier_lower_bound,
      incomeTierUpperBound: row.income_tier_upper_bound,
      description: row.description,
      version: row.version,
      isActive: row.is_active,
      effectiveFrom: row.effective_from,
      effectiveTo: row.effective_to,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return { rules, error: null };
  } catch (unexpectedError) {
    const message = unexpectedError instanceof Error ? unexpectedError.message : "Unknown error";
    console.error(`[getDsrRules] Unexpected error: ${message}`);
    return { rules: [], error: message };
  }
}
