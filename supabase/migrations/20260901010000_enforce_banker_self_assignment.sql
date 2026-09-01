-- ============================================================================
-- AIKIM Mortgage OS — enforce Banker self-assignment inside create_loan_case
--
-- Root cause (found during the Week 1 pilot, Day 3 Phase 2 authorization
-- investigation): public.create_loan_case accepted p_banker_id from the
-- calling client and inserted it into loan_cases.banker_id completely
-- unchecked against the caller's own identity. The only safeguard was the
-- loan_cases.banker_id foreign key constraint — p_banker_id merely had to
-- be *some* real row in public.bankers, not the caller's own row. Combined
-- with a separate, now-fixed app-layer bug where getNewLoanCaseFormOptions()
-- served every Banker the full platform-wide public.bankers list (real
-- id/full_name/bank_name for every Banker), any Banker had everything
-- needed to read another real Banker's UUID and successfully create a case
-- assigned to them — a cross-Banker unauthorized-write path with no
-- server-side check anywhere in the call chain.
--
-- This migration is the database-layer half of the fix (the app-layer half
-- lives in src/app/(app)/loan-cases/new/actions.ts, which now resolves and
-- forces the caller's own banker_id before ever calling this RPC). Both
-- halves independently enforce the same rule so that bypassing the Next.js
-- app entirely and calling create_loan_case directly via PostgREST with a
-- Banker's own valid session still cannot produce a cross-Banker
-- assignment — "do not rely only on hiding the UI."
--
-- What changes: when the calling user's public.user_profiles.role is
-- 'banker', the function now resolves that Banker's own public.bankers.id
-- (via bankers.user_profile_id = user_profiles.id, the same lookup already
-- used by getProfileData()/getCurrentBanker() for the My Profile page) and
-- uses it unconditionally, ignoring whatever p_banker_id was submitted.
-- Every other role (super_admin, property_agent, mortgage_outsource_agent)
-- keeps the exact prior behavior — p_banker_id is used as submitted, so
-- Super Admin's cross-Banker assignment ability is fully preserved.
--
-- Everything else about this function — SECURITY INVOKER (still runs under
-- the caller's own RLS-governed session, never bypasses or weakens RLS),
-- the existing-customer/new-customer transaction/rollback behavior, the
-- return shape, the grants — is unchanged from
-- supabase/migrations/20260716020000_create_loan_case_rpc.sql. This
-- migration only replaces the function body (CREATE OR REPLACE, same
-- signature, so no DROP/grant changes are needed) and does not touch
-- public.bankers/public.customers/public.loan_cases row-level security
-- policies themselves — loan_cases_insert_staff, customers_insert_staff,
-- and the bankers/customers SELECT policies are not committed to this repo
-- (see docs/DATABASE.md's "Not committed to this repo" note) and were not
-- possible to inspect from here; this fix intentionally scopes itself to
-- the one RPC this app actually uses for case creation, rather than
-- guessing at and rewriting policies whose current definition is unknown.
--
-- Idempotent: CREATE OR REPLACE, safe to run more than once. Touches no
-- existing table rows. Copy this entire file into the Supabase SQL Editor
-- and run it manually — no agent executes migrations against Production.
-- ============================================================================

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
  v_actor_role text;
  v_actor_banker_id uuid;
  v_effective_banker_id uuid;
  v_new_case public.loan_cases;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select id, role into v_actor_profile_id, v_actor_role
  from public.user_profiles
  where auth_user_id = auth.uid();

  -- A Banker's own banker_id always wins over p_banker_id, whatever the
  -- client submitted (see decideEffectiveBankerId in
  -- src/lib/loan-cases/decide-effective-banker-id.ts for the identical
  -- app-layer decision). Every other role's submitted value passes through
  -- unchanged. A Banker with no linked bankers row resolves to null
  -- (unassigned), same as if they had left the field blank.
  if v_actor_role = 'banker' then
    select id into v_actor_banker_id
    from public.bankers
    where user_profile_id = v_actor_profile_id;

    v_effective_banker_id := v_actor_banker_id;
  else
    v_effective_banker_id := p_banker_id;
  end if;

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
    v_customer_id, v_effective_banker_id, v_actor_profile_id,
    p_property_project, p_property_address, p_loan_amount, p_bank_name, p_stage, p_status
  )
  returning * into v_new_case;

  -- The AFTER INSERT trigger trg_log_loan_case_change (Sprint 4) fires
  -- automatically on the insert above and writes the audit_logs row itself —
  -- this function intentionally does not insert into audit_logs a second time.

  return v_new_case;
end;
$$;

-- Signature is unchanged from 20260716020000_create_loan_case_rpc.sql, so
-- the existing revoke/grant from that migration already covers this
-- replacement — re-stated here only so this file is self-contained and
-- produces a correct grant even if run against a database that somehow
-- never had the original grant applied.
revoke all on function public.create_loan_case(
  text, uuid, text, text, text, text, text, text, numeric, text, public.loan_stage, public.loan_status, uuid
) from public;
grant execute on function public.create_loan_case(
  text, uuid, text, text, text, text, text, text, numeric, text, public.loan_stage, public.loan_status, uuid
) to authenticated;

notify pgrst, 'reload schema';

-- ============================================================================
-- End of migration
-- ============================================================================
