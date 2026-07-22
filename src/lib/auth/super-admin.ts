import "server-only";
import { notFound } from "next/navigation";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/current-user";

/**
 * Role allowed to manage the Mortgage Rules Admin (mortgage_rules,
 * mortgage_rule_documents, document_categories). A friendlier-error
 * convenience only, mirroring STAFF_ROLES — RLS (super_admin-only insert/
 * update policies, see supabase/migrations/20260723010000_mortgage_rule_admin.sql)
 * remains the actual enforcement. See
 * docs/decisions/0002-rls-as-sole-authorization-boundary.md.
 */
export const SUPER_ADMIN_ROLE = "super_admin";

export function isSuperAdmin(role: string): boolean {
  return role === SUPER_ADMIN_ROLE;
}

/**
 * Page-level guard for every /settings/** route — 404s rather than a
 * generic "forbidden" page, same posture as an RLS-hidden loan case, so a
 * non-super_admin can't distinguish "doesn't exist" from "not allowed to
 * see it." Call at the top of every admin page before fetching any data.
 */
export async function requireSuperAdminPage(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user || !isSuperAdmin(user.role)) {
    notFound();
  }
  return user;
}
