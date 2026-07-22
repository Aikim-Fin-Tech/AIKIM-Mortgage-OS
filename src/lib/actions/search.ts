"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Global search server action. Runs entirely server-side with the authenticated
 * Supabase client, so every result is already scoped by RLS to whatever the
 * current user can see — there is no separate authorization check needed here.
 *
 * Security notes:
 *  - Every filter below uses the Supabase query builder's `.ilike(column, value)`
 *    form, which parameterizes the value through PostgREST. Nothing here
 *    concatenates the search string into a raw SQL statement.
 *  - `%` and `_` (ILIKE wildcards) in the user's input are escaped before being
 *    wrapped in `%...%`, so a search for e.g. "50%" can't widen the match.
 *  - customers.ic_number (NRIC) is intentionally NOT searched or returned —
 *    it's sensitive PII and isn't needed for a "find this record" search.
 *  - The raw query text is never logged, only error codes/messages.
 */

export type SearchResultType = "Loan Case" | "Customer" | "Banker";

export type SearchResult = {
  type: SearchResultType;
  id: string;
  primaryLabel: string;
  secondaryLabel: string;
  /** Null when no detail route exists yet for this result type. */
  href: string | null;
};

const RESULT_LIMIT = 8;
const PER_QUERY_LIMIT = 5;

function escapeForIlike(value: string): string {
  return value.replace(/[%_]/g, (match) => `\\${match}`);
}

export async function globalSearch(rawQuery: string): Promise<SearchResult[]> {
  const query = rawQuery.trim();
  if (query.length < 2) {
    return [];
  }

  const pattern = `%${escapeForIlike(query)}%`;

  try {
    const supabase = await createClient();

    const [caseByNumber, caseByProject, customersByName, customersByPhone, bankersByName] = await Promise.all([
      supabase.from("loan_cases").select("case_number, property_project").ilike("case_number", pattern).limit(PER_QUERY_LIMIT),
      supabase.from("loan_cases").select("case_number, property_project").ilike("property_project", pattern).limit(PER_QUERY_LIMIT),
      supabase.from("customers").select("id, full_name, phone").ilike("full_name", pattern).limit(PER_QUERY_LIMIT),
      supabase.from("customers").select("id, full_name, phone").ilike("phone", pattern).limit(PER_QUERY_LIMIT),
      supabase.from("bankers").select("id, full_name, bank_name").ilike("full_name", pattern).limit(PER_QUERY_LIMIT),
    ]);

    const results: SearchResult[] = [];
    const seenCaseNumbers = new Set<string>();
    const seenCustomerIds = new Set<string>();

    for (const res of [caseByNumber, caseByProject]) {
      if (res.error) {
        console.error(`[globalSearch] loan_cases query failed. code=${res.error.code ?? "unknown"}`);
        continue;
      }
      for (const row of res.data ?? []) {
        if (seenCaseNumbers.has(row.case_number)) continue;
        seenCaseNumbers.add(row.case_number);
        results.push({
          type: "Loan Case",
          id: row.case_number,
          primaryLabel: row.case_number,
          secondaryLabel: row.property_project,
          href: `/loan-cases/${row.case_number}`,
        });
      }
    }

    for (const res of [customersByName, customersByPhone]) {
      if (res.error) {
        console.error(`[globalSearch] customers query failed. code=${res.error.code ?? "unknown"}`);
        continue;
      }
      for (const row of res.data ?? []) {
        if (seenCustomerIds.has(row.id)) continue;
        seenCustomerIds.add(row.id);
        results.push({
          type: "Customer",
          id: row.id,
          primaryLabel: row.full_name,
          secondaryLabel: row.phone ?? "",
          // No customer detail route exists yet — show the result without a link.
          href: null,
        });
      }
    }

    if (bankersByName.error) {
      console.error(`[globalSearch] bankers query failed. code=${bankersByName.error.code ?? "unknown"}`);
    } else {
      for (const row of bankersByName.data ?? []) {
        results.push({
          type: "Banker",
          id: row.id,
          primaryLabel: row.full_name,
          secondaryLabel: row.bank_name,
          // No banker detail route exists yet — show the result without a link.
          href: null,
        });
      }
    }

    return results.slice(0, RESULT_LIMIT);
  } catch (unexpectedError) {
    const message = unexpectedError instanceof Error ? unexpectedError.message : "Unknown error";
    console.error(`[globalSearch] Unexpected error: ${message}`);
    return [];
  }
}
