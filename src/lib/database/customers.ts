import { createClient } from "@/lib/supabase/server";
import { maskIcNumber } from "@/lib/customers/mask-ic-number";

/**
 * Read-only data access for the Customers list page.
 *
 * public.customers columns verified against existing usage elsewhere in this
 * repo before writing this query — id/full_name/phone are already selected in
 * src/lib/database/new-loan-case.ts and src/lib/actions/search.ts;
 * email/ic_number are inserted by the create_loan_case RPC's "new customer"
 * branch and read in src/lib/database/loan-case-details.ts;
 * created_at is embedded via loan_cases in src/lib/database/timeline.ts.
 * Nothing here is a guessed column.
 *
 * This module only performs SELECTs. It never inserts, updates, or deletes
 * anything, and never uses the service_role key — only the normal
 * cookie-authenticated Supabase server client, same as getLoanCases().
 *
 * Which rows come back is governed entirely by RLS for the currently
 * authenticated session (customers_select_scope /
 * customers_select_staff_or_self, whichever policy is currently live) — this
 * function applies no additional client-side role filtering of its own, and
 * must not: RLS is the sole authorization boundary here, per
 * docs/decisions/0002-rls-as-sole-authorization-boundary.md.
 */

export type Customer = {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  /** Already masked, e.g. "XXXXXX-XX-1234". Never the raw ic_number. */
  icNumberMasked: string | null;
  createdAt: string;
};

type CustomerRow = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  ic_number: string | null;
  created_at: string;
};

function mapRow(row: CustomerRow): Customer {
  return {
    id: row.id,
    fullName: row.full_name,
    phone: row.phone,
    email: row.email,
    icNumberMasked: row.ic_number ? maskIcNumber(row.ic_number) : null,
    createdAt: row.created_at,
  };
}

export type GetCustomersResult = {
  customers: Customer[];
  error: string | null;
};

/**
 * Fetches every customer visible to the current authenticated user for the
 * Customers list page.
 *
 * Never throws. On a query error, `customers` comes back empty and `error`
 * is set to a safe message the caller can choose to surface — the
 * underlying Supabase error is only ever written to the server console,
 * never returned to the browser as-is. A genuinely empty (or
 * RLS-scoped-to-empty) result set is not an error: `customers` is simply
 * `[]` and `error` stays `null` — this is the expected shape for, e.g., a
 * Banker with no assigned cases yet, not a failure to surface. Matches the
 * exact error/empty semantics already established by getLoanCases().
 */
export async function getCustomers(): Promise<GetCustomersResult> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("customers")
      .select("id, full_name, phone, email, ic_number, created_at")
      .order("created_at", { ascending: false })
      .returns<CustomerRow[]>();

    if (error) {
      // Never log the Supabase client, keys, cookies, headers, or raw ic_number — only the error message/code.
      console.error(
        `[getCustomers] Supabase query failed. code=${error.code ?? "unknown"} message=${error.message}`,
      );
      return { customers: [], error: error.message };
    }

    if (!data || data.length === 0) {
      console.log(
        "[getCustomers] Supabase data used — query succeeded but returned zero rows " +
          "(either the table is empty or RLS scoped the current user to no customers).",
      );
      return { customers: [], error: null };
    }

    const customers = data.map(mapRow);

    console.log(`[getCustomers] Supabase data used — loaded ${customers.length} customer(s).`);
    return { customers, error: null };
  } catch (unexpectedError) {
    const message = unexpectedError instanceof Error ? unexpectedError.message : "Unknown error";
    console.error(`[getCustomers] Unexpected error while fetching customers: ${message}`);
    return { customers: [], error: message };
  }
}
