import { createClient } from "@/lib/supabase/server";
import type { PropertyRule } from "@/lib/property-rules-knowledge/types";

/**
 * Read-only data access for Property Rules Knowledge (Sprint 6.3B-4). Same
 * contract as every other file in this directory: never throw, return
 * `{ ..., error }`, log `code`/`message` only.
 *
 * `getPropertyRules` reads reference data — same posture as getDsrRules /
 * getCommitmentRecognitionRules: no app-level role check is needed here
 * (assumed no-role-check select RLS policy, same shape as the prior three
 * domains' rule tables).
 *
 * `getBanks`, `getBankProducts`, `getEvidenceForCase`, and
 * `getDerivationResultsForCase` already exist and are domain-agnostic — not
 * duplicated here; import from src/lib/database/income-knowledge.ts.
 */

export type GetPropertyRulesResult = {
  rules: PropertyRule[];
  error: string | null;
};

/** `bankId` narrows to one bank's rules; omitted, returns every bank's rules. */
export async function getPropertyRules(bankId?: string): Promise<GetPropertyRulesResult> {
  try {
    const supabase = await createClient();

    let query = supabase
      .from("property_rules")
      .select(
        "id, bank_id, bank_product_id, rule_name, property_type, construction_status, occupancy_intent, existing_property_count_min, existing_property_count_max, margin_of_finance_percentage, max_tenure_years, description, version, is_active, effective_from, effective_to, created_at, updated_at",
      )
      .order("updated_at", { ascending: false });

    if (bankId) {
      query = query.eq("bank_id", bankId);
    }

    const { data, error } = await query;

    if (error) {
      console.error(`[getPropertyRules] query failed. code=${error.code ?? "unknown"} message=${error.message}`);
      return { rules: [], error: error.message };
    }

    const rules: PropertyRule[] = (data ?? []).map((row) => ({
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
    }));

    return { rules, error: null };
  } catch (unexpectedError) {
    const message = unexpectedError instanceof Error ? unexpectedError.message : "Unknown error";
    console.error(`[getPropertyRules] Unexpected error: ${message}`);
    return { rules: [], error: message };
  }
}
