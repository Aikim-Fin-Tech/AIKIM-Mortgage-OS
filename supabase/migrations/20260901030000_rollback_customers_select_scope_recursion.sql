-- ============================================================================
-- AIKIM Mortgage OS — EMERGENCY ROLLBACK: customers SELECT policy only
--
-- Incident: 20260901020000_restrict_banker_customer_bankers_select.sql's
-- customers_select_scope policy queries public.loan_cases in its Banker
-- branch. public.loan_cases' own (pre-existing, untouched) RLS policy
-- loan_cases_select_scope queries public.customers in its own Banker
-- branch. Together these two policies create mutual RLS recursion:
-- reading loan_cases requires expanding customers' policy, which requires
-- expanding loan_cases' policy again, without end. Postgres rejects this
-- at query-plan time, which broke real data loading in Production on the
-- Dashboard, /loan-cases, and /loan-cases/new pages immediately after
-- PR #4 merged (confirmed live against the Pilot Test Banker account).
--
-- Scope of this rollback: customers SELECT only. This migration:
--   - drops customers_select_scope (the recursive policy)
--   - restores customers_select_staff_or_self with the exact qual
--     expression captured live from Production before PR #4
--     (production-rls-policies.csv), unmodified — including 'banker' back
--     in the role array, i.e. a full revert of the customers SELECT
--     narrowing introduced by 20260901020000, not a partial one. Closing
--     that read-exposure gap properly (without recursion) is deferred to
--     a future, separately-reviewed migration — most likely via a
--     SECURITY DEFINER helper function that computes a Banker's
--     authorized customer ids without re-triggering loan_cases' RLS.
--
-- Explicitly NOT touched by this migration (see the companion read-only
-- verification query for confirmation):
--   - bankers_select_scope (20260901020000) — no reference to loan_cases
--     or customers, not implicated in the recursion, left exactly as
--     PR #4 shipped it. A Banker still only sees their own bankers row.
--   - public.create_loan_case (20260901010000) — Banker forced
--     self-assignment, and the fail-closed exception for an unlinked
--     Banker, are unrelated to RLS and untouched by this rollback.
--   - loan_cases_insert_staff, loan_cases_select_scope, or any other
--     loan_cases policy.
--   - No table rows anywhere are modified — this migration touches only
--     policy definitions on public.customers.
--
-- Transactional and idempotent: wrapped in BEGIN/COMMIT so both statements
-- apply atomically (customers is never left with zero SELECT policies
-- mid-migration); DROP POLICY IF EXISTS + CREATE POLICY is safe to run
-- more than once. Copy this entire file into the Supabase SQL Editor and
-- run it manually — no agent executes migrations against Production.
-- ============================================================================

begin;

drop policy if exists "customers_select_scope" on public.customers;
drop policy if exists "customers_select_staff_or_self" on public.customers;

create policy "customers_select_staff_or_self" on public.customers
for select
using (
  (current_user_role() = ANY (ARRAY['super_admin'::user_role, 'banker'::user_role, 'property_agent'::user_role, 'mortgage_outsource_agent'::user_role]))
  or (user_profile_id = current_user_profile_id())
);

commit;

notify pgrst, 'reload schema';

-- ============================================================================
-- End of rollback
-- ============================================================================
