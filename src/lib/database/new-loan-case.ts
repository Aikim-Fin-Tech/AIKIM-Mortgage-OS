import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getCurrentBanker } from "@/lib/auth/current-banker";
import { decideBankerOptionsForRole } from "@/lib/loan-cases/decide-banker-options";
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

type CustomerRow = { id: string; full_name: string; phone: string | null };

/**
 * Loads the minimum fields needed to populate the New Loan Case form's
 * customer and banker dropdowns.
 *
 * A Banker receives only their own bankers row (via decideBankerOptionsForRole)
 * and only customers linked to a loan_cases row they are assigned to — never
 * the platform-wide public.bankers/public.customers tables. Previously both
 * queries ran unfiltered for every role, so any Banker's browser received
 * every other real Banker's id/full_name/bank_name and every customer in the
 * system, regardless of whether that Banker had any case involving them
 * (confirmed during the Day 3 pilot: a Banker with zero visible cases still
 * received the full platform-wide customer list). Super Admin (and any other
 * staff role) keeps the platform-wide view, unchanged.
 *
 * Deliberately does not select ic_number, email, or address — those are
 * confidential and not needed for a picker.
 */
export async function getNewLoanCaseFormOptions(): Promise<NewLoanCaseFormOptions> {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return { customers: [], bankers: [], error: "Not authenticated" };
    }

    const supabase = await createClient();

    if (currentUser.role === "banker") {
      const ownBanker = await getCurrentBanker();

      const bankers = decideBankerOptionsForRole(
        currentUser.role,
        ownBanker ? { id: ownBanker.id, fullName: ownBanker.fullName, bankName: ownBanker.bankName ?? "" } : null,
        [],
      );

      if (!ownBanker) {
        return { customers: [], bankers, error: null };
      }

      const { data, error } = await supabase
        .from("loan_cases")
        .select("customers ( id, full_name, phone )")
        .eq("banker_id", ownBanker.id)
        .returns<{ customers: CustomerRow | null }[]>();

      if (error) {
        console.error(
          `[getNewLoanCaseFormOptions] scoped customers query failed. code=${error.code ?? "unknown"} message=${error.message}`,
        );
        return { customers: [], bankers, error: "Failed to load: customers" };
      }

      const seen = new Set<string>();
      const customers: CustomerOption[] = [];
      for (const row of data ?? []) {
        if (row.customers && !seen.has(row.customers.id)) {
          seen.add(row.customers.id);
          customers.push({ id: row.customers.id, fullName: row.customers.full_name, phone: row.customers.phone });
        }
      }
      customers.sort((a, b) => a.fullName.localeCompare(b.fullName));

      return { customers, bankers, error: null };
    }

    // Non-Banker staff roles (e.g. super_admin) retain the platform-wide view.
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

    const platformWideBankers: BankerOption[] = (bankersResult.data ?? []).map((row) => ({
      id: row.id,
      fullName: row.full_name,
      bankName: row.bank_name,
    }));

    return {
      customers,
      bankers: decideBankerOptionsForRole(currentUser.role, null, platformWideBankers),
      error: failedSections.length > 0 ? `Failed to load: ${failedSections.join(", ")}` : null,
    };
  } catch (unexpectedError) {
    const message = unexpectedError instanceof Error ? unexpectedError.message : "Unknown error";
    console.error(`[getNewLoanCaseFormOptions] Unexpected error: ${message}`);
    return { customers: [], bankers: [], error: message };
  }
}
