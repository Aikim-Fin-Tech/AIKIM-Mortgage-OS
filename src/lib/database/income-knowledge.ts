import { createClient } from "@/lib/supabase/server";
import type { Bank, BankProduct, IncomeRecognitionRule, Evidence, DerivationResult } from "@/lib/income-knowledge/types";

/**
 * Read-only data access for Income Knowledge (Sprint 6.3B-1). Same contract
 * as every other file in this directory: never throw, return
 * `{ ..., error }`, log `code`/`message` only.
 *
 * `getBanks`, `getBankProducts`, and `getIncomeRecognitionRules` read
 * reference data any authenticated user can see per
 * supabase/migrations/20260726020000_income_knowledge_rls.sql (select
 * policies have no role check) — no app-level role check is needed here,
 * same posture as getMortgageRulesList in mortgage-rules-admin.ts.
 *
 * `getEvidenceForCase` and `getDerivationResultsForCase` are case-scoped;
 * their RLS select policies re-check the parent case's own visibility, so
 * no app-level role/case check is needed here either — RLS is the
 * authorization boundary (docs/decisions/0002-rls-as-sole-authorization-boundary.md).
 */

export type GetBanksResult = {
  banks: Bank[];
  error: string | null;
};

export async function getBanks(): Promise<GetBanksResult> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("banks")
      .select("id, name, short_code, is_active, effective_from, effective_to, created_at, updated_at")
      .order("name", { ascending: true });

    if (error) {
      console.error(`[getBanks] query failed. code=${error.code ?? "unknown"} message=${error.message}`);
      return { banks: [], error: error.message };
    }

    const banks: Bank[] = (data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      shortCode: row.short_code,
      isActive: row.is_active,
      effectiveFrom: row.effective_from,
      effectiveTo: row.effective_to,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return { banks, error: null };
  } catch (unexpectedError) {
    const message = unexpectedError instanceof Error ? unexpectedError.message : "Unknown error";
    console.error(`[getBanks] Unexpected error: ${message}`);
    return { banks: [], error: message };
  }
}

export type GetBankProductsResult = {
  bankProducts: BankProduct[];
  error: string | null;
};

export async function getBankProducts(bankId: string): Promise<GetBankProductsResult> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("bank_products")
      .select(
        "id, bank_id, product_name, product_code, financing_structure, is_active, effective_from, effective_to, created_at, updated_at",
      )
      .eq("bank_id", bankId)
      .order("product_name", { ascending: true });

    if (error) {
      console.error(`[getBankProducts] query failed for bankId=${bankId}. code=${error.code ?? "unknown"} message=${error.message}`);
      return { bankProducts: [], error: error.message };
    }

    const bankProducts: BankProduct[] = (data ?? []).map((row) => ({
      id: row.id,
      bankId: row.bank_id,
      productName: row.product_name,
      productCode: row.product_code,
      financingStructure: row.financing_structure,
      isActive: row.is_active,
      effectiveFrom: row.effective_from,
      effectiveTo: row.effective_to,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return { bankProducts, error: null };
  } catch (unexpectedError) {
    const message = unexpectedError instanceof Error ? unexpectedError.message : "Unknown error";
    console.error(`[getBankProducts] Unexpected error: ${message}`);
    return { bankProducts: [], error: message };
  }
}

export type GetIncomeRecognitionRulesResult = {
  rules: IncomeRecognitionRule[];
  error: string | null;
};

/** `bankId` narrows to one bank's rules; omitted, returns every bank's rules. */
export async function getIncomeRecognitionRules(bankId?: string): Promise<GetIncomeRecognitionRulesResult> {
  try {
    const supabase = await createClient();

    let query = supabase
      .from("income_recognition_rules")
      .select(
        "id, bank_id, bank_product_id, rule_name, income_source_type, nationality, income_country, employment_type, income_structure, recognition_method, haircut_percentage, averaging_window_months, minimum_history_months, description, version, is_active, effective_from, effective_to, created_at, updated_at",
      )
      .order("updated_at", { ascending: false });

    if (bankId) {
      query = query.eq("bank_id", bankId);
    }

    const { data, error } = await query;

    if (error) {
      console.error(`[getIncomeRecognitionRules] query failed. code=${error.code ?? "unknown"} message=${error.message}`);
      return { rules: [], error: error.message };
    }

    const rules: IncomeRecognitionRule[] = (data ?? []).map((row) => ({
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
    }));

    return { rules, error: null };
  } catch (unexpectedError) {
    const message = unexpectedError instanceof Error ? unexpectedError.message : "Unknown error";
    console.error(`[getIncomeRecognitionRules] Unexpected error: ${message}`);
    return { rules: [], error: message };
  }
}

export type GetEvidenceForCaseResult = {
  evidence: Evidence[];
  error: string | null;
};

export async function getEvidenceForCase(loanCaseId: string): Promise<GetEvidenceForCaseResult> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("evidence")
      .select(
        "id, loan_case_id, evidence_type, value, source_type, source_document_id, source_extraction_id, source_note, captured_by_user_id, captured_at, superseded_by_evidence_id",
      )
      .eq("loan_case_id", loanCaseId)
      .order("captured_at", { ascending: false });

    if (error) {
      console.error(`[getEvidenceForCase] query failed for loanCaseId=${loanCaseId}. code=${error.code ?? "unknown"} message=${error.message}`);
      return { evidence: [], error: error.message };
    }

    const evidence: Evidence[] = (data ?? []).map((row) => ({
      id: row.id,
      loanCaseId: row.loan_case_id,
      evidenceType: row.evidence_type,
      value: row.value,
      sourceType: row.source_type,
      sourceDocumentId: row.source_document_id,
      sourceExtractionId: row.source_extraction_id,
      sourceNote: row.source_note,
      capturedByUserId: row.captured_by_user_id,
      capturedAt: row.captured_at,
      supersededByEvidenceId: row.superseded_by_evidence_id,
    }));

    return { evidence, error: null };
  } catch (unexpectedError) {
    const message = unexpectedError instanceof Error ? unexpectedError.message : "Unknown error";
    console.error(`[getEvidenceForCase] Unexpected error: ${message}`);
    return { evidence: [], error: message };
  }
}

export type GetDerivationResultsForCaseResult = {
  derivationResults: DerivationResult[];
  error: string | null;
};

/** `bankProductId` narrows to one product's results; omitted, returns every product's results for this case. */
export async function getDerivationResultsForCase(
  loanCaseId: string,
  bankProductId?: string,
): Promise<GetDerivationResultsForCaseResult> {
  try {
    const supabase = await createClient();

    let query = supabase
      .from("derivation_results")
      .select("id, loan_case_id, bank_product_id, domain, rule_id, rule_version, input_evidence_ids, result_value, computed_at, computed_by_user_id")
      .eq("loan_case_id", loanCaseId)
      .order("computed_at", { ascending: false });

    if (bankProductId) {
      query = query.eq("bank_product_id", bankProductId);
    }

    const { data, error } = await query;

    if (error) {
      console.error(
        `[getDerivationResultsForCase] query failed for loanCaseId=${loanCaseId}. code=${error.code ?? "unknown"} message=${error.message}`,
      );
      return { derivationResults: [], error: error.message };
    }

    const derivationResults: DerivationResult[] = (data ?? []).map((row) => ({
      id: row.id,
      loanCaseId: row.loan_case_id,
      bankProductId: row.bank_product_id,
      domain: row.domain,
      ruleId: row.rule_id,
      ruleVersion: row.rule_version,
      inputEvidenceIds: Array.isArray(row.input_evidence_ids) ? (row.input_evidence_ids as string[]) : [],
      resultValue: row.result_value,
      computedAt: row.computed_at,
      computedByUserId: row.computed_by_user_id,
    }));

    return { derivationResults, error: null };
  } catch (unexpectedError) {
    const message = unexpectedError instanceof Error ? unexpectedError.message : "Unknown error";
    console.error(`[getDerivationResultsForCase] Unexpected error: ${message}`);
    return { derivationResults: [], error: message };
  }
}
