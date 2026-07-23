-- ============================================================================
-- AIKIM Mortgage OS — Sprint 6.3B-1: Income Knowledge (RLS policies)
--
-- Scope: every RLS policy for the 5 tables created in
-- 20260726010000_income_knowledge_schema.sql. Kept as a separate migration,
-- deliberately, so a reviewer can approve the *shape* of the data (the
-- schema file) before approving *who can see it* (this file) — those are two
-- different review concerns even though both are needed before either table
-- is usable.
--
-- Postures, per docs/product/mortgage-knowledge-database-prd.md Section 9
-- and this codebase's existing precedent:
--   - banks, bank_products, income_recognition_rules: reference/rule data,
--     read-only for any authenticated user, same Phase-1-before-Phase-2
--     posture document_categories and mortgage_rules shipped with in
--     20260722010000_mortgage_rules_engine.sql. No insert/update/delete
--     policy here — writes are a future admin-surface migration, not this
--     one.
--   - evidence, derivation_results: case-scoped, append-only. Same
--     EXISTS-against-loan_cases visibility pattern as document_extractions
--     (20260724010000_ocr_document_extraction.sql): a select policy
--     re-checking the parent case's visibility, an insert policy for
--     STAFF_ROLES doing the same re-check, and explicitly no update/delete
--     policy at all.
--   - No DELETE policy anywhere in this file, on any of the 5 tables —
--     matches mortgage_rules' "no DELETE RLS policy at all, ever"
--     precedent (docs/architecture/security.md). banks/bank_products/
--     income_recognition_rules are deactivate-only (is_active); evidence/
--     derivation_results are genuinely append-only fact logs with no
--     "delete" concept at all (DB PRD Section 7).
--   - No policy in this file references service_role.
--
-- Run this after 20260726010000_income_knowledge_schema.sql, in the same
-- session. Copy this entire file into the Supabase SQL Editor. Idempotent
-- (every CREATE POLICY is preceded by a DROP POLICY IF EXISTS): safe to
-- re-run. Does not touch any existing row data. NOT executed by this
-- session — pending human review and manual execution.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. banks — read-only reference data for any authenticated user.
-- ----------------------------------------------------------------------------
drop policy if exists "banks_select_authenticated" on public.banks;
create policy "banks_select_authenticated" on public.banks
for select
using (auth.uid() is not null);
-- No insert/update/delete policy: reference data, human-managed via SQL
-- Editor for Phase 1, same posture as mortgage_rules/document_categories.

-- ----------------------------------------------------------------------------
-- 2. bank_products — read-only reference data for any authenticated user.
-- ----------------------------------------------------------------------------
drop policy if exists "bank_products_select_authenticated" on public.bank_products;
create policy "bank_products_select_authenticated" on public.bank_products
for select
using (auth.uid() is not null);
-- No insert/update/delete policy: same Phase 1 posture as banks.

-- ----------------------------------------------------------------------------
-- 3. income_recognition_rules — read-only reference/rule data for any
--    authenticated user. Same Phase-1-before-Phase-2 pattern mortgage_rules
--    itself followed (Phase 2 admin writes, if ever built, are a future,
--    separately-approved migration — see 20260723010000_mortgage_rule_admin.sql
--    for the shape that Phase 2 would follow).
-- ----------------------------------------------------------------------------
drop policy if exists "income_recognition_rules_select_authenticated" on public.income_recognition_rules;
create policy "income_recognition_rules_select_authenticated" on public.income_recognition_rules
for select
using (auth.uid() is not null);
-- No insert/update/delete policy: same Phase 1 posture as banks/bank_products.

-- ----------------------------------------------------------------------------
-- 4. evidence — case-scoped, append-only.
--
-- Select: re-checks the parent case's own visibility via EXISTS, so access
-- can never be broader than access to the case itself (same pattern as
-- document_extractions, loan_case_required_documents, and every other
-- case-scoped table since Sprint 6.1).
-- Insert: STAFF_ROLES only, same re-check.
-- No update/delete policy: append-only — a correction is a new row
-- (evidence.superseded_by_evidence_id), never an edit to a past one.
-- ----------------------------------------------------------------------------
drop policy if exists "evidence_select" on public.evidence;
create policy "evidence_select" on public.evidence
for select
using (
  exists (
    select 1 from public.loan_cases lc
    where lc.id = evidence.loan_case_id
  )
);

drop policy if exists "evidence_insert_staff" on public.evidence;
create policy "evidence_insert_staff" on public.evidence
for insert
with check (
  exists (
    select 1 from public.loan_cases lc
    where lc.id = evidence.loan_case_id
  )
  and exists (
    select 1 from public.user_profiles up
    where up.auth_user_id = auth.uid()
      and up.role in ('super_admin', 'banker', 'property_agent', 'mortgage_outsource_agent')
  )
);

-- ----------------------------------------------------------------------------
-- 5. derivation_results — case-scoped, append-only. Same shape as evidence
--    above, for the same reasoning: every derivation computation is its own
--    audit record, there is nothing to separately log or ever edit.
-- ----------------------------------------------------------------------------
drop policy if exists "derivation_results_select" on public.derivation_results;
create policy "derivation_results_select" on public.derivation_results
for select
using (
  exists (
    select 1 from public.loan_cases lc
    where lc.id = derivation_results.loan_case_id
  )
);

drop policy if exists "derivation_results_insert_staff" on public.derivation_results;
create policy "derivation_results_insert_staff" on public.derivation_results
for insert
with check (
  exists (
    select 1 from public.loan_cases lc
    where lc.id = derivation_results.loan_case_id
  )
  and exists (
    select 1 from public.user_profiles up
    where up.auth_user_id = auth.uid()
      and up.role in ('super_admin', 'banker', 'property_agent', 'mortgage_outsource_agent')
  )
);

-- ============================================================================
-- End of Sprint 6.3B-1 Income Knowledge RLS migration.
-- ============================================================================
