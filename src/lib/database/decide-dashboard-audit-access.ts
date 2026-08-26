/**
 * Pure, no I/O — whether getDashboardData() (./dashboard.ts) should even
 * attempt the audit_logs query. public.audit_logs is RLS-restricted to
 * super_admin only (see docs/architecture/database.md). For every other
 * role that query cannot succeed as a super_admin's would — running it
 * anyway and lumping whatever comes back into `errors` is what previously
 * surfaced a misleading "Dashboard activity is temporarily unavailable"
 * banner for every Banker, every time, even though a role-scoped empty
 * result here is expected, correct behavior, not a failure.
 *
 * Deliberately re-states the 'super_admin' literal rather than importing
 * isSuperAdmin from @/lib/auth/super-admin — that file (via current-user.ts)
 * transitively imports the Supabase server client, which this module must
 * stay free of to remain unit-testable without mocking Supabase, matching
 * the pattern already established in this repo (e.g.
 * decide-recovery-otp-verification.ts).
 */
export function shouldFetchDashboardAuditLogs(role: string | null): boolean {
  return role === "super_admin";
}
