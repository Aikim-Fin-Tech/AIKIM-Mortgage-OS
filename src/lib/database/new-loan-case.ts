import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { CustomerOption, BankerOption, NewLoanCaseFormOptions } from "@/lib/loan-cases/new-loan-case-types";

/**
 * Server-only data access for the New Loan Case form. This file imports the
 * cookie-aware Supabase server client (which itself imports `next/headers`),
 * so the `server-only` import above makes the build fail loudly if anything
 * ever tries to pull this into a Client Component bundle again, instead of
 * failing with a confusing runtime import trace.
 *
 * Client-safe types/constants (CustomerOption, BankerOption, STAGE_OPTIONS,
 * STATUS_OPTIONS) now live in `@/lib/loan-cases/new-loan-case-types` — import
 * those directly from Client Components, never from this file.
 */

/**
 * Loads the minimum fields needed to populate the New Loan Case form's
 * customer and banker dropdowns. Deliberately does not select ic_number,
 * email, or address — those are confidential and not needed for a picker.
 * Every row here is already scoped by RLS to what the current user can see.
 */
export async function getNewLoanCaseFormOptions(): Promise<NewLoanCaseFormOptions> {
  try {
    const supabase = await createClient();

    const [customersResult, bankersResult] = await Promise.all([
      supabase.from("customers").select("id, full_name, phone").order("full_name", { ascending: true }),
      supabase.from("bankers").select("id, full_name, bank_name").order("full_name", { ascending: true }),
    ]);

    const failedSections: string[] = [];

    if (customersResult.error) {
      console.error(
        `[getNewLoanCaseFormOptions] customers query failed. code=${customersResult.error.code ?? "unknown"} message=${customersResult.error.message}`,
      );
      failedSections.push("customers");
    }

    if (bankersResult.error) {
      console.error(
        `[getNewLoanCaseFormOptions] bankers query failed. code=${bankersResult.error.code ?? "unknown"} message=${bankersResult.error.message}`,
      );
      failedSections.push("bankers");
    }

    const customers: CustomerOption[] = (customersResult.data ?? []).map((row) => ({
      id: row.id,
      fullName: row.full_name,
      phone: row.phone,
    }));

    const bankers: BankerOption[] = (bankersResult.data ?? []).map((row) => ({
      id: row.id,
      fullName: row.full_name,
      bankName: row.bank_name,
    }));

    return {
      customers,
      bankers,
      error: failedSections.length > 0 ? `Failed to load: ${failedSections.join(", ")}` : null,
    };
  } catch (unexpectedError) {
    const message = unexpectedError instanceof Error ? unexpectedError.message : "Unknown error";
    console.error(`[getNewLoanCaseFormOptions] Unexpected error: ${message}`);
    return { customers: [], bankers: [], error: message };
  }
}
