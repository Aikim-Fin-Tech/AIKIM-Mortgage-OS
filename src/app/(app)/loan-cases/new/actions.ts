"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { STAFF_ROLES } from "@/lib/auth/staff-roles";

// Raw enum values that actually exist in public.loan_stage / public.loan_status
// (see Sprint 4 schema) — not guessed.
const STAGE_VALUES = ["new_enquiry", "document_collection", "credit_review", "bank_submission", "approved"] as const;
// `on_hold` is retired (MVP Sprint Day 2) — remains a valid legacy DB value,
// not offered as a create-time option. See
// docs/decisions/0009-loan-processing-workflow.md.
const STATUS_VALUES = ["new", "waiting_document", "under_review", "ready_to_submit", "submitted", "approved", "rejected"] as const;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PHONE_REGEX = /^[0-9+\-\s()]{7,20}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const formSchema = z
  .object({
    customerMode: z.enum(["existing", "new"]),
    customerId: z.string().trim().default(""),
    customerFullName: z.string().trim().default(""),
    customerPhone: z.string().trim().default(""),
    customerEmail: z.string().trim().default(""),
    customerIcNumber: z.string().trim().default(""),
    propertyProject: z.string().trim().min(2, "Property project is required."),
    propertyAddress: z.string().trim().default(""),
    loanAmount: z.coerce
      .number()
      .positive("Loan amount must be greater than zero.")
      .max(100_000_000, "Loan amount is outside an acceptable range."),
    bankName: z.string().trim().min(2, "Please select a bank."),
    stage: z.enum(STAGE_VALUES),
    status: z.enum(STATUS_VALUES),
    bankerId: z.string().trim().default(""),
  })
  .superRefine((values, ctx) => {
    if (values.customerMode === "existing") {
      if (!UUID_REGEX.test(values.customerId)) {
        ctx.addIssue({ code: "custom", path: ["customerId"], message: "Please select an existing customer." });
      }
    } else {
      if (values.customerFullName.length < 2) {
        ctx.addIssue({ code: "custom", path: ["customerFullName"], message: "Customer full name is required." });
      }
      if (!PHONE_REGEX.test(values.customerPhone)) {
        ctx.addIssue({ code: "custom", path: ["customerPhone"], message: "Enter a valid phone number." });
      }
      if (values.customerEmail && !EMAIL_REGEX.test(values.customerEmail)) {
        ctx.addIssue({ code: "custom", path: ["customerEmail"], message: "Enter a valid email address." });
      }
    }

    if (values.bankerId && !UUID_REGEX.test(values.bankerId)) {
      ctx.addIssue({ code: "custom", path: ["bankerId"], message: "Invalid banker selected." });
    }
  });

export type CreateLoanCaseState = {
  fieldErrors: Partial<Record<string, string>>;
  formError: string | null;
};

/**
 * Creates a loan case (and, in "new customer" mode, the customer record) via
 * the public.create_loan_case(...) RPC — a single atomic Postgres function so
 * a newly-created customer is never left orphaned if the loan_cases insert
 * that follows it fails (see the migration file for the transaction reasoning).
 *
 * Nothing here trusts the browser for: role, created_by, auth user id, or the
 * case_number — all of those are derived/generated server-side or inside the
 * database function itself.
 */
export async function createLoanCase(
  _prevState: CreateLoanCaseState,
  formData: FormData,
): Promise<CreateLoanCaseState> {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return { fieldErrors: {}, formError: "Your session has expired. Please sign in again." };
  }

  if (!STAFF_ROLES.has(currentUser.role)) {
    return { fieldErrors: {}, formError: "You do not have permission to create loan cases." };
  }

  const raw = {
    customerMode: String(formData.get("customerMode") ?? ""),
    customerId: String(formData.get("customerId") ?? ""),
    customerFullName: String(formData.get("customerFullName") ?? ""),
    customerPhone: String(formData.get("customerPhone") ?? ""),
    customerEmail: String(formData.get("customerEmail") ?? ""),
    customerIcNumber: String(formData.get("customerIcNumber") ?? ""),
    propertyProject: String(formData.get("propertyProject") ?? ""),
    propertyAddress: String(formData.get("propertyAddress") ?? ""),
    loanAmount: String(formData.get("loanAmount") ?? ""),
    bankName: String(formData.get("bankName") ?? ""),
    stage: String(formData.get("stage") ?? ""),
    status: String(formData.get("status") ?? ""),
    bankerId: String(formData.get("bankerId") ?? ""),
  };

  const result = formSchema.safeParse(raw);

  if (!result.success) {
    const fieldErrors: Partial<Record<string, string>> = {};
    for (const issue of result.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors, formError: null };
  }

  const values = result.data;
  const supabase = await createClient();

  const { data: newCase, error } = await supabase.rpc("create_loan_case", {
    p_customer_mode: values.customerMode,
    p_customer_id: values.customerMode === "existing" ? values.customerId : null,
    p_customer_full_name: values.customerMode === "new" ? values.customerFullName : null,
    p_customer_phone: values.customerMode === "new" ? values.customerPhone : null,
    p_customer_email: values.customerMode === "new" && values.customerEmail ? values.customerEmail : null,
    p_customer_ic_number: values.customerMode === "new" && values.customerIcNumber ? values.customerIcNumber : null,
    p_property_project: values.propertyProject,
    p_property_address: values.propertyAddress || null,
    p_loan_amount: values.loanAmount,
    p_bank_name: values.bankName,
    p_stage: values.stage,
    p_status: values.status,
    p_banker_id: values.bankerId || null,
  });

  if (error) {
    // Never log the full RPC payload (it can contain customer PII) — just the
    // operation name and the Supabase error code/message.
    console.error(`[createLoanCase] RPC failed. code=${error.code ?? "unknown"} message=${error.message}`);

    const isPermissionError = error.code === "42501" || error.message.toLowerCase().includes("row-level security");

    return {
      fieldErrors: {},
      formError: isPermissionError
        ? "You do not have permission to create loan cases."
        : "Something went wrong while creating the loan case. Please try again.",
    };
  }

  const createdCase = newCase as { case_number: string } | null;

  if (!createdCase?.case_number) {
    console.error("[createLoanCase] RPC succeeded but returned no case_number.");
    return { fieldErrors: {}, formError: "Something went wrong while creating the loan case. Please try again." };
  }

  revalidatePath("/");
  revalidatePath("/loan-cases");
  revalidatePath(`/loan-cases/${createdCase.case_number}`);

  redirect(`/loan-cases/${createdCase.case_number}`);
}
