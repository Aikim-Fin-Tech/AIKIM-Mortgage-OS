-- ============================================================================
-- AIKIM Mortgage OS — Sprint 6.3C: Eligibility Engine (RLS policies)
--
-- Scope: every RLS policy for the 2 tables created in
-- 20260730010000_eligibility_engine_schema.sql. Kept as a separate
-- migration, deliberately, so a reviewer can approve the *shape* of the data
-- (the schema file) before approving *who can see it* (this file) — same
-- reasoning as every prior domain's schema/RLS split (e.g.
-- 20260726020000_income_knowledge_rls.sql).
--
-- Posture, per docs/product/mortgage-knowledge-database-prd.md and this
-- codebase's existing precedent:
--   - eligibility_verdicts: case-scoped, append-only. Same EXISTS-against-
--     loan_cases visibility pattern as evidence/derivation_results
--     (20260726020000_income_knowledge_rls.sql): a select policy re-checking
--     the parent case's own visibility, an insert policy additionally
--     checking STAFF_ROLES, and explicitly no update/delete policy at all.
--   - eligibility_verdict_derivation_results: case-scoped via its PARENT
--     eligibility_verdict_id's own case — an EXISTS through
--     eligibility_verdicts -> loan_cases, not a duplicated direct
--     loan_case_id check (this table has no loan_case_id column at all).
--     Same select/insert/no-update/no-delete shape as eligibility_verdicts.
--   - No DELETE policy anywhere in this file, on either table — matches
--     evidence/derivation_results' "no DELETE RLS policy at all, ever"
--     precedent. Both tables are genuinely append-only fact logs with no
--     "delete" concept, per the DB PRD's Section 6 "Frozen Decision
--     Principle" note.
--   - No policy in this file references service_role.
--
-- Why eligibility_verdict_derivation_results still gets its own INSERT
-- policy, even though only the create_eligibility_verdict RPC
-- (20260730030000_eligibility_engine_rpc.sql) ever writes to it:
--
-- The RPC is authored SECURITY INVOKER (see that migration), matching this
-- codebase's ADR 0004 pattern (create_loan_case) — it runs as the calling
-- user, not as a privileged bypass, so every statement inside it is still
-- subject to RLS exactly as if the caller had issued it directly. Without an
-- INSERT policy on eligibility_verdict_derivation_results, the RPC's insert
-- into that table would be denied by RLS and the whole function (and its
-- eligibility_verdicts insert) would roll back — the RPC doesn't relax or
-- bypass RLS, it only makes two normally-separate inserts atomic. RLS on
-- both tables therefore has to be correct and complete on its own terms —
-- "this table happens to only ever be reached via the RPC" is not a
-- substitute for an actual policy, since PostgREST could still be asked to
-- .insert() into it directly by any authenticated caller, and RLS (not
-- "nothing calls this path today") is this codebase's sole authorization
-- boundary (docs/decisions/0002-rls-as-sole-authorization-boundary.md).
--
-- Run this after 20260730010000_eligibility_engine_schema.sql, in the same
-- session, and before 20260730030000_eligibility_engine_rpc.sql (the RPC's
-- correctness depends on these policies existing). Copy this entire file
-- into the Supabase SQL Editor. Idempotent (every CREATE POLICY is preceded
-- by a DROP POLICY IF EXISTS): safe to re-run. Does not touch any existing
-- row data. NOT executed by this session — pending human review and manual
-- execution.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. eligibility_verdicts — case-scoped, append-only.
--
-- Select: re-checks the parent case's own visibility via EXISTS, same
-- pattern as evidence_select/derivation_results_select.
-- Insert: STAFF_ROLES only, same re-check.
-- No update/delete policy: append-only — a re-evaluation is always a new
-- row, never an edit to a past one.
-- ----------------------------------------------------------------------------
drop policy if exists "eligibility_verdicts_select" on public.eligibility_verdicts;
create policy "eligibility_verdicts_select" on public.eligibility_verdicts
for select
using (
  exists (
    select 1 from public.loan_cases lc
    where lc.id = eligibility_verdicts.loan_case_id
  )
);

drop policy if exists "eligibility_verdicts_insert_staff" on public.eligibility_verdicts;
create policy "eligibility_verdicts_insert_staff" on public.eligibility_verdicts
for insert
with check (
  exists (
    select 1 from public.loan_cases lc
    where lc.id = eligibility_verdicts.loan_case_id
  )
  and exists (
    select 1 from public.user_profiles up
    where up.auth_user_id = auth.uid()
      and up.role in ('super_admin', 'banker', 'property_agent', 'mortgage_outsource_agent')
  )
);

-- ----------------------------------------------------------------------------
-- 2. eligibility_verdict_derivation_results — case-scoped via its parent
--    eligibility_verdict_id's own case, not a duplicated direct case check
--    (this table has no loan_case_id column of its own).
--
-- Select: EXISTS through eligibility_verdicts -> loan_cases.
-- Insert: same EXISTS, additionally checking STAFF_ROLES — this is the
-- policy that lets create_eligibility_verdict's second insert (the loop over
-- p_derivation_result_ids) succeed at all; see the file header above for why
-- it exists despite only the RPC ever calling it.
-- No update/delete policy: append-only, same reasoning as eligibility_verdicts.
-- ----------------------------------------------------------------------------
drop policy if exists "eligibility_verdict_derivation_results_select" on public.eligibility_verdict_derivation_results;
create policy "eligibility_verdict_derivation_results_select" on public.eligibility_verdict_derivation_results
for select
using (
  exists (
    select 1 from public.eligibility_verdicts ev
    join public.loan_cases lc on lc.id = ev.loan_case_id
    where ev.id = eligibility_verdict_derivation_results.eligibility_verdict_id
  )
);

drop policy if exists "eligibility_verdict_derivation_results_insert_staff" on public.eligibility_verdict_derivation_results;
create policy "eligibility_verdict_derivation_results_insert_staff" on public.eligibility_verdict_derivation_results
for insert
with check (
  exists (
    select 1 from public.eligibility_verdicts ev
    join public.loan_cases lc on lc.id = ev.loan_case_id
    where ev.id = eligibility_verdict_derivation_results.eligibility_verdict_id
  )
  and exists (
    select 1 from public.user_profiles up
    where up.auth_user_id = auth.uid()
      and up.role in ('super_admin', 'banker', 'property_agent', 'mortgage_outsource_agent')
  )
);

-- ============================================================================
-- End of Sprint 6.3C Eligibility Engine RLS migration.
-- The RPC that writes to both tables above (create_eligibility_verdict) is
-- authored in the companion migration
-- 20260730030000_eligibility_engine_rpc.sql — run that last, after this
-- file, since its correctness depends on the policies above already existing.
-- ============================================================================
