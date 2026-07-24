-- ============================================================================
-- AIKIM Mortgage OS — Sprint 6.3C: Eligibility Engine (RPC)
--
-- Scope: create_eligibility_verdict — the atomic multi-table write this
-- sprint exists to provide. Every prior Knowledge domain (Sprint 6.3B-1
-- through 6.3B-4, see docs/decisions/0010 through 0013) explicitly did NOT
-- need an RPC: each was a single-table insert (evidence, derivation_results,
-- or a rule row), so a Server Action's plain `.insert()` call, gated by RLS,
-- was already atomic by definition.
--
-- This domain is different: creating one eligibility verdict means writing
-- to TWO tables — one eligibility_verdicts row, plus one
-- eligibility_verdict_derivation_results row per contributing
-- derivation_results id. If the eligibility_verdicts insert succeeded but a
-- later eligibility_verdict_derivation_results insert then failed (e.g. one
-- of the given derivation_result_ids doesn't exist, tripping the foreign key
-- constraint), a naive two-step client-side sequence would leave an
-- orphaned verdict with a broken/incomplete reasoning chain — defeating the
-- entire purpose of this table (DB PRD Section 6, Explainable AI
-- Architecture: a verdict must be reconstructable back to every derivation
-- result that produced it). That is a genuine atomicity requirement, not a
-- stylistic choice, exactly the class of problem
-- docs/decisions/0004-atomic-multitable-writes-via-security-invoker-rpc.md
-- names and create_loan_case (20260716020000_create_loan_case_rpc.sql)
-- already solves for customer+loan_case. This function follows that exact
-- pattern and security posture.
--
-- Security posture, matching create_loan_case exactly:
--   - SECURITY INVOKER (NOT DEFINER) — runs as the calling user. RLS on
--     both eligibility_verdicts and eligibility_verdict_derivation_results
--     (20260730020000_eligibility_engine_rls.sql) is what actually
--     authorizes every insert this function performs. This function does
--     not bypass or weaken RLS, and never uses service_role — per
--     docs/decisions/0002-rls-as-sole-authorization-boundary.md, RLS is the
--     sole authorization boundary, and this RPC is not an exception to that.
--   - auth.uid() is checked (raises if null) and resolved to
--     user_profiles.id INSIDE this function, exactly like create_loan_case's
--     `created_by` resolution — requested_by_user_id is NEVER accepted as a
--     parameter. A client could otherwise pass an arbitrary user id and
--     forge whose name a verdict was "requested by"; resolving it from
--     auth.uid() server-side closes that off entirely.
--   - revoke all ... from public; grant execute ... to authenticated; —
--     identical grant pattern to create_loan_case.
--
-- ----------------------------------------------------------------------------
-- SECURITY FIX (post-review, same sprint): p_derivation_result_ids scope
-- validation.
--
-- Because this function is `grant execute to authenticated`, ANY
-- authenticated staff-role caller can invoke it directly via
-- `supabase.rpc("create_eligibility_verdict", {...})` — not only through the
-- intended TypeScript caller (src/lib/eligibility-engine/actions.ts). The
-- bare foreign key on eligibility_verdict_derivation_results.
-- derivation_result_id (added in 20260730010000_eligibility_engine_schema.sql)
-- only proves a given id exists *somewhere* in derivation_results — it does
-- NOT prove that row belongs to the p_loan_case_id/p_bank_product_id being
-- evaluated. Worse, Postgres foreign key constraint checks are internal
-- system checks and are NOT subject to RLS on the referenced table, so the
-- FK alone doesn't even limit a caller to derivation_results rows they could
-- actually see. Without an additional check, a caller could link a
-- derivation_results row from a completely unrelated case into this
-- verdict's reasoning chain — undermining the entire "explainable,
-- audit-traceable reasoning chain" purpose eligibility_verdict_derivation_
-- results exists for, and leaving actions.ts's TypeScript-side checks as
-- the only real guard, which ADR 0002 (RLS is the sole authorization
-- boundary) treats as insufficient on its own.
--
-- The fix, added to the loop body below: before inserting each join row,
-- this function now does a plain
--   select id into v_checked_id from public.derivation_results
--   where id = v_derivation_result_id
--     and loan_case_id = p_loan_case_id
--     and bank_product_id = p_bank_product_id;
-- — same validate-by-selecting-it-back style create_loan_case already uses
-- for p_customer_id in existing-customer mode. Unlike the FK check, this
-- SELECT runs under SECURITY INVOKER and is genuinely subject to
-- derivation_results' own RLS (derivation_results_select), so it verifies
-- BOTH that the row belongs to the case/product being evaluated AND that
-- the calling user could actually see it. If any id fails to resolve, the
-- function raises immediately — no join row is inserted for it, and (per
-- the atomicity guarantee below) the whole transaction, including the
-- eligibility_verdicts row, rolls back.
--
-- What this fix deliberately does NOT do: it does not recompute the
-- eligibility verdict, and it does not re-implement any domain-matching or
-- derivation business logic in SQL — that would reverse this Knowledge
-- Base's established architecture (matching/derivation logic lives in
-- TypeScript, not SQL — ADR 0006 and every subsequent domain ADR). This is
-- a referential/scope integrity check only: "does this derivation result
-- actually belong to this case and product," never "is this derivation
-- result's content correct."
--
-- Remaining, deliberately accepted trust boundary: p_verdict and p_reasons
-- are still trusted as given by the (now scope-verified) caller. This RPC
-- authorizes THAT an eligibility verdict can be written for this case and
-- product by this authenticated staff user, referencing only derivation
-- results that genuinely belong to that case/product — it does not
-- authorize, and cannot verify, that the verdict/reasons content is
-- substantively correct (e.g. that "eligible" actually follows from the
-- linked derivation results). That substantive correctness still depends on
-- src/lib/eligibility-engine/actions.ts being the only real caller that
-- computes p_verdict/p_reasons in the first place — this is stated here
-- explicitly as an acknowledged boundary, not left implicit.
-- ----------------------------------------------------------------------------
--
-- SECOND SECURITY FIX (Sprint 6.3C closing review): the scope-validation
-- SELECT above originally checked only loan_case_id/bank_product_id, not
-- domain. actions.ts is careful to only ever pass dsr/property_rules
-- derivation_results ids — but a caller invoking this RPC directly could
-- have passed an income_recognition or commitment_recognition result id
-- from the SAME case/product, which would have passed the case/product
-- check and been spliced into eligibility_verdict_derivation_results as if
-- it had contributed to the verdict, undermining the reasoning chain's
-- accuracy even without crossing any case/product boundary. Fixed by adding
-- `and domain in ('dsr', 'property_rules')` to the same SELECT.
-- ----------------------------------------------------------------------------
--
-- Division of labor, matching create_loan_case's own precedent: the
-- TypeScript caller (src/lib/eligibility-engine/actions.ts) is responsible
-- for computing p_verdict/p_reasons and for selecting which
-- derivation_results ids are relevant in the first place — this RPC does
-- not re-derive or re-compute eligibility business logic. What it now does
-- verify, per the fix above, is that every id the caller passed genuinely
-- belongs to the case/product being evaluated and is visible to the caller
-- under RLS — a referential/scope guarantee, not a business-logic one.
--
-- Atomicity guarantee (the other point of this migration): the entire
-- function body — the eligibility_verdicts insert, the per-id scope
-- validation, and the eligibility_verdict_derivation_results inserts — runs
-- inside one implicit transaction, because a single RPC call is one
-- transaction in PL/pgSQL. If ANY statement inside raises (an RLS denial,
-- the verdict CHECK constraint, a derivation_result_id that fails the new
-- scope-validation check or the underlying foreign key constraint, or
-- anything else), Postgres rolls back every statement already executed in
-- this call, including the eligibility_verdicts row inserted moments
-- earlier. This mirrors create_loan_case's own comment about this exact
-- PL/pgSQL rollback behavior for its customer+loan_case insert pair, and
-- continues to hold unchanged with the new validation step added.
--
-- Run this after 20260730010000_eligibility_engine_schema.sql AND
-- 20260730020000_eligibility_engine_rls.sql, in that order — this function's
-- inserts would be denied by RLS (and the function would fail, harmlessly,
-- via rollback) if the RLS migration hasn't run yet. Copy this entire file
-- into the Supabase SQL Editor. Idempotent (create or replace function):
-- safe to re-run. Does not touch any existing row data. NOT executed by this
-- session — pending human review and manual execution.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- public.create_eligibility_verdict
--
-- Inserts one eligibility_verdicts row, then one
-- eligibility_verdict_derivation_results row per id in
-- p_derivation_result_ids (after verifying each id's case/product scope),
-- atomically. Returns the single created eligibility_verdicts row (not
-- SETOF) — same PostgREST-friendly shape as create_loan_case's own return
-- value, so a TypeScript caller can do
--   const { data } = await supabase.rpc("create_eligibility_verdict", {...});
-- and expect `data` to be one plain eligibility_verdicts object.
-- ----------------------------------------------------------------------------
create or replace function public.create_eligibility_verdict(
  p_loan_case_id uuid,
  p_bank_product_id uuid,
  p_verdict text,
  p_reasons jsonb,
  p_derivation_result_ids uuid[]
)
returns public.eligibility_verdicts
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_actor_profile_id uuid;
  v_verdict public.eligibility_verdicts;
  v_derivation_result_id uuid;
  v_checked_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select id into v_actor_profile_id from public.user_profiles where auth_user_id = auth.uid();

  insert into public.eligibility_verdicts (
    loan_case_id, bank_product_id, verdict, reasons, requested_by_user_id
  ) values (
    p_loan_case_id, p_bank_product_id, p_verdict, p_reasons, v_actor_profile_id
  )
  returning * into v_verdict;

  -- One eligibility_verdict_derivation_results row per contributing
  -- derivation_results id. p_derivation_result_ids is a plain array
  -- parameter; the TypeScript caller is responsible for choosing which ids
  -- are relevant to this verdict (see the division-of-labor note in this
  -- file's header) — but because this function is directly callable by any
  -- authenticated staff-role user via supabase.rpc(...), it does not simply
  -- trust that the given ids belong to this case/product. Each id is
  -- validated by selecting it back through derivation_results' own RLS,
  -- scoped to p_loan_case_id/p_bank_product_id, exactly the same
  -- validate-by-selecting-it-back style create_loan_case already uses for
  -- p_customer_id. This is a referential/scope check only — it does not
  -- inspect or re-derive the row's result_value. See the "SECURITY FIX"
  -- note in this file's header for the full reasoning.
  foreach v_derivation_result_id in array coalesce(p_derivation_result_ids, array[]::uuid[])
  loop
    select id into v_checked_id
    from public.derivation_results
    where id = v_derivation_result_id
      and loan_case_id = p_loan_case_id
      and bank_product_id = p_bank_product_id
      and domain in ('dsr', 'property_rules');

    if v_checked_id is null then
      raise exception 'derivation_result_id % does not belong to loan_case_id % / bank_product_id %, is not a dsr/property_rules domain result, or is not visible to the caller', v_derivation_result_id, p_loan_case_id, p_bank_product_id;
    end if;

    insert into public.eligibility_verdict_derivation_results (
      eligibility_verdict_id, derivation_result_id
    ) values (
      v_verdict.id, v_derivation_result_id
    );
  end loop;

  return v_verdict;
end;
$$;

revoke all on function public.create_eligibility_verdict(
  uuid, uuid, text, jsonb, uuid[]
) from public;
grant execute on function public.create_eligibility_verdict(
  uuid, uuid, text, jsonb, uuid[]
) to authenticated;

-- ----------------------------------------------------------------------------
-- Force PostgREST to reload its schema cache immediately, so the new RPC is
-- callable via supabase.rpc(...) without waiting for the next automatic
-- reload.
-- ----------------------------------------------------------------------------
notify pgrst, 'reload schema';

-- ============================================================================
-- End of Sprint 6.3C Eligibility Engine RPC migration.
-- ============================================================================
