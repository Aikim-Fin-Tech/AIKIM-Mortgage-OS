-- ============================================================================
-- AIKIM Mortgage OS — fix create_loan_case's "new customer" branch: RLS
-- violation on INSERT ... RETURNING
--
-- STATUS: authored only — NOT executed. This file has not been run against
-- Production. No agent executes migrations; a human must copy this file
-- into the Supabase SQL Editor and run it manually.
--
-- Root cause (found during a live Pilot walkthrough, then diagnosed via a
-- read-only investigation of this session, and confirmed by the exact
-- Production error): every "New Customer" Loan Case creation by every
-- Banker failed with:
--   PostgreSQL 42501 — new row violates row-level security policy for
--   table "customers"
--   (surfaced to the app as HTTP 403 from
--   /rest/v1/rpc/create_loan_case, and shown to the user as "You do not
--   have permission to create loan cases.")
--
-- Mechanism: the "new customer" branch used
--   insert into public.customers (...) values (...) returning id into v_customer_id;
-- A RETURNING clause on INSERT requires the newly-inserted row to also pass
-- the table's SELECT policy — not just the INSERT policy's WITH CHECK — so
-- Postgres can return it. customers_select_scope's Banker branch is
-- is_customer_authorized_for_current_banker(customers.id), which checks
-- whether a public.loan_cases row already links this customer to this
-- Banker. At the exact moment the customer row is inserted, no such
-- loan_cases row exists yet — it is only created by the *next* statement
-- in this same function, inside the same still-open transaction. So for
-- every Banker, every time, in "new customer" mode, the RETURNING clause's
-- implicit SELECT-policy check was structurally guaranteed to fail — this
-- was never a Production configuration problem, account problem, or
-- RLS-policy-logic problem. customers_insert_staff, loan_cases_insert_staff,
-- customers_select_scope, and the Banker's own account/bankers row are all
-- confirmed correct and are NOT changed by this migration.
--
-- What changes: the "new customer" branch now generates the customer's id
-- explicitly (gen_random_uuid(), matching customers.id's own column
-- default) *before* inserting, and inserts it as an explicit column value
-- with no RETURNING clause at all. A plain INSERT with no RETURNING only
-- has to satisfy the INSERT policy's WITH CHECK — it never needs the row to
-- be SELECT-visible to the caller, which is exactly what removes the
-- chicken-and-egg failure. Every other line of this function — the
-- signature, return type, SECURITY INVOKER, search_path, the
-- auth.uid()/user_profiles/role lookup, Banker self-assignment enforcement
-- (Revision 2's fail-closed unlinked-Banker check included), the
-- "existing customer" branch, the loan_cases INSERT, and the AFTER INSERT
-- audit trigger's behavior — is copied byte-for-byte from
-- supabase/migrations/20260901010000_enforce_banker_self_assignment.sql,
-- unchanged.
--
-- Explicitly NOT touched by this migration:
--   - customers_select_scope, customers_insert_staff, loan_cases_insert_staff,
--     or any other RLS policy — none are broadened, narrowed, or otherwise
--     modified. This is a pure function-body fix.
--   - create_loan_case's SECURITY INVOKER posture — still runs under the
--     caller's own RLS-governed session; RLS remains the actual
--     authorization boundary for both inserts, per
--     docs/decisions/0002-rls-as-sole-authorization-boundary.md. This
--     migration does not convert the function to SECURITY DEFINER.
--   - Cross-Banker visibility or access — nothing about who can read which
--     rows changes. Only how the new customer's id is obtained changes.
--   - The "existing customer" branch, Banker self-assignment, the
--     loan_cases INSERT, and the audit trigger — copied unchanged.
--   - public.customers/public.loan_cases table schema, grants, or triggers.
--
-- Idempotent: CREATE OR REPLACE, same signature, safe to run more than
-- once. Touches no existing table rows. Copy this entire file into the
-- Supabase SQL Editor and run it manually — no agent executes migrations
-- against Production.
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
  -- unchanged. A Banker with no linked bankers row is rejected outright
  -- (Revision 2, below) rather than resolving to a null/unassigned case.
  if v_actor_role = 'banker' then
    select id into v_actor_banker_id
    from public.bankers
    where user_profile_id = v_actor_profile_id;

    if v_actor_banker_id is null then
      raise exception 'Your account is not linked to a Banker record. Contact an administrator.';
    end if;

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
    -- Fix: generate the id explicitly and insert it as a column value,
    -- with no RETURNING clause. A RETURNING clause would additionally
    -- require the newly-inserted row to pass customers_select_scope's
    -- SELECT policy before Postgres can hand it back — and for a Banker,
    -- that policy is satisfied only once a loan_cases row links this
    -- customer to them, which does not exist until the *next* statement
    -- below. See this file's header for the full incident writeup.
    v_customer_id := gen_random_uuid();
    insert into public.customers (id, full_name, phone, email, ic_number)
    values (v_customer_id, p_customer_full_name, p_customer_phone, p_customer_email, p_customer_ic_number);
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
-- the existing revoke/grant already covers this replacement — re-stated
-- here only so this file is self-contained and produces a correct grant
-- even if run against a database that somehow never had it applied.
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
