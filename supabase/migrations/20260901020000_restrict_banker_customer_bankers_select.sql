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
-- Design principle for this revision: narrow Banker, and Banker only, to
-- an exact ownership/case-scoped condition — every non-Banker role or
-- account (including one where current_user_role() somehow resolves to
-- null) falls through to the *exact original* qual expression, verbatim,
-- so nothing is broadened and nothing is inferred for Property Agent or
-- Mortgage Outsource Agent. An earlier draft of this migration added an
-- `assigned_agent_id`/`customer_id`-based branch to bankers_select_scope
-- as a guess at what those two roles need merely to keep seeing an
-- assigned Banker's name on a case — that guess is removed here entirely;
-- their SELECT behavior on both tables is untouched, not re-derived.
--
-- What changes:
--   - bankers_select_authenticated is dropped and replaced by
--     bankers_select_scope: when current_user_role() = 'banker', the qual
--     collapses to user_profile_id = current_user_profile_id() (their own
--     row only). For every other role/account, the qual is exactly
--     auth.role() = 'authenticated' — byte-identical to the policy being
--     replaced, so Super Admin, Property Agent, Mortgage Outsource Agent,
--     Customer, and any other authenticated account keep the exact same
--     access as today.
--   - customers_select_staff_or_self is dropped and replaced by
--     customers_select_scope: when current_user_role() = 'banker', the
--     qual collapses to an EXISTS against loan_cases where customer_id
--     matches and banker_id is that Banker's own bankers.id — i.e. only
--     customers linked to a Loan Case assigned to that Banker. For every
--     other role/account, the qual is exactly
--     current_user_role() = ANY (super_admin, property_agent,
--     mortgage_outsource_agent) OR user_profile_id = current_user_profile_id()
--     — the original policy's expression with only 'banker' removed from
--     the role array, since Banker now has its own branch above. Super
--     Admin, Property Agent, Mortgage Outsource Agent, and a customer's
--     own self-access are all preserved exactly.
--
-- customers_insert_staff, customers_update_staff_or_self, customers_delete_admin,
-- and every bankers policy other than the SELECT one (bankers_insert_admin,
-- bankers_update_admin, bankers_update_self, bankers_delete_admin) are
-- entirely untouched by this migration — only the two SELECT policies
-- named above are replaced.
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
  case current_user_role()
    when 'banker'::user_role then user_profile_id = current_user_profile_id()
    else auth.role() = 'authenticated'::text
  end
);

-- ----------------------------------------------------------------------------
-- 2. public.customers — SELECT
-- ----------------------------------------------------------------------------
drop policy if exists "customers_select_staff_or_self" on public.customers;
drop policy if exists "customers_select_scope" on public.customers;

create policy "customers_select_scope" on public.customers
for select
using (
  case current_user_role()
    when 'banker'::user_role then exists (
      select 1
      from public.loan_cases lc
      where lc.customer_id = customers.id
        and lc.banker_id in (
          select b.id from public.bankers b where b.user_profile_id = current_user_profile_id()
        )
    )
    else (
      current_user_role() = ANY (ARRAY['super_admin'::user_role, 'property_agent'::user_role, 'mortgage_outsource_agent'::user_role])
      or user_profile_id = current_user_profile_id()
    )
  end
);

notify pgrst, 'reload schema';

-- ============================================================================
-- End of migration
-- ============================================================================
