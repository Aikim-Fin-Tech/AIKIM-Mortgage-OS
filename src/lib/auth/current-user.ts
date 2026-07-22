import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type CurrentUser = {
  email: string;
  fullName: string;
  /** Raw enum value from public.user_profiles.role (e.g. "super_admin"). */
  role: string;
  /** Human-readable label for display (e.g. "Super Admin"). Never render `role` directly in UI. */
  roleLabel: string;
};

const FALLBACK_ROLE = "User";

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  banker: "Banker",
  property_agent: "Property Agent",
  mortgage_outsource_agent: "Mortgage Outsource Agent",
  customer: "Customer",
};

export function formatRoleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

/**
 * Retrieves the currently authenticated user on the server, verified against
 * Supabase's auth server (via `getUser()`), plus their full_name and role from
 * `public.user_profiles`.
 *
 * Wrapped in React's `cache()` so that calling this multiple times within the
 * same request (e.g. once from the (app) layout for the Header, again from the
 * Dashboard page for the welcome text) only hits Supabase once per request —
 * not a real duplicate network/DB round trip.
 *
 * `getUser()` is used deliberately instead of `getSession()`: `getSession()` only
 * reads the (possibly stale/unverified) JWT out of cookies, whereas `getUser()`
 * re-validates it with the Supabase Auth server. Never trust a role passed in
 * from the browser — this always re-derives it server-side from user_profiles.
 *
 * Returns null when there is no authenticated user. Never throws.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return null;
  }

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("full_name, role")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (profileError) {
    console.error(`[getCurrentUser] Failed to load user_profiles: ${profileError.message}`);
  }

  const role = profile?.role ?? FALLBACK_ROLE;

  return {
    email: user.email ?? "",
    fullName: profile?.full_name ?? user.email ?? "User",
    role,
    roleLabel: formatRoleLabel(role),
  };
});
