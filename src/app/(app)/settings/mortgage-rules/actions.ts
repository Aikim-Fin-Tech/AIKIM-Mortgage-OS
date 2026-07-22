"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { PROFILE_DIMENSIONS, type ProfileDimensionKey } from "@/lib/mortgage-rules/profile-dimensions";

/**
 * Server Actions for the Mortgage Rule Admin (Sprint 6.2 Phase 2). Every
 * action re-derives the caller's role server-side and rejects non-
 * super_admin callers with a friendly error — RLS (super_admin-only insert/
 * update/delete policies, see
 * supabase/migrations/20260723010000_mortgage_rule_admin.sql) is the actual
 * enforcement; this is the same UX-only convenience pattern used everywhere
 * else in this codebase (e.g. STAFF_ROLES in loan-cases/new/actions.ts).
 *
 * mortgage_rules has no DELETE RLS policy at all — deactivate
 * (setRuleActive) is the only way to retire a rule, by design.
 */

const UNSUPPORTED_ROLE_ERROR = "You do not have permission to manage mortgage rules.";

async function requireSuperAdmin(): Promise<{ error: string | null }> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Your session has expired. Please sign in again." };
  if (!isSuperAdmin(currentUser.role)) return { error: UNSUPPORTED_ROLE_ERROR };
  return { error: null };
}

const optionalEnumFor = (options: readonly string[]) =>
  z
    .string()
    .trim()
    .refine((v) => v === "" || (options as string[]).includes(v), "Invalid selection.")
    .transform((v) => (v === "" ? null : v));

const optionalDate = z
  .string()
  .trim()
  .default("")
  .transform((v) => (v === "" ? null : v));

const dimensionShape = Object.fromEntries(
  PROFILE_DIMENSIONS.map((dim) => [dim.key, optionalEnumFor(dim.options)]),
) as Record<ProfileDimensionKey, ReturnType<typeof optionalEnumFor>>;

const ruleSchema = z
  .object({
    ruleName: z.string().trim().min(2, "Rule name is required."),
    description: z
      .string()
      .trim()
      .default("")
      .transform((v) => (v === "" ? null : v)),
    isActive: z.coerce.boolean(),
    version: z.coerce.number().int().min(1, "Version must be at least 1."),
    effectiveFrom: optionalDate,
    effectiveTo: optionalDate,
    ...dimensionShape,
  })
  .superRefine((values, ctx) => {
    if (values.effectiveFrom && values.effectiveTo && values.effectiveTo < values.effectiveFrom) {
      ctx.addIssue({ code: "custom", path: ["effectiveTo"], message: "End date must not be earlier than start date." });
    }
  });

export type RuleFormState = {
  fieldErrors: Partial<Record<string, string>>;
  formError: string | null;
};

function parseRuleFormData(formData: FormData) {
  const raw: Record<string, string> = {
    ruleName: String(formData.get("ruleName") ?? ""),
    description: String(formData.get("description") ?? ""),
    isActive: formData.get("isActive") === "on" ? "true" : "false",
    version: String(formData.get("version") ?? "1"),
    effectiveFrom: String(formData.get("effectiveFrom") ?? ""),
    effectiveTo: String(formData.get("effectiveTo") ?? ""),
  };
  for (const dim of PROFILE_DIMENSIONS) {
    raw[dim.key] = String(formData.get(dim.key) ?? "");
  }
  return ruleSchema.safeParse(raw);
}

function fieldErrorsFrom(issues: z.ZodIssue[]): Partial<Record<string, string>> {
  const fieldErrors: Partial<Record<string, string>> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form");
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}

export async function createRule(_prevState: RuleFormState, formData: FormData): Promise<RuleFormState> {
  const guard = await requireSuperAdmin();
  if (guard.error) return { fieldErrors: {}, formError: guard.error };

  const result = parseRuleFormData(formData);
  if (!result.success) return { fieldErrors: fieldErrorsFrom(result.error.issues), formError: null };

  const values = result.data;
  const supabase = await createClient();

  const dimensionColumns = Object.fromEntries(PROFILE_DIMENSIONS.map((dim) => [dim.column, values[dim.key]]));

  const { data: newRule, error } = await supabase
    .from("mortgage_rules")
    .insert({
      rule_name: values.ruleName,
      description: values.description,
      is_active: values.isActive,
      version: values.version,
      effective_from: values.effectiveFrom,
      effective_to: values.effectiveTo,
      ...dimensionColumns,
    })
    .select("id")
    .single();

  if (error || !newRule) {
    console.error(`[createRule] insert failed. code=${error?.code ?? "unknown"} message=${error?.message}`);
    return {
      fieldErrors: {},
      formError: isUniqueViolation(error)
        ? "An active rule with this exact profile combination and version already exists."
        : "Something went wrong while creating the rule. Please try again.",
    };
  }

  revalidatePath("/settings/mortgage-rules");
  redirect(`/settings/mortgage-rules/${newRule.id}`);
}

export async function updateRule(ruleId: string, _prevState: RuleFormState, formData: FormData): Promise<RuleFormState> {
  const guard = await requireSuperAdmin();
  if (guard.error) return { fieldErrors: {}, formError: guard.error };

  const result = parseRuleFormData(formData);
  if (!result.success) return { fieldErrors: fieldErrorsFrom(result.error.issues), formError: null };

  const values = result.data;
  const supabase = await createClient();

  const dimensionColumns = Object.fromEntries(PROFILE_DIMENSIONS.map((dim) => [dim.column, values[dim.key]]));

  const { error } = await supabase
    .from("mortgage_rules")
    .update({
      rule_name: values.ruleName,
      description: values.description,
      is_active: values.isActive,
      version: values.version,
      effective_from: values.effectiveFrom,
      effective_to: values.effectiveTo,
      updated_at: new Date().toISOString(),
      ...dimensionColumns,
    })
    .eq("id", ruleId);

  if (error) {
    console.error(`[updateRule] update failed for ${ruleId}. code=${error.code ?? "unknown"} message=${error.message}`);
    return {
      fieldErrors: {},
      formError: isUniqueViolation(error)
        ? "An active rule with this exact profile combination and version already exists."
        : "Something went wrong while saving the rule. Please try again.",
    };
  }

  revalidatePath("/settings/mortgage-rules");
  revalidatePath(`/settings/mortgage-rules/${ruleId}`);
  return { fieldErrors: {}, formError: null };
}

export async function setRuleActive(ruleId: string, isActive: boolean): Promise<{ error: string | null }> {
  const guard = await requireSuperAdmin();
  if (guard.error) return { error: guard.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("mortgage_rules")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", ruleId);

  if (error) {
    console.error(`[setRuleActive] update failed for ${ruleId}. code=${error.code ?? "unknown"} message=${error.message}`);
    return {
      error: isUniqueViolation(error)
        ? "Cannot activate: another active rule already has this exact profile combination and version."
        : "Something went wrong. Please try again.",
    };
  }

  revalidatePath("/settings/mortgage-rules");
  revalidatePath(`/settings/mortgage-rules/${ruleId}`);
  return { error: null };
}

export async function duplicateRuleAction(ruleId: string): Promise<{ error: string | null }> {
  const guard = await requireSuperAdmin();
  if (guard.error) return { error: guard.error };

  const supabase = await createClient();

  const { data: original, error: fetchError } = await supabase
    .from("mortgage_rules")
    .select(
      "rule_name, description, nationality, income_country, employment_type, income_structure, effective_from, effective_to",
    )
    .eq("id", ruleId)
    .maybeSingle();

  if (fetchError || !original) {
    console.error(`[duplicateRuleAction] source rule lookup failed for ${ruleId}. message=${fetchError?.message ?? "not found"}`);
    return { error: "Rule not found." };
  }

  // Starts inactive (version 1) so the admin reviews before it can collide
  // with another active rule under the same profile.
  const { data: newRule, error: insertError } = await supabase
    .from("mortgage_rules")
    .insert({
      ...original,
      rule_name: `${original.rule_name} (Copy)`,
      is_active: false,
      version: 1,
    })
    .select("id")
    .single();

  if (insertError || !newRule) {
    console.error(`[duplicateRuleAction] insert failed. code=${insertError?.code ?? "unknown"} message=${insertError?.message}`);
    return { error: "Something went wrong while duplicating the rule. Please try again." };
  }

  const { data: sourceDocs, error: docsError } = await supabase
    .from("mortgage_rule_documents")
    .select("document_type_id, required_count, required_months, is_mandatory, display_order, notes")
    .eq("mortgage_rule_id", ruleId);

  if (docsError) {
    console.error(`[duplicateRuleAction] source rule_documents lookup failed. message=${docsError.message}`);
    // The rule itself was created successfully — not fatal, just an
    // incomplete copy. Surface nothing further; admin can add documents.
  } else if (sourceDocs && sourceDocs.length > 0) {
    const { error: docsInsertError } = await supabase
      .from("mortgage_rule_documents")
      .insert(sourceDocs.map((doc) => ({ ...doc, mortgage_rule_id: newRule.id })));
    if (docsInsertError) {
      console.error(`[duplicateRuleAction] rule_documents copy failed. message=${docsInsertError.message}`);
    }
  }

  revalidatePath("/settings/mortgage-rules");
  redirect(`/settings/mortgage-rules/${newRule.id}`);
}

const ruleDocumentSchema = z.object({
  documentTypeId: z.string().trim().uuid("Please select a document type."),
  requiredCount: z.coerce.number().int().min(1, "Required count must be at least 1."),
  requiredMonths: z
    .string()
    .trim()
    .default("")
    .transform((v) => (v === "" ? null : Number(v)))
    .refine((v) => v === null || (Number.isInteger(v) && v >= 1), "Required months must be at least 1 if supplied."),
  isMandatory: z.coerce.boolean(),
  notes: z
    .string()
    .trim()
    .default("")
    .transform((v) => (v === "" ? null : v)),
});

export type RuleDocumentFormState = {
  fieldErrors: Partial<Record<string, string>>;
  formError: string | null;
};

export async function addRuleDocument(
  ruleId: string,
  _prevState: RuleDocumentFormState,
  formData: FormData,
): Promise<RuleDocumentFormState> {
  const guard = await requireSuperAdmin();
  if (guard.error) return { fieldErrors: {}, formError: guard.error };

  const result = ruleDocumentSchema.safeParse({
    documentTypeId: String(formData.get("documentTypeId") ?? ""),
    requiredCount: String(formData.get("requiredCount") ?? ""),
    requiredMonths: String(formData.get("requiredMonths") ?? ""),
    isMandatory: formData.get("isMandatory") === "on" ? "true" : "false",
    notes: String(formData.get("notes") ?? ""),
  });

  if (!result.success) return { fieldErrors: fieldErrorsFrom(result.error.issues), formError: null };

  const values = result.data;
  const supabase = await createClient();

  const { data: maxOrderRow } = await supabase
    .from("mortgage_rule_documents")
    .select("display_order")
    .eq("mortgage_rule_id", ruleId)
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextDisplayOrder = (maxOrderRow?.display_order ?? -1) + 1;

  const { error } = await supabase.from("mortgage_rule_documents").insert({
    mortgage_rule_id: ruleId,
    document_type_id: values.documentTypeId,
    required_count: values.requiredCount,
    required_months: values.requiredMonths,
    is_mandatory: values.isMandatory,
    notes: values.notes,
    display_order: nextDisplayOrder,
  });

  if (error) {
    console.error(`[addRuleDocument] insert failed for rule ${ruleId}. code=${error.code ?? "unknown"} message=${error.message}`);
    return {
      fieldErrors: {},
      formError: isUniqueViolation(error)
        ? "This document type is already required by this rule."
        : "Something went wrong while adding the document. Please try again.",
    };
  }

  revalidatePath(`/settings/mortgage-rules/${ruleId}`);
  return { fieldErrors: {}, formError: null };
}

export async function updateRuleDocument(
  ruleDocumentId: string,
  ruleId: string,
  _prevState: RuleDocumentFormState,
  formData: FormData,
): Promise<RuleDocumentFormState> {
  const guard = await requireSuperAdmin();
  if (guard.error) return { fieldErrors: {}, formError: guard.error };

  const result = ruleDocumentSchema.safeParse({
    documentTypeId: String(formData.get("documentTypeId") ?? ""),
    requiredCount: String(formData.get("requiredCount") ?? ""),
    requiredMonths: String(formData.get("requiredMonths") ?? ""),
    isMandatory: formData.get("isMandatory") === "on" ? "true" : "false",
    notes: String(formData.get("notes") ?? ""),
  });

  if (!result.success) return { fieldErrors: fieldErrorsFrom(result.error.issues), formError: null };

  const values = result.data;
  const supabase = await createClient();

  const { error } = await supabase
    .from("mortgage_rule_documents")
    .update({
      document_type_id: values.documentTypeId,
      required_count: values.requiredCount,
      required_months: values.requiredMonths,
      is_mandatory: values.isMandatory,
      notes: values.notes,
    })
    .eq("id", ruleDocumentId)
    .eq("mortgage_rule_id", ruleId);

  if (error) {
    console.error(`[updateRuleDocument] update failed for ${ruleDocumentId}. code=${error.code ?? "unknown"} message=${error.message}`);
    return {
      fieldErrors: {},
      formError: isUniqueViolation(error)
        ? "This document type is already required by this rule."
        : "Something went wrong while saving the document. Please try again.",
    };
  }

  revalidatePath(`/settings/mortgage-rules/${ruleId}`);
  return { fieldErrors: {}, formError: null };
}

export async function removeRuleDocument(ruleDocumentId: string, ruleId: string): Promise<{ error: string | null }> {
  const guard = await requireSuperAdmin();
  if (guard.error) return { error: guard.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("mortgage_rule_documents")
    .delete()
    .eq("id", ruleDocumentId)
    .eq("mortgage_rule_id", ruleId);

  if (error) {
    console.error(`[removeRuleDocument] delete failed for ${ruleDocumentId}. code=${error.code ?? "unknown"} message=${error.message}`);
    return { error: "Something went wrong while removing the document. Please try again." };
  }

  revalidatePath(`/settings/mortgage-rules/${ruleId}`);
  return { error: null };
}

export async function reorderRuleDocuments(ruleId: string, orderedIds: string[]): Promise<{ error: string | null }> {
  const guard = await requireSuperAdmin();
  if (guard.error) return { error: guard.error };

  const supabase = await createClient();

  const results = await Promise.all(
    orderedIds.map((id, index) =>
      supabase.from("mortgage_rule_documents").update({ display_order: index }).eq("id", id).eq("mortgage_rule_id", ruleId),
    ),
  );

  const failed = results.find((r) => r.error);
  if (failed?.error) {
    console.error(`[reorderRuleDocuments] update failed for rule ${ruleId}. message=${failed.error.message}`);
    return { error: "Something went wrong while reordering. Please try again." };
  }

  revalidatePath(`/settings/mortgage-rules/${ruleId}`);
  return { error: null };
}
