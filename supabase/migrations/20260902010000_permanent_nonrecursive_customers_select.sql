-- ============================================================================
-- AIKIM Mortgage OS — permanent, non-recursive customers SELECT RLS
--
-- Context: 20260901020000_restrict_banker_customer_bankers_select.sql's
-- customers_select_scope queried public.loan_cases directly in its Banker
-- branch, which created mutual RLS recursion with loan_cases_select_scope
-- (which itself queries public.customers) — rolled back in
-- 20260901030000_rollback_customers_select_scope_recursion.sql, restoring
-- customers_select_staff_or_self (the full pre-PR-#4 platform-wide access)
-- as a temporary measure.
--
-- This migration replaces that temporary restoration with a permanent,
-- non-recursive narrowing, verified against a live read-only Production
-- introspection (function definitions, RLS/FORCE-RLS status, schema
-- privileges, and the SQL-Editor role's own privileges) reviewed in full
-- before authoring this file:
--   - public.current_user_role() and public.current_user_profile_id() are
--     themselves SECURITY DEFINER, owned by postgres, and touch only
--     public.user_profiles — confirmed recursion-free, and confirmation
--     that this project already relies on exactly the SECURITY DEFINER
--     pattern this migration extends to one new, narrower function.
--   - The postgres role (which owns every object created via the Supabase
--     SQL Editor) has rolbypassrls = true, and none of public.bankers,
--     public.customers, or public.loan_cases have FORCE ROW LEVEL SECURITY
--     set (relforcerowsecurity = false on all three) — confirming a
--     postgres-owned SECURITY DEFINER function's internal queries against
--     these tables bypass RLS entirely, which is what breaks the cycle.
--   - authenticated/anon/PUBLIC hold only USAGE (never CREATE) on schema
--     public, and only pg_database_owner holds CREATE — confirming no
--     authenticated session can create a colliding object or (lacking
--     ownership) replace/shadow the function this migration creates.
--
-- Design: a single-purpose, per-row boolean helper —
-- public.is_customer_authorized_for_current_banker(p_customer_id uuid) —
-- replaces the direct EXISTS-against-loan_cases that caused the recursion.
-- Because the function is SECURITY DEFINER and owned by postgres, its
-- internal SELECT against public.loan_cases/public.bankers runs bypassing
-- RLS, so evaluating it from within customers_select_scope never
-- re-triggers loan_cases_select_scope. It takes exactly one argument — the
-- row being tested, never a caller-supplied identity — and resolves the
-- caller's own identity exclusively via public.current_user_profile_id(),
-- which itself resolves from auth.uid(). It returns a single boolean,
-- never a list of ids or any customer/Banker detail, minimizing what the
-- function could expose if it were ever (incorrectly) invoked directly
-- rather than solely from inside RLS.
--
-- SET search_path = '' with every reference fully schema-qualified — a
-- stricter posture than this repo's existing SET search_path = 'public'
-- convention (create_loan_case, generate_case_number(),
-- current_user_role(), current_user_profile_id()), deliberately adopted
-- for this new function since nothing depends on it resolving unqualified
-- identifiers.
--
-- What changes:
--   - Creates public.is_customer_authorized_for_current_banker(uuid).
--   - Drops customers_select_staff_or_self (the temporarily-restored,
--     full-access policy) and creates customers_select_scope: the Banker
--     branch calls the new helper; every other branch (super_admin,
--     property_agent, mortgage_outsource_agent, and a customer's own
--     self-access) is copied byte-for-byte from
--     customers_select_staff_or_self's live qual, unchanged.
--
-- Explicitly NOT touched by this migration:
--   - bankers_select_scope, loan_cases_select_scope,
--     loan_cases_insert_staff, loan_cases_update_scope,
--     loan_cases_delete_admin — none reference the new function and none
--     are altered.
--   - public.create_loan_case — Banker forced self-assignment and the
--     unlinked-Banker fail-closed exception are unrelated to RLS and
--     untouched.
--   - Application code — src/lib/database/new-loan-case.ts's Banker branch
--     already scopes its own customer query via loan_cases.banker_id
--     directly (not via the customers table's RLS), and its embedded
--     customers(...) reads in getLoanCases()/getLoanCaseByCaseNumber()/
--     dashboard.ts now evaluate customers_select_scope's Banker branch via
--     the non-recursive helper — no code change is required for correct
--     behavior.
--   - No table rows anywhere. This migration touches only one new function
--     and one table's SELECT policy.
--
-- Transactional and idempotent: wrapped in BEGIN/COMMIT; CREATE OR REPLACE
-- FUNCTION and DROP POLICY IF EXISTS + CREATE POLICY are safe to run more
-- than once. Copy this entire file into the Supabase SQL Editor and run it
-- manually — no agent executes migrations against Production.
-- ============================================================================

begin;

create or replace function public.is_customer_authorized_for_current_banker(p_customer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.loan_cases lc
    join public.bankers b on b.id = lc.banker_id
    where lc.customer_id = p_customer_id
      and b.user_profile_id = public.current_user_profile_id()
  );
$$;

revoke all on function public.is_customer_authorized_for_current_banker(uuid) from public;
revoke all on function public.is_customer_authorized_for_current_banker(uuid) from anon;
grant execute on function public.is_customer_authorized_for_current_banker(uuid) to authenticated;

drop policy if exists "customers_select_staff_or_self" on public.customers;
drop policy if exists "customers_select_scope" on public.customers;

create policy "customers_select_scope" on public.customers
for select
using (
  case current_user_role()
    when 'banker'::user_role then public.is_customer_authorized_for_current_banker(customers.id)
    else (
      (current_user_role() = ANY (ARRAY['super_admin'::user_role, 'property_agent'::user_role, 'mortgage_outsource_agent'::user_role]))
      or (user_profile_id = current_user_profile_id())
    )
  end
);

commit;

notify pgrst, 'reload schema';

-- ============================================================================
-- End of migration
-- ============================================================================
