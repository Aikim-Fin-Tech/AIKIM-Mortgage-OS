-- Read-only verification for the customers-SELECT-only rollback
-- (20260901030000_rollback_customers_select_scope_recursion.sql).
-- No data is modified anywhere in this file. Safe to run any number of
-- times, in any order relative to itself.

-- ----------------------------------------------------------------------------
-- Part 1: policy/function shape checks
-- ----------------------------------------------------------------------------
with function_source as (
  select pg_get_functiondef(
    'public.create_loan_case(text,uuid,text,text,text,text,text,text,numeric,text,loan_stage,loan_status,uuid)'::regprocedure
  ) as src
)
select 'customers_select_scope is absent' as check_name,
       not exists (
         select 1 from pg_policies
         where schemaname = 'public' and tablename = 'customers' and policyname = 'customers_select_scope'
       ) as passed
union all
select 'customers_select_staff_or_self is restored with the exact original qual',
       exists (
         select 1 from pg_policies
         where schemaname = 'public' and tablename = 'customers' and policyname = 'customers_select_staff_or_self'
           and qual = $Q$((current_user_role() = ANY (ARRAY['super_admin'::user_role, 'banker'::user_role, 'property_agent'::user_role, 'mortgage_outsource_agent'::user_role])) OR (user_profile_id = current_user_profile_id()))$Q$
       )
union all
select 'bankers_select_scope remains present',
       exists (
         select 1 from pg_policies
         where schemaname = 'public' and tablename = 'bankers' and policyname = 'bankers_select_scope'
       )
union all
select 'bankers_select_scope still narrows Banker to self-only (unaltered by this rollback)',
       (select qual ilike '%user_profile_id = current_user_profile_id()%' and qual ilike '%banker%'
        from pg_policies where schemaname = 'public' and tablename = 'bankers' and policyname = 'bankers_select_scope')
union all
select 'create_loan_case still forces Banker self-assignment',
       (select src ilike '%v_actor_banker_id%' and src ilike '%v_effective_banker_id%' from function_source)
union all
select 'create_loan_case still fails closed for an unlinked Banker',
       (select src ilike '%Your account is not linked to a Banker record%' from function_source);

-- ----------------------------------------------------------------------------
-- Part 2: prove the recursion is actually gone — run each of these two
-- statements separately. Each is a plain read-only SELECT COUNT(*); if the
-- mutual-recursion bug were still present, the statement touching
-- loan_cases would fail outright with "infinite recursion detected in
-- policy for relation ...". Getting back a plain integer (whatever value
-- it is) from both statements is the expected, passing result. Neither
-- statement inserts, updates, or deletes anything.
-- ----------------------------------------------------------------------------
select count(*) as loan_cases_readable from public.loan_cases;
select count(*) as customers_readable from public.customers;
