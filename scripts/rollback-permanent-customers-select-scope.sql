-- ============================================================================
-- AIKIM Mortgage OS — COMPLETE rollback for
-- 20260902010000_permanent_nonrecursive_customers_select.sql
--
-- Restores the exact pre-PR-#6 database state: customers_select_scope is
-- dropped, customers_select_staff_or_self is recreated with its exact live
-- qual, and public.is_customer_authorized_for_current_banker(uuid) — the
-- helper this migration introduced — has every grant revoked and is then
-- dropped entirely. Nothing from this migration is left behind.
--
-- Ordering matters and is enforced by doing this in one transaction: the
-- policy that references the helper (customers_select_scope) is dropped,
-- and its replacement (customers_select_staff_or_self, which does not
-- reference the helper) is created, BEFORE the helper's grants are revoked
-- and the function itself is dropped. Attempting the reverse order would
-- fail — Postgres will not let you revoke/drop a function while a live
-- policy still depends on it.
--
-- Idempotent: the policy statements use DROP POLICY IF EXISTS + CREATE
-- POLICY, safe to run more than once. The function's REVOKE statements are
-- guarded by a to_regprocedure(...) existence check (REVOKE ON FUNCTION
-- errors if the function doesn't exist, unlike DROP FUNCTION IF EXISTS) so
-- a second run, after the function is already gone, is a harmless no-op
-- rather than an error.
--
-- Transactional: wrapped in BEGIN/COMMIT so the policy swap and the
-- function teardown apply atomically — either the whole rollback lands, or
-- none of it does.
--
-- Copy this entire file into the Supabase SQL Editor and run it manually —
-- no agent executes migrations against Production.
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

do $$
begin
  if to_regprocedure('public.is_customer_authorized_for_current_banker(uuid)') is not null then
    revoke all on function public.is_customer_authorized_for_current_banker(uuid) from public;
    revoke all on function public.is_customer_authorized_for_current_banker(uuid) from anon;
    revoke all on function public.is_customer_authorized_for_current_banker(uuid) from authenticated;
  end if;
end
$$;

drop function if exists public.is_customer_authorized_for_current_banker(uuid);

commit;

notify pgrst, 'reload schema';

-- ============================================================================
-- End of rollback
-- ============================================================================
