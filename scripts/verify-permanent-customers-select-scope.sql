-- Read-only verification for
-- 20260902010000_permanent_nonrecursive_customers_select.sql.
-- No data is modified anywhere in this file. Run each section separately
-- for clean, distinct result sets. Safe to run any number of times.

-- ----------------------------------------------------------------------------
-- Section A: helper function shape — owner, SECURITY DEFINER, STABLE,
-- search_path, exact EXECUTE grants
-- ----------------------------------------------------------------------------
select
  pg_get_userbyid(p.proowner)  as owner,
  p.prosecdef                  as is_security_definer,
  case p.provolatile
    when 'i' then 'IMMUTABLE'
    when 's' then 'STABLE'
    when 'v' then 'VOLATILE'
  end                          as volatility,
  p.proconfig                  as proconfig_settings,
  pg_get_functiondef(p.oid)    as full_definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'is_customer_authorized_for_current_banker';

select
  coalesce(r.rolname, 'PUBLIC') as grantee,
  a.privilege_type
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
left join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a on true
left join pg_roles r on r.oid = a.grantee
where n.nspname = 'public' and p.proname = 'is_customer_authorized_for_current_banker'
order by grantee, privilege_type;

-- Expect: owner postgres; is_security_definer true; volatility STABLE;
-- proconfig contains search_path= (empty); grants: authenticated/EXECUTE
-- only — no PUBLIC, no anon row.

-- ----------------------------------------------------------------------------
-- Section B: old/new customers policy presence and exact branches
-- ----------------------------------------------------------------------------
select schemaname, tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'customers' and cmd = 'SELECT'
order by policyname;

select 'customers_select_staff_or_self is absent' as check_name,
       not exists (
         select 1 from pg_policies
         where schemaname = 'public' and tablename = 'customers' and policyname = 'customers_select_staff_or_self'
       ) as passed
union all
select 'customers_select_scope exists',
       exists (
         select 1 from pg_policies
         where schemaname = 'public' and tablename = 'customers' and policyname = 'customers_select_scope'
       )
union all
select 'Banker branch calls the non-recursive helper',
       (select qual ilike '%is_customer_authorized_for_current_banker%'
        from pg_policies where schemaname = 'public' and tablename = 'customers' and policyname = 'customers_select_scope')
union all
select 'Non-Banker branch preserves super_admin/property_agent/mortgage_outsource_agent',
       (select qual ilike '%super_admin%' and qual ilike '%property_agent%' and qual ilike '%mortgage_outsource_agent%'
        from pg_policies where schemaname = 'public' and tablename = 'customers' and policyname = 'customers_select_scope')
union all
select 'Non-Banker branch preserves customer self-access',
       (select qual ilike '%user_profile_id = current_user_profile_id()%'
        from pg_policies where schemaname = 'public' and tablename = 'customers' and policyname = 'customers_select_scope');

-- ----------------------------------------------------------------------------
-- Section C: bankers_select_scope and create_loan_case unchanged
-- ----------------------------------------------------------------------------
select 'bankers_select_scope still present and unaltered' as check_name,
       (select qual ilike '%user_profile_id = current_user_profile_id()%' and qual ilike '%authenticated%'
        from pg_policies where schemaname = 'public' and tablename = 'bankers' and policyname = 'bankers_select_scope');

with function_source as (
  select pg_get_functiondef(
    'public.create_loan_case(text,uuid,text,text,text,text,text,text,numeric,text,loan_stage,loan_status,uuid)'::regprocedure
  ) as src
)
select 'create_loan_case still forces Banker self-assignment' as check_name,
       (select src ilike '%v_actor_banker_id%' and src ilike '%v_effective_banker_id%' from function_source) as passed
union all
select 'create_loan_case still fails closed for an unlinked Banker',
       (select src ilike '%Your account is not linked to a Banker record%' from function_source);

-- ----------------------------------------------------------------------------
-- Section D: no FORCE ROW LEVEL SECURITY changes on any of the three tables
-- ----------------------------------------------------------------------------
select
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced_for_owner
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('customers', 'loan_cases', 'bankers');

-- Expect: rls_enabled = true and rls_forced_for_owner = false for all three,
-- identical to the pre-migration introspection.

-- ----------------------------------------------------------------------------
-- Section E: prove the recursion is gone — plain read-only reads
-- ----------------------------------------------------------------------------
select count(*) as loan_cases_readable from public.loan_cases;
select count(*) as customers_readable from public.customers;

-- Note: these SQL-Editor reads only prove the absence of a plan-time
-- recursion error (the SQL Editor typically runs as a role that bypasses
-- RLS entirely). They do NOT prove correct authorization for a real
-- `authenticated` session. Final verification must additionally include a
-- live smoke test under the actual Pilot Test Banker session (and ideally
-- Super Admin / Property Agent / Mortgage Outsource Agent sessions).
