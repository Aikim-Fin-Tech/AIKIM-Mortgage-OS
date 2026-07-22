-- ============================================================================
-- AIKIM Mortgage OS — create public.create_loan_case (confirmed missing)
--
-- Root cause: you confirmed directly against the database that
-- public.create_loan_case does not exist ("Success. No rows returned"). The
-- two earlier migration files in this project (20260716000000_loan_case_creation.sql
-- and 20260716010000_fix_create_loan_case_rpc.sql) were apparently never
-- actually executed in the SQL Editor — this is not a naming/code mismatch,
-- the function was simply never created in this database.
--
-- Because create_loan_case's INSERT into loan_cases relies on
-- loan_cases.case_number's column DEFAULT to generate a safe case number, and
-- that default (public.generate_case_number(), backed by
-- public.case_number_counters) lives in that same never-run earlier
-- migration, this file also (re)creates those two prerequisites so this
-- migration is fully self-contained: running only this one file is enough to
-- make case creation work end-to-end. Nothing else is added beyond what
-- create_loan_case itself requires to run.
--
-- Copy this entire file into the Supabase SQL Editor and run it.
-- Idempotent: safe to run more than once. Touches no existing table rows.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Prerequisite: per-year counter table + safe case_number generator
--    (required by loan_cases.case_number's default, used below)
-- ----------------------------------------------------------------------------
create table if not exists public.case_number_counters (
  year int primary key,
  last_value int not null default 0
);

alter table public.case_number_counters enable row level security;
-- Intentionally zero policies: nobody can read/write this table directly.
-- Only the SECURITY DEFINER function below (which bypasses RLS) touches it.

create or replace function public.generate_case_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  current_year int := extract(year from now())::int;
  next_value int;
begin
  insert into public.case_number_counters (year, last_value)
  values (current_year, 1)
  on conflict (year) do update set last_value = public.case_number_counters.last_value + 1
  returning last_value into next_value;

  return 'ML-' || current_year || '-' || lpad(next_value::text, 3, '0');
end;
$$;

revoke all on function public.generate_case_number() from public;
grant execute on function public.generate_case_number() to authenticated;

alter table public.loan_cases alter column case_number set default public.generate_case_number();

-- ----------------------------------------------------------------------------
-- 2. Drop any existing create_loan_case overload before recreating it, so a
--    partial/stale attempt can never sit alongside the correct one.
-- ----------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'create_loan_case'
  loop
    execute format('drop function %s', r.signature);
  end loop;
end
$$;

-- ----------------------------------------------------------------------------
-- 3. public.create_loan_case
--
-- Columns/enums used below, confirmed against this project's schema (as
-- authored in the original Sprint 4 schema and consistently referenced by
-- both earlier migration files already in this repo) — not guessed:
--   public.loan_cases: customer_id, banker_id, created_by, property_project,
--                       property_address, loan_amount, bank_name,
--                       stage (public.loan_stage), status (public.loan_status)
--   public.customers:  full_name, phone, email, ic_number
--   Banker relationship: loan_cases.banker_id -> public.bankers(id)
--   Actor resolution:   public.user_profiles.auth_user_id = auth.uid()
--
-- SECURITY INVOKER (the default) — runs as the calling user, so the existing
-- RLS policies (customers_insert_staff, loan_cases_insert_staff,
-- customers_select_staff_or_self) are what actually authorize every insert
-- and select this function performs. It does not bypass or weaken RLS, and
-- never uses service_role. Enforcement of "existing role model" therefore
-- comes from RLS itself, not from logic duplicated in this function.
--
-- Existing-customer mode: validates p_customer_id by selecting it back
-- through RLS — if it isn't a real, visible row, the function raises.
-- New-customer mode: inserts the customer once inside this same function
-- call; because the whole function is one transaction, if the subsequent
-- loan_cases insert fails for any reason, Postgres rolls back the customer
-- insert too, so no duplicate/orphaned customer is ever left behind.
-- Banker id: validated by trying the insert with it — an invalid/nonexistent
-- banker_id fails the foreign key constraint on loan_cases.banker_id and
-- aborts the whole function, same rollback guarantee applies.
--
-- Returns public.loan_cases (a single row, not SETOF): the TypeScript caller
-- (src/app/(app)/loan-cases/new/actions.ts) does
--   const { data: newCase } = await supabase.rpc("create_loan_case", {...});
--   const createdCase = newCase as { case_number: string } | null;
-- i.e. expects `data` to be one plain object with a `case_number` field, not
-- an array or a wrapped envelope — a non-SETOF composite return is exactly
-- what produces that shape via PostgREST. No TypeScript changes are needed.
-- ----------------------------------------------------------------------------
create function public.create_loan_case(
  p_customer_mode text,
  p_customer_id uuid,
  p_customer_full_name text,
  p_customer_phone text,
  p_customer_email text,
  p_customer_ic_number text,
  p_property_project text,
  p_property_address text,
  p_loan_amount numeric,
  p_bank_name text,
  p_stage public.loan_stage,
  p_status public.loan_status,
  p_banker_id uuid
)
returns public.loan_cases
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_actor_profile_id uuid;
  v_new_case public.loan_cases;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select id into v_actor_profile_id from public.user_profiles where auth_user_id = auth.uid();

  if p_customer_mode = 'existing' then
    if p_customer_id is null then
      raise exception 'customer_id is required for existing_customer mode';
    end if;
    select id into v_customer_id from public.customers where id = p_customer_id;
    if v_customer_id is null then
      raise exception 'Selected customer was not found or is not accessible';
    end if;
  elsif p_customer_mode = 'new' then
    insert into public.customers (full_name, phone, email, ic_number)
    values (p_customer_full_name, p_customer_phone, p_customer_email, p_customer_ic_number)
    returning id into v_customer_id;
  else
    raise exception 'Invalid customer mode: %', p_customer_mode;
  end if;

  insert into public.loan_cases (
    customer_id, banker_id, created_by,
    property_project, property_address, loan_amount, bank_name, stage, status
  ) values (
    v_customer_id, p_banker_id, v_actor_profile_id,
    p_property_project, p_property_address, p_loan_amount, p_bank_name, p_stage, p_status
  )
  returning * into v_new_case;

  -- The AFTER INSERT trigger trg_log_loan_case_change (Sprint 4) fires
  -- automatically on the insert above and writes the audit_logs row itself —
  -- this function intentionally does not insert into audit_logs a second time.

  return v_new_case;
end;
$$;

revoke all on function public.create_loan_case(
  text, uuid, text, text, text, text, text, text, numeric, text, public.loan_stage, public.loan_status, uuid
) from public;
grant execute on function public.create_loan_case(
  text, uuid, text, text, text, text, text, text, numeric, text, public.loan_stage, public.loan_status, uuid
) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Force PostgREST to reload its schema cache immediately.
-- ----------------------------------------------------------------------------
notify pgrst, 'reload schema';

-- ============================================================================
-- End of migration
-- ============================================================================
