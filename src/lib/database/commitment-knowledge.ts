import { createClient } from "@/lib/supabase/server";
import type { CommitmentRecognitionRule } from "@/lib/commitment-knowledge/types";

/**
 * Read-only data access for Commitment Knowledge (Sprint 6.3B-2). Same
 * contract as every other file in this directory: never throw, return
 * `{ ..., error }`, log `code`/`message` only.
 *
 * `getCommitmentRecognitionRules` reads reference data any authenticated
 * user can see per supabase/migrations/20260727020000_commitment_knowledge_rls.sql
 * (select policy has no role check) — no app-level role check is needed
 * here, same posture as getIncomeRecognitionRules in income-knowledge.ts.
 *
 * `getBanks`, `getBankProducts`, `getEvidenceForCase`, and
 * `getDerivationResultsForCase` already exist and are domain-agnostic — not
 * duplicated here; import from src/lib/database/income-knowledge.ts.
 */

export type GetCommitmentRecognitionRulesResult = {
  rules: CommitmentRecognitionRule[];
  error: string | null;
};

/** `bankId` narrows to one bank's rules; omitted, returns every bank's rules. */
export async function getCommitmentRecognitionRules(bankId?: string): Promise<GetCommitmentRecognitionRulesResult> {
  try {
    const supabase = await createClient();

    let query = supabase
      .from("commitment_recognition_rules")
      .select(
        "id, bank_id, bank_product_id, rule_name, commitment_type, recognition_method, recognition_percentage, allows_to_be_settled_exclusion, description, version, is_active, effective_from, effective_to, created_at, updated_at",
      )
      .order("updated_at", { ascending: false });

    if (bankId) {
      query = query.eq("bank_id", bankId);
    }

    const { data, error } = await query;

    if (error) {
      console.error(`[getCommitmentRecognitionRules] query failed. code=${error.code ?? "unknown"} message=${error.message}`);
      return { rules: [], error: error.message };
    }

    const rules: CommitmentRecognitionRule[] = (data ?? []).map((row) => ({
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
    }));

    return { rules, error: null };
  } catch (unexpectedError) {
    const message = unexpectedError instanceof Error ? unexpectedError.message : "Unknown error";
    console.error(`[getCommitmentRecognitionRules] Unexpected error: ${message}`);
    return { rules: [], error: message };
  }
}
