-- ============================================================================
-- AIKIM Mortgage OS — restrict Banker SELECT access on public.bankers and
-- public.customers to their own authorized scope
--
-- Root cause, confirmed against a live read-only export of Production's
-- actual RLS policies (production-rls-policies.csv), reviewed in full
-- before authoring this file:
--
--   bankers_select_authenticated  (SELECT, qual: auth.role() = 'authenticated')
--     — ANY authenticated user, any role, can read every row of
--       public.bankers. Not role-scoped, not ownership-scoped, at all.
--
--   customers_select_staff_or_self  (SELECT, qual: current_user_role() = ANY
--     (super_admin, banker, property_agent, mortgage_outsource_agent))
--     OR user_profile_id = current_user_profile_id())
--     — every staff role, including Banker, can read every row of
--       public.customers, regardless of any case relationship.
--
-- This is a database-layer read exposure independent of (and not fixed by)
-- 20260901010000_enforce_banker_self_assignment.sql or any app-layer query
-- scoping in src/lib/database/new-loan-case.ts — those only narrow what the
-- Next.js app *asks for*; a Banker's own valid session could always read
-- the full tables directly via the Supabase REST API, bypassing the app
-- entirely. This migration closes that at the only layer that actually
-- enforces it: RLS itself.
--
-- What changes:
--   - bankers_select_authenticated is dropped and replaced by
--     bankers_select_scope: super_admin keeps full access; every other
--     authenticated user can read only their own linked bankers row
--     (user_profile_id = current_user_profile_id()) OR the bankers row
--     attached to a loan_cases row they can otherwise legitimately see as
--     that case's assigned_agent or as the case's own customer — the
--     minimum needed to keep rendering an "Assigned Banker" name on any
--     case a non-Banker staff member or customer is already allowed to
--     view (e.g. the Loan Cases list's `bankers ( full_name )` embed in
--     src/lib/database/loan-cases.ts).
--   - customers_select_staff_or_self is dropped and replaced by
--     customers_select_scope: super_admin, property_agent, and
--     mortgage_outsource_agent keep the EXACT prior unrestricted access
--     (deliberately not narrowed — see the note below on why). Banker is
--     removed from that blanket branch and instead gets a new, narrow
--     branch: only customers reachable through a loan_cases row where
--     banker_id is that Banker's own bankers.id. The customer's own
--     self-access branch (user_profile_id = current_user_profile_id()) is
--     preserved unchanged for the `customer` role.
--
-- Explicitly NOT changed, and flagged rather than guessed at: whether
-- property_agent's and mortgage_outsource_agent's own customer/banker
-- visibility should itself eventually be narrowed to their own
-- assigned_agent_id scope (matching the same principle applied to Banker
-- here) is a real open question this migration does not answer — their
-- current blanket "any staff role" access is left completely untouched.
-- The `assigned_agent_id = current_user_profile_id()` branch inside the new
-- bankers_select_scope policy is this migration's own inference (from
-- loan_cases_select_scope's existing shape) about what a property_agent or
-- mortgage_outsource_agent needs merely to keep seeing an assigned Banker's
-- *name* on a case they're already permitted to view — it has not been
-- exercised against a live property_agent/mortgage_outsource_agent account
-- this session. Recommend a live QA pass with such an account, in staging,
-- before running this against Production.
--
-- customers_insert_staff and customers_update_staff_or_self, and every
-- bankers policy other than the SELECT one, are entirely untouched by this
-- migration — only the two SELECT policies named above are replaced.
--
-- Idempotent: every statement is `drop policy if exists` followed by
-- `create policy`, safe to run more than once. Touches no existing table
-- rows — only policy definitions. Copy this entire file into the Supabase
-- SQL Editor and run it manually — no agent executes migrations against
-- Production.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. public.bankers — SELECT
-- ----------------------------------------------------------------------------
drop policy if exists "bankers_select_authenticated" on public.bankers;
drop policy if exists "bankers_select_scope" on public.bankers;

create policy "bankers_select_scope" on public.bankers
for select
using (
  current_user_role() = 'super_admin'::user_role
  or user_profile_id = current_user_profile_id()
  or exists (
    select 1
    from public.loan_cases lc
    where lc.banker_id = bankers.id
      and (
        lc.assigned_agent_id = current_user_profile_id()
        or lc.customer_id in (
          select c.id from public.customers c where c.user_profile_id = current_user_profile_id()
        )
      )
  )
);

-- ----------------------------------------------------------------------------
-- 2. public.customers — SELECT
-- ----------------------------------------------------------------------------
drop policy if exists "customers_select_staff_or_self" on public.customers;
drop policy if exists "customers_select_scope" on public.customers;

create policy "customers_select_scope" on public.customers
for select
using (
  -- Property Agent and Mortgage Outsource Agent: unchanged, unrestricted —
  -- deliberately not narrowed (see header note above).
  current_user_role() = ANY (ARRAY['super_admin'::user_role, 'property_agent'::user_role, 'mortgage_outsource_agent'::user_role])
  -- A customer viewing their own record — unchanged from the prior policy.
  or user_profile_id = current_user_profile_id()
  -- Banker: narrowed from "every customer" to only customers reachable
  -- through a loan_cases row this Banker is the assigned banker_id for.
  or exists (
    select 1
    from public.loan_cases lc
    where lc.customer_id = customers.id
      and lc.banker_id in (
        select b.id from public.bankers b where b.user_profile_id = current_user_profile_id()
      )
  )
);

notify pgrst, 'reload schema';

-- ============================================================================
-- End of migration
-- ============================================================================
