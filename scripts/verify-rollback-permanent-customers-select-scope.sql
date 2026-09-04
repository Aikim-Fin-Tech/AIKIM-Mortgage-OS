-- Read-only verification that
-- scripts/rollback-permanent-customers-select-scope.sql fully restored the
-- exact pre-PR-#6 state. No data is modified anywhere in this file. Run
-- each section separately for clean, distinct result sets. Safe to run any
-- number of times.

-- ----------------------------------------------------------------------------
-- Section A: customers_select_staff_or_self exists with the exact
-- original qual
-- ----------------------------------------------------------------------------
select 'customers_select_staff_or_self is restored with the exact original qual' as check_name,
       exists (
         select 1 from pg_policies
         where schemaname = 'public' and tablename = 'customers' and policyname = 'customers_select_staff_or_self'
           and qual = $Q$((current_user_role() = ANY (ARRAY['super_admin'::user_role, 'banker'::user_role, 'property_agent'::user_role, 'mortgage_outsource_agent'::user_role])) OR (user_profile_id = current_user_profile_id()))$Q$
       ) as passed

-- ----------------------------------------------------------------------------
-- Section B: customers_select_scope is absent
-- ----------------------------------------------------------------------------
union all
select 'customers_select_scope is absent',
       not exists (
         select 1 from pg_policies
         where schemaname = 'public' and tablename = 'customers' and policyname = 'customers_select_scope'
       )

-- ----------------------------------------------------------------------------
-- Section C: the helper function is absent entirely
-- ----------------------------------------------------------------------------
union all
select 'is_customer_authorized_for_current_banker(uuid) is absent',
       to_regprocedure('public.is_customer_authorized_for_current_banker(uuid)') is null

-- ----------------------------------------------------------------------------
-- Section D: no EXECUTE grants remain for the helper (vacuously true once
-- the function itself is gone, but checked explicitly for completeness —
-- this returns 0 rows if the function is absent, or lists any lingering
-- grant if it somehow still exists)
-- ----------------------------------------------------------------------------
union all
select 'no EXECUTE grants remain for the helper',
       not exists (
         select 1
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         left join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a on true
         where n.nspname = 'public'
           and p.proname = 'is_customer_authorized_for_current_banker'
           and a.privilege_type = 'EXECUTE'
       );

-- Expect all 4 rows to show passed = true.
