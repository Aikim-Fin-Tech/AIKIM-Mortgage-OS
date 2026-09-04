-- ============================================================================
-- AIKIM Mortgage OS — rollback for
-- 20260902010000_permanent_nonrecursive_customers_select.sql
--
-- Restores customers_select_staff_or_self with its exact live-Production
-- qual (unchanged from the PR #5 hotfix restoration), dropping the
-- non-recursive customers_select_scope policy. The helper function
-- public.is_customer_authorized_for_current_banker(uuid) is left in place
-- by default — it is unused once no policy references it, has no side
-- effects, and grants nothing by existing; drop it only if you specifically
-- want it gone (see the commented-out statement at the end).
--
-- Transactional and idempotent: wrapped in BEGIN/COMMIT; DROP POLICY IF
-- EXISTS + CREATE POLICY is safe to run more than once. Copy this entire
-- file into the Supabase SQL Editor and run it manually.
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

-- Optional — only if you want the now-unused helper function removed too;
-- not required for a complete, safe rollback of the policy itself:
-- drop function if exists public.is_customer_authorized_for_current_banker(uuid);

-- ============================================================================
-- End of rollback
-- ============================================================================
