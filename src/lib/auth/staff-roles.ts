/**
 * Roles allowed to create/modify loan case data (loan cases themselves, and
 * now documents attached to them). Mirrors the *_insert_staff RLS policies —
 * this is a friendlier-error convenience only, never a substitute for RLS.
 * See docs/architecture/security.md and docs/decisions/0002-rls-as-sole-authorization-boundary.md.
 */
export const STAFF_ROLES = new Set(["super_admin", "banker", "property_agent", "mortgage_outsource_agent"]);
