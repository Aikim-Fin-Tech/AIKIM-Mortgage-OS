# 0002. RLS as the sole authorization boundary

Status: Accepted (retroactive)
Date: 2026-07-21

## Context

Multiple roles (`super_admin`, `banker`, `property_agent`, `mortgage_outsource_agent`,
`customer`) need different visibility into the same tables. Authorization could live
in application code, in Postgres RLS, or both.

## Decision

Row Level Security is the actual authorization boundary. Any application-level role
check (e.g. `STAFF_ROLES` in `createLoanCase`) is a UX convenience for a faster,
friendlier error — never a substitute for RLS, and never trusted alone.

## Consequences

- A missing or wrong RLS policy is a real security bug, even if app code "checks" the
  role — app checks must never be treated as sufficient.
- Every new table/query must have its RLS policy considered before shipping, not
  after.
- Cost: RLS policies aren't currently committed to this repo (see
  [../architecture/database.md](../architecture/database.md)) — a real gap this
  decision creates urgency around.

## Evidence

Comments in `src/app/(app)/loan-cases/new/actions.ts` ("RLS remains the actual
enforcement, this app-level check is not a substitute for it"), `create_loan_case`'s
`SECURITY INVOKER` design in `supabase/migrations/`.
