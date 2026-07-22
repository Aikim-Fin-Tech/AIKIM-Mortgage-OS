"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { STAFF_ROLES } from "@/lib/auth/staff-roles";
import { generateRequiredDocuments } from "@/lib/mortgage-rules/generate-required-documents";
import {
  NATIONALITY_OPTIONS,
  INCOME_COUNTRY_OPTIONS,
  EMPLOYMENT_TYPE_OPTIONS,
  INCOME_STRUCTURE_OPTIONS,
} from "@/lib/mortgage-rules/borrower-profile-options";
import { getCaseSummaryData } from "@/lib/database/case-summary";
import { generateNextAction } from "@/lib/case-summary/generate-next-action";
import { STATUS_OPTIONS } from "@/lib/loan-cases/new-loan-case-types";
import { STATUS_LABELS } from "@/lib/loan-cases-data";
import { recordTimelineEvent } from "@/lib/timeline/record-timeline-event";

/**
 * Server Action for editing a loan case's borrower profile (Sprint 6.2 Phase
 * 1) — the only editable fields on a loan case today; the rest of "Edit
 * Case" remains the disabled stub it was before this sprint.
 *
 * Saving the profile immediately regenerates the case's required-document
 * checklist (see generateRequiredDocuments) — nothing here decides which
 * documents are required; that's entirely driven by the mortgage_rules
 * tables, matched via the shared TypeScript matcher.
 */

const optionalEnum = (values: readonly string[]) =>
  z
    .string()
    .trim()
    .refine((v) => v === "" || (values as string[]).includes(v), "Invalid selection.")
    .transform((v) => (v === "" ? null : v));

const profileSchema = z.object({
  nationality: optionalEnum(NATIONALITY_OPTIONS),
  incomeCountry: optionalEnum(INCOME_COUNTRY_OPTIONS),
  employmentType: optionalEnum(EMPLOYMENT_TYPE_OPTIONS),
  incomeStructure: optionalEnum(INCOME_STRUCTURE_OPTIONS),
});

export type UpdateBorrowerProfileState = {
  fieldErrors: Partial<Record<string, string>>;
  formError: string | null;
};

export async function updateBorrowerProfile(
  caseNumber: string,
  _prevState: UpdateBorrowerProfileState,
  formData: FormData,
): Promise<UpdateBorrowerProfileState> {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return { fieldErrors: {}, formError: "Your session has expired. Please sign in again." };
  }
  if (!STAFF_ROLES.has(currentUser.role)) {
    return { fieldErrors: {}, formError: "You do not have permission to edit this case." };
  }

  const result = profileSchema.safeParse({
    nationality: String(formData.get("nationality") ?? ""),
    incomeCountry: String(formData.get("incomeCountry") ?? ""),
    employmentType: String(formData.get("employmentType") ?? ""),
    incomeStructure: String(formData.get("incomeStructure") ?? ""),
  });

  if (!result.success) {
    const fieldErrors: Partial<Record<string, string>> = {};
    for (const issue of result.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors, formError: null };
  }

  const profile = result.data;
  const supabase = await createClient();

  const { data: caseRow, error: lookupError } = await supabase
    .from("loan_cases")
    .select("id")
    .eq("case_number", caseNumber)
    .maybeSingle();

  if (lookupError || !caseRow) {
    console.error(`[updateBorrowerProfile] case lookup failed for ${caseNumber}. message=${lookupError?.message ?? "not found"}`);
    return { fieldErrors: {}, formError: "Case not found or not accessible." };
  }

  const { error: updateError } = await supabase
    .from("loan_cases")
    .update({
      nationality: profile.nationality,
      income_country: profile.incomeCountry,
      employment_type: profile.employmentType,
      income_structure: profile.incomeStructure,
    })
    .eq("id", caseRow.id);

  if (updateError) {
    console.error(`[updateBorrowerProfile] update failed. code=${updateError.code ?? "unknown"} message=${updateError.message}`);
    const isPermissionError = updateError.code === "42501" || updateError.message.toLowerCase().includes("row-level security");
    return {
      fieldErrors: {},
      formError: isPermissionError
        ? "You do not have permission to edit this case."
        : "Something went wrong while saving the borrower profile. Please try again.",
    };
  }

  const generation = await generateRequiredDocuments(caseRow.id, profile);
  if (generation.error) {
    // The profile itself saved successfully — surface this as a soft warning,
    // not a hard failure, since the user's edit wasn't lost.
    console.error(`[updateBorrowerProfile] checklist regeneration failed for ${caseNumber}. message=${generation.error}`);
  }

  revalidatePath(`/loan-cases/${caseNumber}`);
  revalidatePath(`/loan-cases/${caseNumber}/documents`);

  return { fieldErrors: {}, formError: null };
}

export type GenerateCaseNextActionResult = {
  nextAction: string | null;
  error: string | null;
};

/**
 * Generates the Case Summary card's AI next-action suggestion, on request
 * (not automatically). Every factual field it's based on is gathered by
 * getCaseSummaryData from real tables first — the AI call only ever sees
 * that already-verified data, never touches the database itself.
 */
export async function generateCaseNextAction(caseNumber: string): Promise<GenerateCaseNextActionResult> {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return { nextAction: null, error: "Your session has expired. Please sign in again." };
  }

  const { data, error } = await getCaseSummaryData(caseNumber);
  if (!data) {
    return { nextAction: null, error: error ?? "Case not found or not accessible." };
  }

  return generateNextAction(data);
}

export type UpdateLoanCaseStatusState = {
  error: string | null;
};

const VALID_STATUS_VALUES = new Set(STATUS_OPTIONS.map((o) => o.value));

/**
 * The first UI capability to actually change a case's status after
 * creation — required for the "Status Changed" timeline entry to ever fire,
 * and for a case to progress through the pipeline at all beyond what it was
 * created with. STAFF_ROLES only, RLS remains the real boundary
 * (loan_cases update policy — not committed to this repo, see
 * docs/architecture/database.md).
 */
export async function updateLoanCaseStatus(caseNumber: string, newStatus: string): Promise<UpdateLoanCaseStatusState> {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return { error: "Your session has expired. Please sign in again." };
  }
  if (!STAFF_ROLES.has(currentUser.role)) {
    return { error: "You do not have permission to change this case's status." };
  }

  if (!VALID_STATUS_VALUES.has(newStatus as (typeof STATUS_OPTIONS)[number]["value"])) {
    return { error: "Invalid status." };
  }

  const supabase = await createClient();

  const { data: caseRow, error: lookupError } = await supabase
    .from("loan_cases")
    .select("id, status")
    .eq("case_number", caseNumber)
    .maybeSingle();

  if (lookupError || !caseRow) {
    console.error(`[updateLoanCaseStatus] case lookup failed for ${caseNumber}. message=${lookupError?.message ?? "not found"}`);
    return { error: "Case not found or not accessible." };
  }

  if (caseRow.status === newStatus) {
    return { error: null };
  }

  const { error: updateError } = await supabase.from("loan_cases").update({ status: newStatus }).eq("id", caseRow.id);

  if (updateError) {
    console.error(`[updateLoanCaseStatus] update failed. code=${updateError.code ?? "unknown"} message=${updateError.message}`);
    const isPermissionError = updateError.code === "42501" || updateError.message.toLowerCase().includes("row-level security");
    return {
      error: isPermissionError
        ? "You do not have permission to change this case's status."
        : "Something went wrong while updating the status. Please try again.",
    };
  }

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

  await recordTimelineEvent(
    supabase,
    caseRow.id,
    "status_changed",
    `Status changed to ${STATUS_LABELS[newStatus] ?? newStatus}`,
    actorProfileId,
  );

  revalidatePath(`/loan-cases/${caseNumber}`);
  revalidatePath(`/loan-cases/${caseNumber}/documents`);
  revalidatePath("/loan-cases");
  revalidatePath("/");

  return { error: null };
}
