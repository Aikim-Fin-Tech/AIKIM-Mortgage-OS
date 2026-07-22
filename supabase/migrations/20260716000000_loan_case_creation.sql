-- ============================================================================
-- AIKIM Mortgage OS — Sprint 9A migration
--
-- Adds safe, race-condition-free case_number generation and an atomic
-- create_loan_case() RPC used by the new "+ New Loan Case" form.
--
-- Copy this entire file into the Supabase SQL Editor and run it once.
-- Safe to re-run (idempotent): uses CREATE TABLE IF NOT EXISTS, CREATE OR
-- REPLACE FUNCTION, and does not touch any existing rows.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Per-year counter table backing case_number generation
-- ----------------------------------------------------------------------------
create table if not exists public.case_number_counters (
  year int primary key,
  last_value int not null default 0
);

alter table public.case_number_counters enable row level security;
-- Intentionally zero policies on this table: nobody (not even super_admin via
-- the API) can read or write it directly. Only the SECURITY DEFINER function
-- below — which bypasses RLS — ever touches it.

-- ----------------------------------------------------------------------------
-- 2. Safe, race-condition-free case_number generator
--
-- Uses a single atomic "INSERT ... ON CONFLICT DO UPDATE ... RETURNING"
-- statement. Postgres takes a row lock as part of this statement, so two
-- concurrent callers in the same year can never receive the same number —
-- unlike "select max(...) + 1", which is a classic race condition.
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- 3. loan_cases.case_number now defaults to a freshly generated number
-- ----------------------------------------------------------------------------
alter table public.loan_cases alter column case_number set default public.generate_case_number();

-- ----------------------------------------------------------------------------
-- 4. Atomic "create a loan case" RPC
--
-- SECURITY INVOKER (the default) — deliberately. It runs as the calling user,
-- so the *existing* RLS policies (customers_insert_staff, loan_cases_insert_staff)
-- are what actually authorize this function; it does not bypass or weaken RLS
-- in any way. If either insert is rejected by RLS (e.g. the caller isn't
-- super_admin/banker/property_agent/mortgage_outsource_agent), the whole
-- function raises and Postgres rolls back everything done inside it — so a
-- newly-inserted "new customer" row is never left orphaned when the
-- loan_cases insert subsequently fails. That is PL/pgSQL's normal
-- exception-aborts-the-whole-function behaviour; no extra code is needed for
-- it here.
--
-- created_by is set from auth.uid() -> user_profiles.id resolved *inside* this
-- function, never accepted as a parameter from the browser.
-- ----------------------------------------------------------------------------
create or replace function public.create_loan_case(
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
    -- RLS on customers (customers_select_staff_or_self) governs visibility here;
    -- if the row isn't visible to this user, v_customer_id stays null below.
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

  -- Note: the AFTER INSERT trigger trg_log_loan_case_change (Sprint 4) fires
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

-- ============================================================================
-- End of Sprint 9A migration
-- ============================================================================
