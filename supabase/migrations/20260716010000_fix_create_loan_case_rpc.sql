-- ============================================================================
-- AIKIM Mortgage OS — fix for PGRST202 on public.create_loan_case
--
-- Root cause: PostgREST reported "Could not find the function
-- public.create_loan_case(p_bank_name, p_banker_id, ...)" in its schema cache.
-- The parameter names in src/app/(app)/loan-cases/new/actions.ts already match
-- the function defined in 20260716000000_loan_case_creation.sql exactly, so
-- this is not a naming mismatch in the code. The only ways PostgREST ends up
-- unable to resolve a function whose SQL text is already correct are:
--   (a) that migration was never actually executed against this database, or
--   (b) it was executed, but PostgREST's schema cache hasn't picked it up, or
--   (c) an earlier/different-signature draft of create_loan_case already
--       exists in the database, creating an overload PostgREST can't
--       disambiguate from named JSON parameters.
-- This migration is written to fix all three at once: it explicitly drops any
-- existing function(s) named create_loan_case in the public schema regardless
-- of their signature, recreates the correct one, and explicitly asks
-- PostgREST to reload its schema cache.
--
-- Copy this entire file into the Supabase SQL Editor and run it.
-- Idempotent: safe to run more than once. Does not touch any table data and
-- does not redefine anything else from the original schema.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Drop every existing overload of public.create_loan_case, whatever its
--    current signature happens to be. This removes any stale/mismatched
--    draft that could be causing PostgREST's ambiguity.
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
-- 2. Recreate create_loan_case with the exact parameter names the app sends.
--
-- Columns/enums used below, confirmed against this project's schema files
-- (Sprint 4 schema + 20260716000000_loan_case_creation.sql), not guessed:
--   public.loan_cases:   customer_id, banker_id, created_by, property_project,
--                        property_address, loan_amount, bank_name, stage
--                        (public.loan_stage), status (public.loan_status)
--   public.customers:    full_name, phone, email, ic_number
--   banker relationship: loan_cases.banker_id -> public.bankers(id)
--
-- SECURITY INVOKER (the default) — deliberate, unchanged from the original
-- migration. It runs as the calling user, so the existing RLS policies
-- (customers_insert_staff, loan_cases_insert_staff) are what actually
-- authorize this function; nothing here bypasses or weakens RLS, and
-- service_role is never used.
--
-- Returns public.loan_cases (a single row, not SETOF) because the TypeScript
-- caller (src/app/(app)/loan-cases/new/actions.ts) does:
--   const { data: newCase } = await supabase.rpc("create_loan_case", {...});
--   const createdCase = newCase as { case_number: string } | null;
-- i.e. it expects `data` to be one plain object with a `case_number` field,
-- not an array and not a wrapped JSON envelope. A non-SETOF composite return
-- type is exactly what produces that shape via PostgREST, so this return type
-- is unchanged from the original migration and needs no TypeScript changes.
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
-- 3. Force PostgREST to reload its schema cache immediately, instead of
--    waiting for its normal auto-detection interval.
-- ----------------------------------------------------------------------------
notify pgrst, 'reload schema';

-- ============================================================================
-- End of fix migration
-- ============================================================================
