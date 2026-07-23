"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { STAFF_ROLES } from "@/lib/auth/staff-roles";
import { matchIncomeRecognitionRule } from "./match-income-rule";
import { recognizeIncome } from "./recognize-income";
import type { BorrowerProfile, IncomeRecognitionRule } from "./types";

/**
 * Server Actions for Income Knowledge (Sprint 6.3B-1). Not under
 * src/app/**\/actions.ts because there is no route/page for this sprint —
 * Server Actions don't require a page to exist. Follows
 * src/app/(app)/loan-cases/[id]/documents/actions.ts's extractDocumentData
 * shape exactly: resolve the actor server-side, check STAFF_ROLES for a
 * friendly error only, real enforcement is the RLS policies in
 * supabase/migrations/20260726020000_income_knowledge_rls.sql — the
 * STAFF_ROLES check below is a UX nicety, not a security boundary.
 *
 * Both functions are single-table inserts, so a plain Server Action is the
 * correct, minimal pattern here (no RPC) — same posture as
 * document_extractions' own insert path. There is no multi-table atomic
 * write in this module.
 *
 * Both functions Zod-validate their inputs before touching the database —
 * same "validate at the boundary" discipline as
 * src/app/(app)/loan-cases/new/actions.ts and
 * src/app/(app)/settings/mortgage-rules/actions.ts, adapted from a
 * FormData boundary (those callers) to a typed-argument boundary (this
 * module has no form/page this sprint). `value: unknown` on `recordEvidence`
 * is deliberately not given a Zod shape — it's genuinely open-ended jsonb,
 * matching the `evidence.value` column's own open-vocabulary design.
 */

const uuidField = (label: string) => z.string().trim().uuid(`Invalid ${label}.`);
const optionalUuidField = (label: string) => uuidField(label).nullable().optional();

async function resolveActorProfileId(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string | null> {
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) return null;

  const { data: profileRow } = await supabase.from("user_profiles").select("id").eq("auth_user_id", authUser.id).maybeSingle();

  return profileRow?.id ?? null;
}

export type RecordEvidenceState = {
  evidenceId: string | null;
  error: string | null;
};

const recordEvidenceSchema = z.object({
  loanCaseId: uuidField("loan case id"),
  evidenceType: z.string().trim().min(1, "evidenceType is required."),
  sourceType: z.string().trim().min(1, "sourceType is required."),
  sourceDocumentId: optionalUuidField("source document id"),
  sourceExtractionId: optionalUuidField("source extraction id"),
  sourceNote: z.string().trim().nullable().optional(),
});

/**
 * Inserts one row into `evidence`. Append-only — there is no update/edit
 * action; a correction is always a new row (see `superseded_by_evidence_id`
 * on the `evidence` table).
 */
export async function recordEvidence(
  loanCaseId: string,
  evidenceType: string,
  value: unknown,
  sourceType: string,
  sourceDocumentId?: string | null,
  sourceExtractionId?: string | null,
  sourceNote?: string | null,
): Promise<RecordEvidenceState> {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return { evidenceId: null, error: "Your session has expired. Please sign in again." };
  }
  if (!STAFF_ROLES.has(currentUser.role)) {
    return { evidenceId: null, error: "You do not have permission to record evidence." };
  }

  const parsed = recordEvidenceSchema.safeParse({
    loanCaseId,
    evidenceType,
    sourceType,
    sourceDocumentId: sourceDocumentId ?? null,
    sourceExtractionId: sourceExtractionId ?? null,
    sourceNote: sourceNote ?? null,
  });

  if (!parsed.success) {
    return { evidenceId: null, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const input = parsed.data;

  const supabase = await createClient();

  // Resolved server-side, never trusted from the caller — same pattern as
  // uploaded_by_user_id / extracted_by_user_id elsewhere in this codebase.
  const capturedByUserId = await resolveActorProfileId(supabase);

  const { data: insertedRow, error: insertError } = await supabase
    .from("evidence")
    .insert({
      loan_case_id: input.loanCaseId,
      evidence_type: input.evidenceType,
      value: value as never,
      source_type: input.sourceType,
      source_document_id: input.sourceDocumentId ?? null,
      source_extraction_id: input.sourceExtractionId ?? null,
      source_note: input.sourceNote ?? null,
      captured_by_user_id: capturedByUserId,
    })
    .select("id")
    .maybeSingle();

  if (insertError) {
    console.error(`[recordEvidence] insert failed. code=${insertError.code ?? "unknown"} message=${insertError.message}`);
    const isPermissionError = insertError.code === "42501" || insertError.message.toLowerCase().includes("row-level security");
    return {
      evidenceId: null,
      error: isPermissionError
        ? "You do not have permission to record evidence for this case."
        : "Something went wrong while recording evidence. Please try again.",
    };
  }

  return { evidenceId: insertedRow?.id ?? null, error: null };
}

export type ComputeIncomeRecognitionState = {
  derivationResultId: string | null;
  recognizedAmount: number | null;
  error: string | null;
};

type IncomeRecognitionRuleRow = {
  id: string;
  bank_id: string;
  bank_product_id: string | null;
  rule_name: string;
  income_source_type: string;
  nationality: string | null;
  income_country: string | null;
  employment_type: string | null;
  income_structure: string | null;
  recognition_method: IncomeRecognitionRule["recognitionMethod"];
  haircut_percentage: number | null;
  averaging_window_months: number | null;
  minimum_history_months: number | null;
  description: string | null;
  version: number;
  is_active: boolean;
  effective_from: string | null;
  effective_to: string | null;
  created_at: string;
  updated_at: string;
};

function mapRuleRow(row: IncomeRecognitionRuleRow): IncomeRecognitionRule {
  return {
    id: row.id,
    bankId: row.bank_id,
    bankProductId: row.bank_product_id,
    ruleName: row.rule_name,
    incomeSourceType: row.income_source_type,
    nationality: row.nationality,
    incomeCountry: row.income_country,
    employmentType: row.employment_type,
    incomeStructure: row.income_structure,
    recognitionMethod: row.recognition_method,
    haircutPercentage: row.haircut_percentage,
    averagingWindowMonths: row.averaging_window_months,
    minimumHistoryMonths: row.minimum_history_months,
    description: row.description,
    version: row.version,
    isActive: row.is_active,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const computeIncomeRecognitionSchema = z.object({
  loanCaseId: uuidField("loan case id"),
  bankId: uuidField("bank id"),
  bankProductId: uuidField("bank product id"),
  evidenceIds: z.array(uuidField("evidence id")).min(1, "At least one evidence id is required."),
});

/**
 * Reads the relevant `evidence` rows and active `income_recognition_rules`
 * for a bank/product, matches a rule, recognizes an income figure from it,
 * and inserts one row into `derivation_results` (domain =
 * "income_recognition"). Append-only, like `recordEvidence` — a
 * recomputation is always a new row, never an update to a prior result.
 *
 * `evidenceIds` rows are assumed to hold a raw numeric income figure in
 * `value` (e.g. evidence_type = "recognized_raw_income") — a data-shape
 * assumption this sprint's brief did not fully specify; see report.
 */
export async function computeIncomeRecognition(
  loanCaseId: string,
  bankId: string,
  bankProductId: string,
  evidenceIds: string[],
): Promise<ComputeIncomeRecognitionState> {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return { derivationResultId: null, recognizedAmount: null, error: "Your session has expired. Please sign in again." };
  }
  if (!STAFF_ROLES.has(currentUser.role)) {
    return { derivationResultId: null, recognizedAmount: null, error: "You do not have permission to compute income recognition." };
  }

  const parsed = computeIncomeRecognitionSchema.safeParse({ loanCaseId, bankId, bankProductId, evidenceIds });
  if (!parsed.success) {
    return { derivationResultId: null, recognizedAmount: null, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const input = parsed.data;

  const supabase = await createClient();

  const { data: caseRow, error: caseError } = await supabase
    .from("loan_cases")
    .select("id, nationality, income_country, employment_type, income_structure")
    .eq("id", input.loanCaseId)
    .maybeSingle();

  if (caseError) {
    console.error(`[computeIncomeRecognition] loan_cases lookup failed. code=${caseError.code ?? "unknown"} message=${caseError.message}`);
    return { derivationResultId: null, recognizedAmount: null, error: "Something went wrong while reading the case. Please try again." };
  }
  if (!caseRow) {
    return { derivationResultId: null, recognizedAmount: null, error: "Case not found or not accessible." };
  }

  // Cross-check bankProductId actually belongs to bankId before proceeding
  // — two independent parameters could otherwise be a mismatched pair,
  // producing a derivation_results row that misattributes which bank's
  // rules produced a figure for which product. Same "validate then
  // proceed" shape as create_loan_case's existing-customer-id check
  // (supabase/migrations/20260716020000_create_loan_case_rpc.sql), done in
  // TypeScript here since this isn't a multi-table atomic write.
  const { data: bankProductRow, error: bankProductError } = await supabase
    .from("bank_products")
    .select("id, bank_id")
    .eq("id", input.bankProductId)
    .maybeSingle();

  if (bankProductError) {
    console.error(
      `[computeIncomeRecognition] bank_products lookup failed. code=${bankProductError.code ?? "unknown"} message=${bankProductError.message}`,
    );
    return { derivationResultId: null, recognizedAmount: null, error: "Something went wrong while reading the bank product. Please try again." };
  }
  if (!bankProductRow || bankProductRow.bank_id !== input.bankId) {
    return { derivationResultId: null, recognizedAmount: null, error: "The selected bank product does not belong to the selected bank." };
  }

  const profile: BorrowerProfile = {
    nationality: caseRow.nationality,
    incomeCountry: caseRow.income_country,
    employmentType: caseRow.employment_type,
    incomeStructure: caseRow.income_structure,
  };

  const { data: evidenceRows, error: evidenceError } = await supabase
    .from("evidence")
    .select("id, value, captured_at")
    .eq("loan_case_id", input.loanCaseId)
    .in("id", input.evidenceIds);

  if (evidenceError) {
    console.error(`[computeIncomeRecognition] evidence lookup failed. code=${evidenceError.code ?? "unknown"} message=${evidenceError.message}`);
    return { derivationResultId: null, recognizedAmount: null, error: "Something went wrong while reading evidence. Please try again." };
  }
  if (!evidenceRows || evidenceRows.length === 0) {
    return { derivationResultId: null, recognizedAmount: null, error: "None of the supplied evidence ids were found for this case." };
  }
  // Audit-trail integrity: this function only computes from the evidence
  // rows that actually exist and belong to this case. If the caller passed
  // an id that doesn't (a typo, a different case's id, or an id RLS hid),
  // silently proceeding with fewer rows than requested would let a bogus id
  // still get persisted below as if it contributed to the result — don't
  // guess at partial intent, fail clearly instead.
  if (evidenceRows.length !== input.evidenceIds.length) {
    return { derivationResultId: null, recognizedAmount: null, error: "One or more evidence ids were not found for this case." };
  }

  // Most-recent-first, matching recognizeIncome's documented ordering
  // assumption (index 0 = latest for full_value/percentage_haircut; the
  // first `averagingWindowMonths` entries for rolling_average).
  const sortedRows = [...evidenceRows].sort(
    (a, b) => new Date(b.captured_at as string).getTime() - new Date(a.captured_at as string).getTime(),
  );

  const rawFigures: number[] = [];
  for (const row of sortedRows) {
    if (typeof row.value !== "number") {
      return {
        derivationResultId: null,
        recognizedAmount: null,
        error: `Evidence ${row.id} does not contain a numeric income figure.`,
      };
    }
    rawFigures.push(row.value);
  }

  const { data: ruleRows, error: rulesError } = await supabase
    .from("income_recognition_rules")
    .select(
      "id, bank_id, bank_product_id, rule_name, income_source_type, nationality, income_country, employment_type, income_structure, recognition_method, haircut_percentage, averaging_window_months, minimum_history_months, description, version, is_active, effective_from, effective_to, created_at, updated_at",
    )
    .eq("bank_id", input.bankId)
    .eq("is_active", true)
    .order("updated_at", { ascending: false });

  if (rulesError) {
    console.error(`[computeIncomeRecognition] rules lookup failed. code=${rulesError.code ?? "unknown"} message=${rulesError.message}`);
    return { derivationResultId: null, recognizedAmount: null, error: "Something went wrong while reading income recognition rules. Please try again." };
  }

  const rules: IncomeRecognitionRule[] = (ruleRows ?? []).map((row) => mapRuleRow(row as IncomeRecognitionRuleRow));

  const matchedRule = matchIncomeRecognitionRule(input.bankId, input.bankProductId, profile, rules);
  if (!matchedRule) {
    return {
      derivationResultId: null,
      recognizedAmount: null,
      error: "No income recognition rule matched this bank, product, and borrower profile.",
    };
  }

  const recognized = recognizeIncome(matchedRule, rawFigures);
  if ("error" in recognized) {
    return { derivationResultId: null, recognizedAmount: null, error: recognized.error };
  }

  const computedByUserId = await resolveActorProfileId(supabase);

  const { data: insertedRow, error: insertError } = await supabase
    .from("derivation_results")
    .insert({
      loan_case_id: input.loanCaseId,
      bank_product_id: input.bankProductId,
      domain: "income_recognition",
      rule_id: matchedRule.id,
      rule_version: matchedRule.version,
      // Persist exactly the evidence rows actually fetched/used above, never
      // the raw caller-supplied array — this can never diverge from what
      // truly contributed to the result, even though at this point (past
      // the length check above) the two arrays already contain the same
      // ids, just potentially in a different order.
      input_evidence_ids: evidenceRows.map((row) => row.id),
      result_value: recognized.recognizedAmount,
      computed_by_user_id: computedByUserId,
    })
    .select("id")
    .maybeSingle();

  if (insertError) {
    console.error(`[computeIncomeRecognition] insert failed. code=${insertError.code ?? "unknown"} message=${insertError.message}`);
    return {
      derivationResultId: null,
      recognizedAmount: null,
      error: "Computation succeeded but the result could not be saved. Please try again.",
    };
  }

  return { derivationResultId: insertedRow?.id ?? null, recognizedAmount: recognized.recognizedAmount, error: null };
}
