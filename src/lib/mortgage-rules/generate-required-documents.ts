import "server-only";
import { createClient } from "@/lib/supabase/server";
import { matchMortgageRule } from "./match-rule";
import type { BorrowerProfile, MortgageRule } from "./types";

/**
 * Regenerates a case's required-document checklist against its current
 * borrower profile. Called after the profile fields are saved
 * (src/app/(app)/loan-cases/[id]/actions.ts).
 *
 * Reconciliation rules (product decision, not DB-enforced):
 *  - Never touches public.documents — uploaded files are never deleted here.
 *  - A document type the matched rule still requires: inserted if missing,
 *    reactivated (state -> 'active') if it had been marked not_required,
 *    otherwise its required_count/required_months are refreshed in place.
 *  - A document type no longer required by the matched rule: if it's
 *    currently 'active', it's flipped to 'not_required' — never deleted, so
 *    an already-uploaded document's history is preserved.
 *  - No matching rule (including "no rules exist yet"): treated as an empty
 *    requirement set — every currently-active row is marked not_required.
 *  - Every state transition is appended to
 *    loan_case_required_document_events (append-only audit trail).
 *
 * Not atomic across the two bulk writes (upsert + mark-not-required) — a
 * TypeScript service can't wrap multiple Supabase calls in one DB
 * transaction the way the Sprint 6.1 create_loan_case RPC could. Acceptable
 * for Phase 1: every step is idempotent, so re-saving the profile self-heals
 * any partial failure. See docs/decisions/0006-mortgage-rules-engine.md.
 */

type ExistingRequiredDocRow = {
  id: string;
  document_type_id: string;
  state: "active" | "not_required";
};

export type GenerateRequiredDocumentsResult = {
  matchedRuleId: string | null;
  matchedRuleName: string | null;
  error: string | null;
};

export async function generateRequiredDocuments(
  loanCaseId: string,
  profile: BorrowerProfile,
): Promise<GenerateRequiredDocumentsResult> {
  const empty: GenerateRequiredDocumentsResult = { matchedRuleId: null, matchedRuleName: null, error: null };

  try {
    const supabase = await createClient();

    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    let actorProfileId: string | null = null;
    if (authUser) {
      const { data: profileRow } = await supabase
        .from("user_profiles")
        .select("id")
        .eq("auth_user_id", authUser.id)
        .maybeSingle();
      actorProfileId = profileRow?.id ?? null;
    }

    const { data: ruleRows, error: rulesError } = await supabase
      .from("mortgage_rules")
      .select("id, rule_name, nationality, income_country, employment_type, income_structure")
      .eq("is_active", true)
      .order("updated_at", { ascending: false });

    if (rulesError) {
      console.error(`[generateRequiredDocuments] mortgage_rules query failed. code=${rulesError.code ?? "unknown"}`);
      return { ...empty, error: rulesError.message };
    }

    const rules: MortgageRule[] = (ruleRows ?? []).map((r) => ({
      id: r.id,
      ruleName: r.rule_name,
      nationality: r.nationality,
      incomeCountry: r.income_country,
      employmentType: r.employment_type,
      incomeStructure: r.income_structure,
    }));

    const matchedRule = matchMortgageRule(profile, rules);

    let requiredDocs: { document_type_id: string; required_count: number; required_months: number | null }[] = [];
    if (matchedRule) {
      const { data: ruleDocRows, error: ruleDocsError } = await supabase
        .from("mortgage_rule_documents")
        .select("document_type_id, required_count, required_months")
        .eq("mortgage_rule_id", matchedRule.id);

      if (ruleDocsError) {
        console.error(`[generateRequiredDocuments] mortgage_rule_documents query failed. code=${ruleDocsError.code ?? "unknown"}`);
        return { ...empty, error: ruleDocsError.message };
      }
      requiredDocs = ruleDocRows ?? [];
    }

    const { data: existingRows, error: existingError } = await supabase
      .from("loan_case_required_documents")
      .select("id, document_type_id, state")
      .eq("loan_case_id", loanCaseId);

    if (existingError) {
      console.error(`[generateRequiredDocuments] loan_case_required_documents query failed. code=${existingError.code ?? "unknown"}`);
      return { ...empty, error: existingError.message };
    }

    const existing = (existingRows ?? []) as ExistingRequiredDocRow[];
    const existingByType = new Map(existing.map((r) => [r.document_type_id, r]));
    const requiredTypeIds = new Set(requiredDocs.map((d) => d.document_type_id));

    const upsertRows = requiredDocs.map((doc) => ({
      loan_case_id: loanCaseId,
      document_type_id: doc.document_type_id,
      mortgage_rule_id: matchedRule?.id ?? null,
      required_count: doc.required_count,
      required_months: doc.required_months,
      state: "active" as const,
      updated_at: new Date().toISOString(),
    }));

    const events: {
      loan_case_id: string;
      document_type_id: string;
      mortgage_rule_id: string | null;
      event_type: "added" | "marked_not_required" | "reactivated";
      actor_user_id: string | null;
    }[] = [];

    for (const doc of requiredDocs) {
      const existingRow = existingByType.get(doc.document_type_id);
      if (!existingRow) {
        events.push({
          loan_case_id: loanCaseId,
          document_type_id: doc.document_type_id,
          mortgage_rule_id: matchedRule?.id ?? null,
          event_type: "added",
          actor_user_id: actorProfileId,
        });
      } else if (existingRow.state === "not_required") {
        events.push({
          loan_case_id: loanCaseId,
          document_type_id: doc.document_type_id,
          mortgage_rule_id: matchedRule?.id ?? null,
          event_type: "reactivated",
          actor_user_id: actorProfileId,
        });
      }
    }

    if (upsertRows.length > 0) {
      const { error: upsertError } = await supabase
        .from("loan_case_required_documents")
        .upsert(upsertRows, { onConflict: "loan_case_id,document_type_id" });

      if (upsertError) {
        console.error(`[generateRequiredDocuments] upsert failed. code=${upsertError.code ?? "unknown"} message=${upsertError.message}`);
        return { ...empty, error: upsertError.message };
      }
    }

    const staleTypeIds = existing
      .filter((row) => row.state === "active" && !requiredTypeIds.has(row.document_type_id))
      .map((row) => row.document_type_id);

    if (staleTypeIds.length > 0) {
      const { error: staleError } = await supabase
        .from("loan_case_required_documents")
        .update({ state: "not_required", updated_at: new Date().toISOString() })
        .eq("loan_case_id", loanCaseId)
        .in("document_type_id", staleTypeIds);

      if (staleError) {
        console.error(`[generateRequiredDocuments] mark-not-required failed. code=${staleError.code ?? "unknown"} message=${staleError.message}`);
        return { ...empty, error: staleError.message };
      }

      for (const documentTypeId of staleTypeIds) {
        events.push({
          loan_case_id: loanCaseId,
          document_type_id: documentTypeId,
          mortgage_rule_id: matchedRule?.id ?? null,
          event_type: "marked_not_required",
          actor_user_id: actorProfileId,
        });
      }
    }

    if (events.length > 0) {
      const { error: eventsError } = await supabase.from("loan_case_required_document_events").insert(events);
      if (eventsError) {
        // Non-fatal: the checklist itself is already correct at this point,
        // only the audit trail entry failed to write. Log and continue.
        console.error(`[generateRequiredDocuments] audit event insert failed. code=${eventsError.code ?? "unknown"} message=${eventsError.message}`);
      }
    }

    return { matchedRuleId: matchedRule?.id ?? null, matchedRuleName: matchedRule?.ruleName ?? null, error: null };
  } catch (unexpectedError) {
    const message = unexpectedError instanceof Error ? unexpectedError.message : "Unknown error";
    console.error(`[generateRequiredDocuments] Unexpected error for case ${loanCaseId}: ${message}`);
    return { ...empty, error: message };
  }
}
