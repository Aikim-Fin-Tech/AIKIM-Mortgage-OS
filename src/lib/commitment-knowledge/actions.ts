"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { STAFF_ROLES } from "@/lib/auth/staff-roles";
import { matchCommitmentRecognitionRule } from "./match-commitment-rule";
import { recognizeCommitment } from "./recognize-commitment";
import type { CommitmentRecognitionRule } from "./types";

/**
 * Server Actions for Commitment Knowledge (Sprint 6.3B-2). Follows
 * src/lib/income-knowledge/actions.ts's shape exactly: resolve the actor
 * server-side, check STAFF_ROLES for a friendlier error only — real
 * enforcement is the RLS policies in
 * supabase/migrations/20260727020000_commitment_knowledge_rls.sql. This
 * app-level role check is a UX nicety, not a security boundary.
 *
 * `recordEvidence` is deliberately NOT redefined here — `evidence` is
 * domain-agnostic (built once in Sprint 6.3B-1, reused as-is by every
 * domain including this one). Callers recording a raw commitment figure as
 * Evidence should import and call `recordEvidence` directly from
 * src/lib/income-knowledge/actions.ts.
 *
 * `computeCommitmentRecognition` is a single-table insert into
 * `derivation_results`, so a plain Server Action is the correct, minimal
 * pattern here (no RPC) — same reasoning as `computeIncomeRecognition`.
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

export type ComputeCommitmentRecognitionState = {
  derivationResultId: string | null;
  recognizedAmount: number | null;
  error: string | null;
};

type CommitmentRecognitionRuleRow = {
  id: string;
  bank_id: string;
  bank_product_id: string | null;
  rule_name: string;
  commitment_type: string;
  recognition_method: string | null;
  recognition_percentage: number | null;
  allows_to_be_settled_exclusion: boolean;
  description: string | null;
  version: number;
  is_active: boolean;
  effective_from: string | null;
  effective_to: string | null;
  created_at: string;
  updated_at: string;
};

function mapRuleRow(row: CommitmentRecognitionRuleRow): CommitmentRecognitionRule {
  return {
    id: row.id,
    bankId: row.bank_id,
    bankProductId: row.bank_product_id,
    ruleName: row.rule_name,
    commitmentType: row.commitment_type,
    recognitionMethod: row.recognition_method,
    recognitionPercentage: row.recognition_percentage,
    allowsToBeSettledExclusion: row.allows_to_be_settled_exclusion,
    description: row.description,
    version: row.version,
    isActive: row.is_active,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const computeCommitmentRecognitionSchema = z.object({
  loanCaseId: uuidField("loan case id"),
  bankId: uuidField("bank id"),
  bankProductId: uuidField("bank product id"),
  commitmentType: z.string().trim().min(1, "commitmentType is required."),
  evidenceId: uuidField("evidence id"),
  isToBeSettled: z.boolean(),
});

/**
 * Reads the one relevant `evidence` row and active
 * `commitment_recognition_rules` for a bank/product/commitment type,
 * matches a rule, recognizes a commitment figure from it (applying the "to
 * be settled" exclusion when applicable), and inserts one row into
 * `derivation_results` (domain = "commitment_recognition"). Append-only,
 * like `computeIncomeRecognition` — a recomputation is always a new row,
 * never an update to a prior result.
 *
 * The `evidence` row is assumed to hold a raw numeric commitment figure in
 * `value` (e.g. evidence_type = "existing_commitment_instalment") — same
 * data-shape assumption `computeIncomeRecognition` makes for income figures.
 */
export async function computeCommitmentRecognition(
  loanCaseId: string,
  bankId: string,
  bankProductId: string,
  commitmentType: string,
  evidenceId: string,
  isToBeSettled: boolean,
): Promise<ComputeCommitmentRecognitionState> {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return { derivationResultId: null, recognizedAmount: null, error: "Your session has expired. Please sign in again." };
  }
  if (!STAFF_ROLES.has(currentUser.role)) {
    return { derivationResultId: null, recognizedAmount: null, error: "You do not have permission to compute commitment recognition." };
  }

  const parsed = computeCommitmentRecognitionSchema.safeParse({
    loanCaseId,
    bankId,
    bankProductId,
    commitmentType,
    evidenceId,
    isToBeSettled,
  });
  if (!parsed.success) {
    return { derivationResultId: null, recognizedAmount: null, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const input = parsed.data;

  const supabase = await createClient();

  // Cross-check bankProductId actually belongs to bankId before proceeding
  // — same "validate then proceed" pattern computeIncomeRecognition uses,
  // preventing a derivation_results row that misattributes which bank's
  // rules produced a figure for which product.
  const { data: bankProductRow, error: bankProductError } = await supabase
    .from("bank_products")
    .select("id, bank_id")
    .eq("id", input.bankProductId)
    .maybeSingle();

  if (bankProductError) {
    console.error(
      `[computeCommitmentRecognition] bank_products lookup failed. code=${bankProductError.code ?? "unknown"} message=${bankProductError.message}`,
    );
    return { derivationResultId: null, recognizedAmount: null, error: "Something went wrong while reading the bank product. Please try again." };
  }
  if (!bankProductRow || bankProductRow.bank_id !== input.bankId) {
    return { derivationResultId: null, recognizedAmount: null, error: "The selected bank product does not belong to the selected bank." };
  }

  const { data: evidenceRow, error: evidenceError } = await supabase
    .from("evidence")
    .select("id, value")
    .eq("loan_case_id", input.loanCaseId)
    .eq("id", input.evidenceId)
    .maybeSingle();

  if (evidenceError) {
    console.error(`[computeCommitmentRecognition] evidence lookup failed. code=${evidenceError.code ?? "unknown"} message=${evidenceError.message}`);
    return { derivationResultId: null, recognizedAmount: null, error: "Something went wrong while reading evidence. Please try again." };
  }
  if (!evidenceRow) {
    return { derivationResultId: null, recognizedAmount: null, error: "The supplied evidence id was not found for this case." };
  }
  if (typeof evidenceRow.value !== "number") {
    return { derivationResultId: null, recognizedAmount: null, error: `Evidence ${evidenceRow.id} does not contain a numeric commitment figure.` };
  }
  const rawFigure = evidenceRow.value;

  const { data: ruleRows, error: rulesError } = await supabase
    .from("commitment_recognition_rules")
    .select(
      "id, bank_id, bank_product_id, rule_name, commitment_type, recognition_method, recognition_percentage, allows_to_be_settled_exclusion, description, version, is_active, effective_from, effective_to, created_at, updated_at",
    )
    .eq("bank_id", input.bankId)
    .eq("is_active", true)
    .order("updated_at", { ascending: false });

  if (rulesError) {
    console.error(`[computeCommitmentRecognition] rules lookup failed. code=${rulesError.code ?? "unknown"} message=${rulesError.message}`);
    return {
      derivationResultId: null,
      recognizedAmount: null,
      error: "Something went wrong while reading commitment recognition rules. Please try again.",
    };
  }

  const rules: CommitmentRecognitionRule[] = (ruleRows ?? []).map((row) => mapRuleRow(row as CommitmentRecognitionRuleRow));

  const matchedRule = matchCommitmentRecognitionRule(input.bankId, input.bankProductId, input.commitmentType, rules);
  if (!matchedRule) {
    return {
      derivationResultId: null,
      recognizedAmount: null,
      error: "No commitment recognition rule matched this bank, product, and commitment type.",
    };
  }

  const recognized = recognizeCommitment(matchedRule, rawFigure, input.isToBeSettled);
  if ("error" in recognized) {
    return { derivationResultId: null, recognizedAmount: null, error: recognized.error };
  }

  const computedByUserId = await resolveActorProfileId(supabase);

  const { data: insertedRow, error: insertError } = await supabase
    .from("derivation_results")
    .insert({
      loan_case_id: input.loanCaseId,
      bank_product_id: input.bankProductId,
      domain: "commitment_recognition",
      rule_id: matchedRule.id,
      rule_version: matchedRule.version,
      // Persist the one verified evidence row's id actually read above, not
      // the raw parameter — same audit-trail-integrity fix
      // computeIncomeRecognition needed.
      input_evidence_ids: [evidenceRow.id],
      // An object, not a bare number (unlike income_recognition's
      // result_value) — a result_value of 0 from a legitimate
      // full_instalment computation on a zero-balance commitment is
      // otherwise indistinguishable from one produced by the settlement
      // exclusion. isToBeSettled/settlementExclusionApplied are always
      // included, even when false, so every row in this domain is
      // self-explanatory about whether the exclusion was a live
      // possibility and whether it fired. Security-review fix, Sprint 6.3B-2.
      result_value: {
        recognizedAmount: recognized.recognizedAmount,
        isToBeSettled: input.isToBeSettled,
        settlementExclusionApplied: recognized.settlementExclusionApplied,
      },
      computed_by_user_id: computedByUserId,
    })
    .select("id")
    .maybeSingle();

  if (insertError) {
    console.error(`[computeCommitmentRecognition] insert failed. code=${insertError.code ?? "unknown"} message=${insertError.message}`);
    return {
      derivationResultId: null,
      recognizedAmount: null,
      error: "Computation succeeded but the result could not be saved. Please try again.",
    };
  }

  return { derivationResultId: insertedRow?.id ?? null, recognizedAmount: recognized.recognizedAmount, error: null };
}
