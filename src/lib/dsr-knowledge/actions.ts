"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { STAFF_ROLES } from "@/lib/auth/staff-roles";
import { matchDsrRule } from "./match-dsr-rule";
import { computeDsr } from "./compute-dsr";
import type { DsrRule } from "./types";

/**
 * Server Actions for DSR Rules Knowledge (Sprint 6.3B-3). Follows
 * src/lib/income-knowledge/actions.ts's and
 * src/lib/commitment-knowledge/actions.ts's shape exactly: resolve the
 * actor server-side, check STAFF_ROLES for a friendlier error only — real
 * enforcement is RLS (this app-level role check is a UX nicety, not a
 * security boundary; see docs/architecture/security.md and
 * docs/decisions/0002-rls-as-sole-authorization-boundary.md).
 *
 * `computeDsrForCase` is a single-table insert into `derivation_results`, so
 * a plain Server Action is the correct, minimal pattern here (no RPC) —
 * same reasoning as `computeIncomeRecognition` / `computeCommitmentRecognition`.
 *
 * Unlike the other two domains, DSR does not read `evidence` directly — its
 * inputs are `derivation_results` rows produced by Income Recognition and
 * Commitment Recognition (see match-dsr-rule.ts / compute-dsr.ts for the
 * matching/computation shape). `input_evidence_ids` is therefore always `[]`
 * on the row this function inserts — that column is documented specifically
 * as holding `evidence.id` values, not `derivation_results.id` values; the
 * contributing derivation_results ids are instead recorded inside
 * `result_value` itself, the same "domain-specific shape" precedent ADR
 * 0011 established for Commitment Knowledge's `result_value`.
 */

const uuidField = (label: string) => z.string().trim().uuid(`Invalid ${label}.`);

async function resolveActorProfileId(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string | null> {
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) return null;

  const { data: profileRow } = await supabase.from("user_profiles").select("id").eq("auth_user_id", authUser.id).maybeSingle();

  return profileRow?.id ?? null;
}

export type ComputeDsrForCaseState = {
  derivationResultId: string | null;
  dsrRatio: number | null;
  passed: boolean | null;
  error: string | null;
};

type DsrRuleRow = {
  id: string;
  bank_id: string;
  bank_product_id: string | null;
  rule_name: string;
  max_dsr_percentage: number | null;
  stress_test_rate_buffer_percentage: number | null;
  income_tier_lower_bound: number | null;
  income_tier_upper_bound: number | null;
  description: string | null;
  version: number;
  is_active: boolean;
  effective_from: string | null;
  effective_to: string | null;
  created_at: string;
  updated_at: string;
};

function mapRuleRow(row: DsrRuleRow): DsrRule {
  return {
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
  };
}

const computeDsrForCaseSchema = z.object({
  loanCaseId: uuidField("loan case id"),
  bankId: uuidField("bank id"),
  bankProductId: uuidField("bank product id"),
  incomeDerivationResultIds: z.array(uuidField("income derivation result id")).min(1, "At least one income derivation result id is required."),
  commitmentDerivationResultIds: z
    .array(uuidField("commitment derivation result id"))
    .min(1, "At least one commitment derivation result id is required."),
  proposedInstalmentAmount: z.number().nonnegative("proposedInstalmentAmount must not be negative."),
});

/**
 * Reads the relevant `derivation_results` rows for Income Recognition and
 * Commitment Recognition (never raw `evidence` — see module doc comment),
 * sums each domain's recognized figures, matches an active `dsr_rules` row
 * against the resulting recognized-income figure, computes the DSR ratio,
 * and inserts one row into `derivation_results` (domain = "dsr").
 * Append-only, like `computeIncomeRecognition` / `computeCommitmentRecognition`
 * — a recomputation is always a new row, never an update to a prior result.
 *
 * `proposedInstalmentAmount` is an already-computed, opaque figure supplied
 * by the caller — this function does not compute an amortization/stress-test
 * instalment itself (see compute-dsr.ts's doc comment and this sprint's
 * scope boundary).
 */
export async function computeDsrForCase(
  loanCaseId: string,
  bankId: string,
  bankProductId: string,
  incomeDerivationResultIds: string[],
  commitmentDerivationResultIds: string[],
  proposedInstalmentAmount: number,
): Promise<ComputeDsrForCaseState> {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return { derivationResultId: null, dsrRatio: null, passed: null, error: "Your session has expired. Please sign in again." };
  }
  if (!STAFF_ROLES.has(currentUser.role)) {
    return { derivationResultId: null, dsrRatio: null, passed: null, error: "You do not have permission to compute a DSR ratio." };
  }

  const parsed = computeDsrForCaseSchema.safeParse({
    loanCaseId,
    bankId,
    bankProductId,
    incomeDerivationResultIds,
    commitmentDerivationResultIds,
    proposedInstalmentAmount,
  });
  if (!parsed.success) {
    return { derivationResultId: null, dsrRatio: null, passed: null, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const input = parsed.data;

  const supabase = await createClient();

  // Cross-check bankProductId actually belongs to bankId before proceeding
  // — same "validate then proceed" pattern computeIncomeRecognition /
  // computeCommitmentRecognition use, preventing a derivation_results row
  // that misattributes which bank's rules produced a figure for which
  // product.
  const { data: bankProductRow, error: bankProductError } = await supabase
    .from("bank_products")
    .select("id, bank_id")
    .eq("id", input.bankProductId)
    .maybeSingle();

  if (bankProductError) {
    console.error(`[computeDsrForCase] bank_products lookup failed. code=${bankProductError.code ?? "unknown"} message=${bankProductError.message}`);
    return { derivationResultId: null, dsrRatio: null, passed: null, error: "Something went wrong while reading the bank product. Please try again." };
  }
  if (!bankProductRow || bankProductRow.bank_id !== input.bankId) {
    return { derivationResultId: null, dsrRatio: null, passed: null, error: "The selected bank product does not belong to the selected bank." };
  }

  // Income inputs: derivation_results rows, not evidence — DSR consumes
  // Income Recognition's own outputs.
  const { data: incomeRows, error: incomeError } = await supabase
    .from("derivation_results")
    .select("id, result_value")
    .eq("loan_case_id", input.loanCaseId)
    .eq("bank_product_id", input.bankProductId)
    .eq("domain", "income_recognition")
    .in("id", input.incomeDerivationResultIds);

  if (incomeError) {
    console.error(`[computeDsrForCase] income derivation_results lookup failed. code=${incomeError.code ?? "unknown"} message=${incomeError.message}`);
    return { derivationResultId: null, dsrRatio: null, passed: null, error: "Something went wrong while reading income derivation results. Please try again." };
  }
  // Audit-trail integrity: only compute from derivation_results rows that
  // actually exist, belong to this case/product, and are the right domain —
  // same discipline computeIncomeRecognition / computeCommitmentRecognition
  // apply to their own inputs. Silently proceeding with fewer rows than
  // requested would let a bogus id still get persisted below as if it
  // contributed to the result.
  if (!incomeRows || incomeRows.length !== input.incomeDerivationResultIds.length) {
    return { derivationResultId: null, dsrRatio: null, passed: null, error: "One or more income derivation result ids were not found for this case and bank product." };
  }

  let totalRecognizedIncome = 0;
  for (const row of incomeRows) {
    if (typeof row.result_value !== "number") {
      return {
        derivationResultId: null,
        dsrRatio: null,
        passed: null,
        error: `Income derivation result ${row.id} does not contain a numeric result_value.`,
      };
    }
    totalRecognizedIncome += row.result_value;
  }

  // Commitment inputs: derivation_results rows, not evidence — same
  // reasoning as income above.
  const { data: commitmentRows, error: commitmentError } = await supabase
    .from("derivation_results")
    .select("id, result_value")
    .eq("loan_case_id", input.loanCaseId)
    .eq("bank_product_id", input.bankProductId)
    .eq("domain", "commitment_recognition")
    .in("id", input.commitmentDerivationResultIds);

  if (commitmentError) {
    console.error(
      `[computeDsrForCase] commitment derivation_results lookup failed. code=${commitmentError.code ?? "unknown"} message=${commitmentError.message}`,
    );
    return {
      derivationResultId: null,
      dsrRatio: null,
      passed: null,
      error: "Something went wrong while reading commitment derivation results. Please try again.",
    };
  }
  if (!commitmentRows || commitmentRows.length !== input.commitmentDerivationResultIds.length) {
    return {
      derivationResultId: null,
      dsrRatio: null,
      passed: null,
      error: "One or more commitment derivation result ids were not found for this case and bank product.",
    };
  }

  let totalRecognizedCommitments = 0;
  for (const row of commitmentRows) {
    // Commitment's result_value is an OBJECT ({ recognizedAmount,
    // isToBeSettled, settlementExclusionApplied }), not a bare number,
    // unlike income's — see src/lib/commitment-knowledge/actions.ts.
    const recognizedAmount = (row.result_value as { recognizedAmount?: unknown } | null)?.recognizedAmount;
    if (typeof recognizedAmount !== "number") {
      return {
        derivationResultId: null,
        dsrRatio: null,
        passed: null,
        error: `Commitment derivation result ${row.id} does not contain a numeric result_value.recognizedAmount.`,
      };
    }
    totalRecognizedCommitments += recognizedAmount;
  }

  const { data: ruleRows, error: rulesError } = await supabase
    .from("dsr_rules")
    .select(
      "id, bank_id, bank_product_id, rule_name, max_dsr_percentage, stress_test_rate_buffer_percentage, income_tier_lower_bound, income_tier_upper_bound, description, version, is_active, effective_from, effective_to, created_at, updated_at",
    )
    .eq("bank_id", input.bankId)
    .eq("is_active", true)
    .order("updated_at", { ascending: false });

  if (rulesError) {
    console.error(`[computeDsrForCase] rules lookup failed. code=${rulesError.code ?? "unknown"} message=${rulesError.message}`);
    return { derivationResultId: null, dsrRatio: null, passed: null, error: "Something went wrong while reading DSR rules. Please try again." };
  }

  const rules: DsrRule[] = (ruleRows ?? []).map((row) => mapRuleRow(row as DsrRuleRow));

  const matchedRule = matchDsrRule(input.bankId, input.bankProductId, totalRecognizedIncome, rules);
  if (!matchedRule) {
    return { derivationResultId: null, dsrRatio: null, passed: null, error: "No DSR rule matched this bank, product, and recognized income." };
  }

  const computed = computeDsr(matchedRule, totalRecognizedIncome, totalRecognizedCommitments, input.proposedInstalmentAmount);
  if ("error" in computed) {
    return { derivationResultId: null, dsrRatio: null, passed: null, error: computed.error };
  }

  const computedByUserId = await resolveActorProfileId(supabase);

  const { data: insertedRow, error: insertError } = await supabase
    .from("derivation_results")
    .insert({
      loan_case_id: input.loanCaseId,
      bank_product_id: input.bankProductId,
      domain: "dsr",
      rule_id: matchedRule.id,
      rule_version: matchedRule.version,
      // DSR does not consume evidence directly — input_evidence_ids is
      // documented specifically as holding evidence.id values, not
      // derivation_results.id values. The contributing derivation_results
      // ids are recorded inside result_value below instead. See module doc
      // comment.
      input_evidence_ids: [],
      // A rich, self-explanatory object — same "audit trail should be able
      // to answer why" spirit as the settlement-exclusion fix in Commitment
      // Knowledge (ADR 0011). Uses the verified/fetched ids, not the raw
      // caller-supplied parameters — same integrity discipline as both
      // prior sprints.
      result_value: {
        dsrRatio: computed.dsrRatio,
        maxDsrPercentage: computed.maxDsrPercentage,
        passed: computed.passed,
        stressTestRateBufferPercentage: computed.stressTestRateBufferPercentage,
        totalRecognizedIncome,
        totalRecognizedCommitments,
        proposedInstalmentAmount: input.proposedInstalmentAmount,
        incomeDerivationResultIds: incomeRows.map((row) => row.id),
        commitmentDerivationResultIds: commitmentRows.map((row) => row.id),
      },
      computed_by_user_id: computedByUserId,
    })
    .select("id")
    .maybeSingle();

  if (insertError) {
    console.error(`[computeDsrForCase] insert failed. code=${insertError.code ?? "unknown"} message=${insertError.message}`);
    return { derivationResultId: null, dsrRatio: null, passed: null, error: "Computation succeeded but the result could not be saved. Please try again." };
  }

  return { derivationResultId: insertedRow?.id ?? null, dsrRatio: computed.dsrRatio, passed: computed.passed, error: null };
}
