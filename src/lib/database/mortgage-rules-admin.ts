import { createClient } from "@/lib/supabase/server";
import type {
  MortgageRuleListItem,
  MortgageRuleDetail,
  RuleDocumentItem,
  DocumentCategoryItem,
} from "@/lib/mortgage-rules/types";

/**
 * Read-only data access for the Mortgage Rule Admin (Sprint 6.2 Phase 2,
 * super_admin only — enforced by RLS write policies plus a page-level role
 * check in each settings page; these read functions themselves rely on the
 * existing SELECT-for-any-authenticated-user policies from Phase 1, since
 * reading the rule catalog isn't itself sensitive).
 *
 * Never throw; return `{ ..., error }`, same contract as every other file in
 * this directory.
 */

function normalizeEmbed<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export type GetMortgageRulesListResult = {
  rules: MortgageRuleListItem[];
  error: string | null;
};

export async function getMortgageRulesList(): Promise<GetMortgageRulesListResult> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("mortgage_rules")
      .select(
        "id, rule_name, nationality, income_country, employment_type, income_structure, is_active, updated_at, mortgage_rule_documents(count)",
      )
      .order("updated_at", { ascending: false });

    if (error) {
      console.error(`[getMortgageRulesList] query failed. code=${error.code ?? "unknown"} message=${error.message}`);
      return { rules: [], error: error.message };
    }

    const rules: MortgageRuleListItem[] = (data ?? []).map((row) => {
      const countRow = normalizeEmbed(row.mortgage_rule_documents as { count: number } | { count: number }[] | null);
      return {
        id: row.id,
        ruleName: row.rule_name,
        nationality: row.nationality,
        incomeCountry: row.income_country,
        employmentType: row.employment_type,
        incomeStructure: row.income_structure,
        isActive: row.is_active,
        requiredDocumentCount: countRow?.count ?? 0,
        updatedAt: row.updated_at,
      };
    });

    return { rules, error: null };
  } catch (unexpectedError) {
    const message = unexpectedError instanceof Error ? unexpectedError.message : "Unknown error";
    console.error(`[getMortgageRulesList] Unexpected error: ${message}`);
    return { rules: [], error: message };
  }
}

export type GetMortgageRuleDetailResult = {
  rule: MortgageRuleDetail | null;
  ruleDocuments: RuleDocumentItem[];
  error: string | null;
};

export async function getMortgageRuleDetail(ruleId: string): Promise<GetMortgageRuleDetailResult> {
  const empty: GetMortgageRuleDetailResult = { rule: null, ruleDocuments: [], error: null };

  try {
    const supabase = await createClient();

    const [ruleResult, docsResult] = await Promise.all([
      supabase
        .from("mortgage_rules")
        .select(
          "id, rule_name, description, nationality, income_country, employment_type, income_structure, is_active, version, effective_from, effective_to, created_at, updated_at",
        )
        .eq("id", ruleId)
        .maybeSingle(),
      supabase
        .from("mortgage_rule_documents")
        .select(
          "id, document_type_id, required_count, required_months, is_mandatory, display_order, notes, document_types ( name, category_id, document_categories ( name ) )",
        )
        .eq("mortgage_rule_id", ruleId)
        .order("display_order", { ascending: true }),
    ]);

    if (ruleResult.error) {
      console.error(`[getMortgageRuleDetail] rule query failed for ${ruleId}. code=${ruleResult.error.code ?? "unknown"}`);
      return { ...empty, error: ruleResult.error.message };
    }

    if (!ruleResult.data) {
      return empty;
    }

    const r = ruleResult.data;
    const rule: MortgageRuleDetail = {
      id: r.id,
      ruleName: r.rule_name,
      description: r.description,
      nationality: r.nationality,
      incomeCountry: r.income_country,
      employmentType: r.employment_type,
      incomeStructure: r.income_structure,
      isActive: r.is_active,
      version: r.version,
      effectiveFrom: r.effective_from,
      effectiveTo: r.effective_to,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };

    if (docsResult.error) {
      console.error(`[getMortgageRuleDetail] rule documents query failed for ${ruleId}. code=${docsResult.error.code ?? "unknown"}`);
      return { rule, ruleDocuments: [], error: docsResult.error.message };
    }

    type DocTypeEmbed = { name: string; category_id: string | null; document_categories: { name: string } | { name: string }[] | null };

    const ruleDocuments: RuleDocumentItem[] = (docsResult.data ?? []).map((row) => {
      const docType = normalizeEmbed(row.document_types as DocTypeEmbed | DocTypeEmbed[] | null);
      const category = docType ? normalizeEmbed(docType.document_categories) : null;
      return {
        id: row.id,
        documentTypeId: row.document_type_id,
        documentTypeName: docType?.name ?? "Document",
        categoryId: docType?.category_id ?? null,
        categoryName: category?.name ?? null,
        requiredCount: row.required_count,
        requiredMonths: row.required_months,
        isMandatory: row.is_mandatory,
        displayOrder: row.display_order,
        notes: row.notes,
      };
    });

    return { rule, ruleDocuments, error: null };
  } catch (unexpectedError) {
    const message = unexpectedError instanceof Error ? unexpectedError.message : "Unknown error";
    console.error(`[getMortgageRuleDetail] Unexpected error for ${ruleId}: ${message}`);
    return { ...empty, error: message };
  }
}

export type GetDocumentCategoriesListResult = {
  categories: DocumentCategoryItem[];
  error: string | null;
};

export async function getDocumentCategoriesList(): Promise<GetDocumentCategoriesListResult> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("document_categories")
      .select("id, name, display_order, is_active")
      .order("display_order", { ascending: true });

    if (error) {
      console.error(`[getDocumentCategoriesList] query failed. code=${error.code ?? "unknown"}`);
      return { categories: [], error: error.message };
    }

    const categories: DocumentCategoryItem[] = (data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      displayOrder: row.display_order,
      isActive: row.is_active,
    }));

    return { categories, error: null };
  } catch (unexpectedError) {
    const message = unexpectedError instanceof Error ? unexpectedError.message : "Unknown error";
    console.error(`[getDocumentCategoriesList] Unexpected error: ${message}`);
    return { categories: [], error: message };
  }
}

export type DocumentTypeWithCategory = {
  id: string;
  name: string;
  categoryId: string | null;
  categoryName: string | null;
};

/** For the admin Rule form's "add document" picker, grouped by category. */
export async function getDocumentTypesWithCategory(): Promise<{
  documentTypes: DocumentTypeWithCategory[];
  error: string | null;
}> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("document_types")
      .select("id, name, category_id, document_categories ( name )")
      .order("name", { ascending: true });

    if (error) {
      console.error(`[getDocumentTypesWithCategory] query failed. code=${error.code ?? "unknown"}`);
      return { documentTypes: [], error: error.message };
    }

    const documentTypes: DocumentTypeWithCategory[] = (data ?? []).map((row) => {
      const category = normalizeEmbed(row.document_categories as { name: string } | { name: string }[] | null);
      return {
        id: row.id,
        name: row.name,
        categoryId: row.category_id,
        categoryName: category?.name ?? null,
      };
    });

    return { documentTypes, error: null };
  } catch (unexpectedError) {
    const message = unexpectedError instanceof Error ? unexpectedError.message : "Unknown error";
    console.error(`[getDocumentTypesWithCategory] Unexpected error: ${message}`);
    return { documentTypes: [], error: message };
  }
}
