"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { STAFF_ROLES } from "@/lib/auth/staff-roles";
import { matchPropertyRule } from "./match-property-rule";
import type { PropertyRule } from "./types";

/**
 * Server Actions for Property Rules Knowledge (Sprint 6.3B-4). Follows
 * src/lib/income-knowledge/actions.ts's, src/lib/commitment-knowledge/actions.ts's,
 * and src/lib/dsr-knowledge/actions.ts's shape exactly: resolve the actor
 * server-side, check STAFF_ROLES for a friendlier error only — real
 * enforcement is RLS (this app-level role check is a UX nicety, not a
 * security boundary; see docs/architecture/security.md).
 *
 * `computePropertyRulesForCase` is a single-table insert into
 * `derivation_results`, so a plain Server Action is the correct, minimal
 * pattern here (no RPC) — same reasoning as every prior domain.
 *
 * Property Rules is a lookup, not a "recognition" with a transformation
 * formula: given a matched rule, the "computed" result IS that rule's
 * `marginOfFinancePercentage`/`maxTenureYears`, passed through as-is (both
 * may be `null` if not yet configured — not an error). There is no separate
 * compute module here, unlike Income/Commitment/DSR's compute-*.ts files.
 *
 * Unlike Income Recognition's array of same-typed income figures, this
 * domain's four evidence inputs each play a distinct, non-interchangeable
 * role (property type / construction status / occupancy intent / existing
 * property count) — they are taken as four separate, named parameters, not
 * an array. Each fetched evidence row is bound to its corresponding
 * parameter by id (never guessed by content) and then verified to actually
 * be evidence of the right kind for that slot via an `evidence_type`
 * discriminator check (see EXPECTED_EVIDENCE_TYPE below), in addition to the
 * id/case and `typeof value` checks. The `evidence_type` check matters
 * specifically because propertyType/constructionStatus/occupancyIntent are
 * all string-valued and all unconstrained open text — without it, a caller
 * transposing e.g. the construction-status evidence id into the
 * occupancyIntentEvidenceId slot would pass every other check (distinct id,
 * belongs to this case, right JS type) and could silently produce a wrong
 * — or, if a bank's vocabularies happen to overlap as strings, a
 * coincidentally "matched" but wrong — lending-ceiling result.
 */

const uuidField = (label: string) => z.string().trim().uuid(`Invalid ${label}.`);

/**
 * Expected `evidence_type` value for each of the 4 named evidence slots.
 * Module-level constants, not magic strings scattered inline, so the
 * per-slot check below and its error messages stay in sync.
 */
const EXPECTED_EVIDENCE_TYPE = {
  propertyType: "property_type",
  constructionStatus: "construction_status",
  occupancyIntent: "occupancy_intent",
  existingPropertyCount: "existing_property_count",
} as const;

async function resolveActorProfileId(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string | null> {
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) return null;

  const { data: profileRow } = await supabase.from("user_profiles").select("id").eq("auth_user_id", authUser.id).maybeSingle();

  return profileRow?.id ?? null;
}

export type ComputePropertyRulesForCaseState = {
  derivationResultId: string | null;
  marginOfFinancePercentage: number | null;
  maxTenureYears: number | null;
  error: string | null;
};

type PropertyRuleRow = {
  id: string;
  bank_id: string;
  bank_product_id: string | null;
  rule_name: string;
  property_type: string;
  construction_status: string;
  occupancy_intent: string;
  existing_property_count_min: number | null;
  existing_property_count_max: number | null;
  margin_of_finance_percentage: number | null;
  max_tenure_years: number | null;
  description: string | null;
  version: number;
  is_active: boolean;
  effective_from: string | null;
  effective_to: string | null;
  created_at: string;
  updated_at: string;
};

function mapRuleRow(row: PropertyRuleRow): PropertyRule {
  return {
    id: row.id,
    bankId: row.bank_id,
    bankProductId: row.bank_product_id,
    ruleName: row.rule_name,
    propertyType: row.property_type,
    constructionStatus: row.construction_status,
    occupancyIntent: row.occupancy_intent,
    existingPropertyCountMin: row.existing_property_count_min,
    existingPropertyCountMax: row.existing_property_count_max,
    marginOfFinancePercentage: row.margin_of_finance_percentage,
    maxTenureYears: row.max_tenure_years,
    description: row.description,
    version: row.version,
    isActive: row.is_active,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const computePropertyRulesForCaseSchema = z.object({
  loanCaseId: uuidField("loan case id"),
  bankId: uuidField("bank id"),
  bankProductId: uuidField("bank product id"),
  propertyTypeEvidenceId: uuidField("property type evidence id"),
  constructionStatusEvidenceId: uuidField("construction status evidence id"),
  occupancyIntentEvidenceId: uuidField("occupancy intent evidence id"),
  existingPropertyCountEvidenceId: uuidField("existing property count evidence id"),
});

/**
 * Reads the 4 relevant `evidence` rows (property type, construction status,
 * occupancy intent, existing property count) and active `property_rules`
 * for a bank/product, matches a rule, and inserts one row into
 * `derivation_results` (domain = "property_rules"). Append-only, like every
 * prior domain's compute action — a recomputation is always a new row,
 * never an update to a prior result.
 *
 * No separate "compute" step: the matched rule's
 * `marginOfFinancePercentage`/`maxTenureYears` are read straight off the
 * rule and passed through as-is — this domain has no transformation
 * arithmetic to perform.
 */
export async function computePropertyRulesForCase(
  loanCaseId: string,
  bankId: string,
  bankProductId: string,
  propertyTypeEvidenceId: string,
  constructionStatusEvidenceId: string,
  occupancyIntentEvidenceId: string,
  existingPropertyCountEvidenceId: string,
): Promise<ComputePropertyRulesForCaseState> {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return { derivationResultId: null, marginOfFinancePercentage: null, maxTenureYears: null, error: "Your session has expired. Please sign in again." };
  }
  if (!STAFF_ROLES.has(currentUser.role)) {
    return {
      derivationResultId: null,
      marginOfFinancePercentage: null,
      maxTenureYears: null,
      error: "You do not have permission to compute property rules.",
    };
  }

  const parsed = computePropertyRulesForCaseSchema.safeParse({
    loanCaseId,
    bankId,
    bankProductId,
    propertyTypeEvidenceId,
    constructionStatusEvidenceId,
    occupancyIntentEvidenceId,
    existingPropertyCountEvidenceId,
  });
  if (!parsed.success) {
    return {
      derivationResultId: null,
      marginOfFinancePercentage: null,
      maxTenureYears: null,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }
  const input = parsed.data;

  const supabase = await createClient();

  // Cross-check bankProductId actually belongs to bankId before proceeding
  // — same "validate then proceed" pattern every prior domain's compute
  // action uses, preventing a derivation_results row that misattributes
  // which bank's rules produced a result for which product.
  const { data: bankProductRow, error: bankProductError } = await supabase
    .from("bank_products")
    .select("id, bank_id")
    .eq("id", input.bankProductId)
    .maybeSingle();

  if (bankProductError) {
    console.error(
      `[computePropertyRulesForCase] bank_products lookup failed. code=${bankProductError.code ?? "unknown"} message=${bankProductError.message}`,
    );
    return {
      derivationResultId: null,
      marginOfFinancePercentage: null,
      maxTenureYears: null,
      error: "Something went wrong while reading the bank product. Please try again.",
    };
  }
  if (!bankProductRow || bankProductRow.bank_id !== input.bankId) {
    return {
      derivationResultId: null,
      marginOfFinancePercentage: null,
      maxTenureYears: null,
      error: "The selected bank product does not belong to the selected bank.",
    };
  }

  // Fetch all 4 evidence rows in one query, scoped to this case. Audit-trail
  // integrity: only proceed if exactly 4 distinct rows come back — a count
  // mismatch also catches the case of a caller accidentally reusing the same
  // evidence id for two different roles (the .in() result set cannot contain
  // duplicate rows for a duplicated id, so the count would fall short of 4).
  // `evidence_type` is selected alongside `id`/`value` so each row can be
  // verified below to actually be evidence of the right kind for the slot
  // it was bound to by id, not just any row with a matching id/type-shape.
  const evidenceIds = [
    input.propertyTypeEvidenceId,
    input.constructionStatusEvidenceId,
    input.occupancyIntentEvidenceId,
    input.existingPropertyCountEvidenceId,
  ];

  const { data: evidenceRows, error: evidenceError } = await supabase
    .from("evidence")
    .select("id, evidence_type, value")
    .eq("loan_case_id", input.loanCaseId)
    .in("id", evidenceIds);

  if (evidenceError) {
    console.error(`[computePropertyRulesForCase] evidence lookup failed. code=${evidenceError.code ?? "unknown"} message=${evidenceError.message}`);
    return {
      derivationResultId: null,
      marginOfFinancePercentage: null,
      maxTenureYears: null,
      error: "Something went wrong while reading evidence. Please try again.",
    };
  }
  if (!evidenceRows || evidenceRows.length !== 4) {
    return {
      derivationResultId: null,
      marginOfFinancePercentage: null,
      maxTenureYears: null,
      error: "One or more of the supplied evidence ids were not found for this case.",
    };
  }

  // Bind each fetched row to its corresponding input parameter by id —
  // never guessed by content.
  const evidenceById = new Map(evidenceRows.map((row) => [row.id, row]));
  const propertyTypeRow = evidenceById.get(input.propertyTypeEvidenceId);
  const constructionStatusRow = evidenceById.get(input.constructionStatusEvidenceId);
  const occupancyIntentRow = evidenceById.get(input.occupancyIntentEvidenceId);
  const existingPropertyCountRow = evidenceById.get(input.existingPropertyCountEvidenceId);

  if (!propertyTypeRow || !constructionStatusRow || !occupancyIntentRow || !existingPropertyCountRow) {
    return {
      derivationResultId: null,
      marginOfFinancePercentage: null,
      maxTenureYears: null,
      error: "One or more of the supplied evidence ids were not found for this case.",
    };
  }

  // Verify each bound row is actually evidence of the right kind for its
  // slot, via the `evidence_type` discriminator — a more fundamental check
  // than the `typeof value` checks below, since id/case membership and a
  // matching JS primitive type are not enough to prove a caller didn't
  // transpose e.g. the construction-status evidence id into the
  // occupancyIntentEvidenceId slot (both are string-valued, unconstrained
  // open text). Checked before the value-shape checks below.
  if (propertyTypeRow.evidence_type !== EXPECTED_EVIDENCE_TYPE.propertyType) {
    return {
      derivationResultId: null,
      marginOfFinancePercentage: null,
      maxTenureYears: null,
      error: `Evidence ${propertyTypeRow.id} has evidence_type "${propertyTypeRow.evidence_type}", expected "${EXPECTED_EVIDENCE_TYPE.propertyType}".`,
    };
  }
  if (constructionStatusRow.evidence_type !== EXPECTED_EVIDENCE_TYPE.constructionStatus) {
    return {
      derivationResultId: null,
      marginOfFinancePercentage: null,
      maxTenureYears: null,
      error: `Evidence ${constructionStatusRow.id} has evidence_type "${constructionStatusRow.evidence_type}", expected "${EXPECTED_EVIDENCE_TYPE.constructionStatus}".`,
    };
  }
  if (occupancyIntentRow.evidence_type !== EXPECTED_EVIDENCE_TYPE.occupancyIntent) {
    return {
      derivationResultId: null,
      marginOfFinancePercentage: null,
      maxTenureYears: null,
      error: `Evidence ${occupancyIntentRow.id} has evidence_type "${occupancyIntentRow.evidence_type}", expected "${EXPECTED_EVIDENCE_TYPE.occupancyIntent}".`,
    };
  }
  if (existingPropertyCountRow.evidence_type !== EXPECTED_EVIDENCE_TYPE.existingPropertyCount) {
    return {
      derivationResultId: null,
      marginOfFinancePercentage: null,
      maxTenureYears: null,
      error: `Evidence ${existingPropertyCountRow.id} has evidence_type "${existingPropertyCountRow.evidence_type}", expected "${EXPECTED_EVIDENCE_TYPE.existingPropertyCount}".`,
    };
  }

  if (typeof propertyTypeRow.value !== "string") {
    return {
      derivationResultId: null,
      marginOfFinancePercentage: null,
      maxTenureYears: null,
      error: `Evidence ${propertyTypeRow.id} does not contain a string property type value.`,
    };
  }
  if (typeof constructionStatusRow.value !== "string") {
    return {
      derivationResultId: null,
      marginOfFinancePercentage: null,
      maxTenureYears: null,
      error: `Evidence ${constructionStatusRow.id} does not contain a string construction status value.`,
    };
  }
  if (typeof occupancyIntentRow.value !== "string") {
    return {
      derivationResultId: null,
      marginOfFinancePercentage: null,
      maxTenureYears: null,
      error: `Evidence ${occupancyIntentRow.id} does not contain a string occupancy intent value.`,
    };
  }
  if (typeof existingPropertyCountRow.value !== "number") {
    return {
      derivationResultId: null,
      marginOfFinancePercentage: null,
      maxTenureYears: null,
      error: `Evidence ${existingPropertyCountRow.id} does not contain a numeric existing property count value.`,
    };
  }

  const propertyType = propertyTypeRow.value;
  const constructionStatus = constructionStatusRow.value;
  const occupancyIntent = occupancyIntentRow.value;
  const existingPropertyCount = existingPropertyCountRow.value;

  const { data: ruleRows, error: rulesError } = await supabase
    .from("property_rules")
    .select(
      "id, bank_id, bank_product_id, rule_name, property_type, construction_status, occupancy_intent, existing_property_count_min, existing_property_count_max, margin_of_finance_percentage, max_tenure_years, description, version, is_active, effective_from, effective_to, created_at, updated_at",
    )
    .eq("bank_id", input.bankId)
    .eq("is_active", true)
    .order("updated_at", { ascending: false });

  if (rulesError) {
    console.error(`[computePropertyRulesForCase] rules lookup failed. code=${rulesError.code ?? "unknown"} message=${rulesError.message}`);
    return {
      derivationResultId: null,
      marginOfFinancePercentage: null,
      maxTenureYears: null,
      error: "Something went wrong while reading property rules. Please try again.",
    };
  }

  const rules: PropertyRule[] = (ruleRows ?? []).map((row) => mapRuleRow(row as PropertyRuleRow));

  const matchedRule = matchPropertyRule(input.bankId, input.bankProductId, propertyType, constructionStatus, occupancyIntent, existingPropertyCount, rules);
  if (!matchedRule) {
    return {
      derivationResultId: null,
      marginOfFinancePercentage: null,
      maxTenureYears: null,
      error: "No property rule matched this bank, product, property type, construction status, occupancy intent, and existing property count.",
    };
  }

  const computedByUserId = await resolveActorProfileId(supabase);

  const { data: insertedRow, error: insertError } = await supabase
    .from("derivation_results")
    .insert({
      loan_case_id: input.loanCaseId,
      bank_product_id: input.bankProductId,
      domain: "property_rules",
      rule_id: matchedRule.id,
      rule_version: matchedRule.version,
      // The 4 verified evidence rows' ids actually read above, in the order
      // fetched/verified — not the raw parameters.
      input_evidence_ids: [propertyTypeRow.id, constructionStatusRow.id, occupancyIntentRow.id, existingPropertyCountRow.id],
      // A self-explanatory object recording both the matched facts and the
      // resulting ceilings — same "audit trail should answer why" spirit as
      // every prior domain.
      result_value: {
        propertyType,
        constructionStatus,
        occupancyIntent,
        existingPropertyCount,
        marginOfFinancePercentage: matchedRule.marginOfFinancePercentage,
        maxTenureYears: matchedRule.maxTenureYears,
      },
      computed_by_user_id: computedByUserId,
    })
    .select("id")
    .maybeSingle();

  if (insertError) {
    console.error(`[computePropertyRulesForCase] insert failed. code=${insertError.code ?? "unknown"} message=${insertError.message}`);
    return {
      derivationResultId: null,
      marginOfFinancePercentage: null,
      maxTenureYears: null,
      error: "Computation succeeded but the result could not be saved. Please try again.",
    };
  }

  return {
    derivationResultId: insertedRow?.id ?? null,
    marginOfFinancePercentage: matchedRule.marginOfFinancePercentage,
    maxTenureYears: matchedRule.maxTenureYears,
    error: null,
  };
}
