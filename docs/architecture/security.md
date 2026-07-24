# Security

> Referenced throughout [../DATABASE.md](../DATABASE.md) (RLS inventory) and
> [../AI_HANDOVER.md](../AI_HANDOVER.md) ("Things You Must Never Do").

## Authorization model

RLS is the only real authorization boundary. App-level role checks (e.g.
`STAFF_ROLES` in `createLoanCase`) exist for a friendly error message only — never
treat them as sufficient on their own. See
[../decisions/0002-rls-as-sole-authorization-boundary.md](../decisions/0002-rls-as-sole-authorization-boundary.md).

## Session handling

- `proxy.ts` refreshes the session cookie and enforces route protection before any
  page renders.
- Server-side identity is always `supabase.auth.getUser()` (verified against Supabase
  Auth), never `getSession()` and never trusted from the browser.

## Client boundary

- `src/lib/supabase/client.ts` and `server.ts` use the anon key only.
  `service_role` must never appear in this codebase.
- `src/lib/supabase.ts` is deprecated and RLS-blind — never import in new code.

## Admin surfaces (`/settings/**`)

- Page-level guard (`requireSuperAdminPage()`, `src/lib/auth/super-admin.ts`) calls
  `notFound()` for any non-`super_admin` — a 404, not a "forbidden" page, so a
  denied user can't distinguish "doesn't exist" from "not allowed." Same posture
  RLS already gives an RLS-hidden loan case.
  Every Server Action under `/settings/**` independently re-checks the role too
  (`requireSuperAdmin()`), same friendly-error-only convention as `STAFF_ROLES`
  elsewhere — RLS (`super_admin`-only INSERT/UPDATE, see
  `20260723010000_mortgage_rule_admin.sql`) is still the real boundary.
- The Sidebar only *hides* the Settings link for non-`super_admin` — nav
  visibility, not a security boundary in itself; the page guard and RLS above are
  what actually stop access.
- `mortgage_rules` has no DELETE RLS policy at all — not even `super_admin` can
  hard-delete a rule through the database, only deactivate it. Enforced at the
  database level, not just as an application convention.

## Postgres function security

- Default `SECURITY INVOKER`. `SECURITY DEFINER` only for narrow, audited cases like
  `generate_case_number()` (bypasses RLS solely to reach a table with zero policies).

## PII handling

- NRIC/IC numbers are masked before rendering (`maskIcNumber()`).
- IC numbers are excluded from the customer picker and from global search.
- Never log full RPC payloads, secrets, tokens, cookies, or raw NRIC numbers — error
  code/message only.
- **Recognized income, commitment, and DSR figures (Sprint 6.3B-1 Income
  Knowledge, Sprint 6.3B-2 Commitment Knowledge, Sprint 6.3B-3 DSR Rules
  Knowledge)**: `evidence.value` and `derivation_results.result_value` — raw
  and recognized income amounts; raw and recognized commitment amounts; and,
  for `domain = 'dsr'` rows, the aggregate figures `dsrRatio`,
  `totalRecognizedIncome`, `totalRecognizedCommitments`, and
  `proposedInstalmentAmount` — are shown unmasked to any RLS-permitted staff
  role — the same posture already applied to `loan_cases.loan_amount` and other
  financial figures staff need to underwrite a case. This is a recorded decision,
  made explicitly during Sprint 6.3B-1's docs pass (a `security-reviewer` pass
  flagged it as a real open question, not something silently always true) and
  confirmed to apply identically to Sprint 6.3B-2's commitment figures and
  Sprint 6.3B-3's DSR figures under the same policy: masking in this codebase
  is reserved for government-ID-class identifiers (NRIC/IC), not general
  financial figures. `evidence`/`derivation_results` access is still gated by
  RLS (`20260726020000_income_knowledge_rls.sql`,
  `20260727020000_commitment_knowledge_rls.sql`,
  `20260728020000_dsr_knowledge_rls.sql`) — this decision is about display
  formatting to an already-authorized viewer, not about widening who can see the row
  at all.

## Known gaps

- `audit_logs` RLS restricts reads to `super_admin` — confirm with `product-manager`
  before building more UI on it.
- No app-level rate limiting on `login` or `globalSearch`.
- No committed RLS policy definitions in this repo (see [database.md](database.md)) —
  review actual live policies before Sprint 6.

## What `security-reviewer` checks

1. RLS bypass (`service_role`, unjustified `SECURITY DEFINER`).
2. Client-trusted role/id/`created_by` fields.
3. PII/secret leakage in logs.
4. Unvalidated form input reaching the database.
5. New PII fields without a masking/exclusion plan.
