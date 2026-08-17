-- ============================================================================
-- AIKIM Mortgage OS — Sprint 2: Document Screening — document_types.ocr_kind
-- production tagging (data migration, follow-up to schema migration)
--
-- Authorizing decision: docs/decisions/0016-document-screening-classification-
-- and-validation.md ("ADR 0016"). This migration performs the human
-- follow-up step that 20260802010000_document_screening_confidence_
-- validation.sql's own section 4 explicitly deferred rather than guessed at:
-- tagging the real, already-existing production document_types rows with
-- the correct ocr_kind, and inserting the one row (EA Form) that has no
-- document_types row at all yet.
--
-- MUST RUN AFTER 20260802010000_document_screening_confidence_validation.sql
-- — every ocr_kind value this file sets (bank_statement, epf_statement,
-- employment_letter, ea_form) is only valid once that migration's widened
-- document_types_ocr_kind_valid CHECK constraint is live. As of this
-- writing, production's live constraint still only allows ('nric',
-- 'salary_slip') — running this file first would make every UPDATE/INSERT
-- below fail with a CHECK constraint violation. This file's timestamp
-- (20260803010000) is chosen to sort after 20260802010000's for exactly
-- this reason; do not run out of order.
--
-- Source of truth for the 6 production document_types rows and their target
-- ocr_kind, and confirmation that no document_types row currently has a
-- non-NULL ocr_kind: a read-only query the user ran directly against
-- production immediately before this migration was authored. The mapping:
--
--   1. "Bank Statement"                        -> bank_statement
--   2. "Employment Confirmation Letter"          -> employment_letter
--   3. "EPF Statement"                           -> epf_statement
--   4. "Latest 3 Months Payslip"                 -> salary_slip
--   5. "NRIC / Identification Copy"               -> nric
--   6. "Sale and Purchase Agreement (SPA)"         -> intentionally NOT
--      touched by this migration, stays NULL. SPA is not one of the 6
--      OCR-eligible kinds ADR 0016 scopes (nric | salary_slip |
--      bank_statement | epf_statement | employment_letter | ea_form) — this
--      is a deliberate exclusion, not an oversight. No statement below
--      selects, updates, or otherwise references this row beyond this note.
--
-- Plus one row that does not exist in production yet and must be inserted:
--
--   7. "EA Form" -> ea_form (category_id left NULL — assigning a real
--      document_categories row is a separate judgment call, out of scope
--      here; category_id is nullable per 20260722010000_mortgage_rules_
--      engine.sql's `add column if not exists category_id uuid references
--      public.document_categories(id)`).
--
-- Scope: exactly 5 UPDATEs (ocr_kind column only, on 5 existing rows) plus
-- 1 INSERT (the single new EA Form row). No other column and no other row
-- on document_types is touched. Does not implement PD-017 (AIKIM Universal
-- Document Intake) — that remains explicit future scope, not this
-- migration.
--
-- Duplicate-safety: document_types.name carries no unique or exclusion
-- constraint in this schema (verified — no migration under
-- supabase/migrations/ adds one; 20260731010000_aikim_standard_baseline_
-- seed.sql's own header independently notes "document_types has no declared
-- unique constraint on name"). A blind `update ... where name = 'X'` could
-- therefore silently mis-tag every matching row if an undetected duplicate
-- name exists — and a naive exact match would also miss a case- or
-- whitespace-variant duplicate (e.g. "ea form", "EA  Form", "EA Form ")
-- entirely, since Postgres `text` equality is case- and whitespace-sensitive
-- (an independent review flagged this specifically for the EA Form insert
-- below, which has no prior confirmed read to rely on the way the 5 existing
-- mappings do). Every block below therefore matches on
-- `lower(trim(name)) = lower(trim('<target name>'))`, not a raw `name = `
-- comparison, and counts matches first before branching:
--   - count = 0 (the 5 existing-row mappings only) -> `raise notice` and
--     skip that row. A missing row is a legitimate, reportable production
--     state (e.g. renamed or deleted since this migration was authored),
--     not a reason to abort tagging the other rows.
--   - count = 1 -> proceed, using the same normalized predicate in the
--     UPDATE's WHERE clause (so the real row is matched and tagged
--     correctly even if its actual casing/whitespace differs slightly from
--     the canonical name used in this file).
--   - count > 1 -> `raise exception` naming the row and the exact count,
--     refusing to guess which one is correct. Duplicates (including
--     case/whitespace variants of each other) must be resolved by a human,
--     out of band, before this migration can safely proceed for that row.
-- For "EA Form" specifically: count = 0 (no normalized match at all,
-- including no case/whitespace variant) -> INSERT the canonical name; count
-- = 1 -> UPDATE that row (idempotent re-run safety, and safety in case a
-- human independently created this row, under any casing, between this file
-- being authored and being run); count > 1 -> `raise exception`, same as
-- above. This guarantees EA Form is never inserted as a duplicate of an
-- existing case/whitespace variant.
--
-- Idempotent: every UPDATE is additionally guarded with `and ocr_kind is
-- distinct from '<target>'` (null-safe), so a second run of this file
-- changes zero rows and reports nothing new once the first run has
-- succeeded. The EA Form step's INSERT is only reached when count = 0 (i.e.
-- never re-runs once the row exists, under any normalized-matching casing);
-- its UPDATE branch carries the same `is distinct from` guard as the other 5.
--
-- Transactional: this entire file is wrapped in an explicit `begin;` /
-- `commit;` (added after independent review flagged that relying on the SQL
-- client's own multi-statement batching behavior for atomicity was
-- unverified). Any unhandled error anywhere between `begin;` and `commit;` —
-- including a `raise exception` inside one of the `do $$ ... $$` blocks
-- below — aborts the whole transaction; issuing `commit;` on an aborted
-- transaction is a no-op (Postgres reports ROLLBACK), so a failure partway
-- through (e.g. an ambiguous duplicate found on one of the 6 rows) cannot
-- leave some rows tagged and others not.
--
-- No function is added or changed here, so no `notify pgrst, 'reload
-- schema';` is needed (same posture as 20260802010000_document_screening_
-- confidence_validation.sql). No RLS policy is added or changed —
-- document_types is an existing, already-RLS-covered reference table; this
-- migration only writes rows into it, it does not alter any policy on it.
--
-- Copy this entire file into the Supabase SQL Editor and run it once, after
-- 20260802010000_document_screening_confidence_validation.sql has been run.
-- NOT executed by this session — pending human review and manual execution.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. "Bank Statement" -> bank_statement
-- ----------------------------------------------------------------------------
do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.document_types where lower(trim(name)) = lower(trim('Bank Statement'));

  if v_count = 0 then
    raise notice 'document_types_ocr_kind_tagging: no row normalized-matching ''Bank Statement'' found — skipped.';
  elsif v_count > 1 then
    raise exception 'document_types_ocr_kind_tagging: % rows normalized-matching ''Bank Statement'' found — refusing to tag ambiguously, resolve duplicates first.', v_count;
  else
    update public.document_types
      set ocr_kind = 'bank_statement'
      where lower(trim(name)) = lower(trim('Bank Statement'))
        and ocr_kind is distinct from 'bank_statement';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 2. "Employment Confirmation Letter" -> employment_letter
-- ----------------------------------------------------------------------------
do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.document_types where lower(trim(name)) = lower(trim('Employment Confirmation Letter'));

  if v_count = 0 then
    raise notice 'document_types_ocr_kind_tagging: no row normalized-matching ''Employment Confirmation Letter'' found — skipped.';
  elsif v_count > 1 then
    raise exception 'document_types_ocr_kind_tagging: % rows normalized-matching ''Employment Confirmation Letter'' found — refusing to tag ambiguously, resolve duplicates first.', v_count;
  else
    update public.document_types
      set ocr_kind = 'employment_letter'
      where lower(trim(name)) = lower(trim('Employment Confirmation Letter'))
        and ocr_kind is distinct from 'employment_letter';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 3. "EPF Statement" -> epf_statement
-- ----------------------------------------------------------------------------
do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.document_types where lower(trim(name)) = lower(trim('EPF Statement'));

  if v_count = 0 then
    raise notice 'document_types_ocr_kind_tagging: no row normalized-matching ''EPF Statement'' found — skipped.';
  elsif v_count > 1 then
    raise exception 'document_types_ocr_kind_tagging: % rows normalized-matching ''EPF Statement'' found — refusing to tag ambiguously, resolve duplicates first.', v_count;
  else
    update public.document_types
      set ocr_kind = 'epf_statement'
      where lower(trim(name)) = lower(trim('EPF Statement'))
        and ocr_kind is distinct from 'epf_statement';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 4. "Latest 3 Months Payslip" -> salary_slip
-- ----------------------------------------------------------------------------
do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.document_types where lower(trim(name)) = lower(trim('Latest 3 Months Payslip'));

  if v_count = 0 then
    raise notice 'document_types_ocr_kind_tagging: no row normalized-matching ''Latest 3 Months Payslip'' found — skipped.';
  elsif v_count > 1 then
    raise exception 'document_types_ocr_kind_tagging: % rows normalized-matching ''Latest 3 Months Payslip'' found — refusing to tag ambiguously, resolve duplicates first.', v_count;
  else
    update public.document_types
      set ocr_kind = 'salary_slip'
      where lower(trim(name)) = lower(trim('Latest 3 Months Payslip'))
        and ocr_kind is distinct from 'salary_slip';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 5. "NRIC / Identification Copy" -> nric
-- ----------------------------------------------------------------------------
do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.document_types where lower(trim(name)) = lower(trim('NRIC / Identification Copy'));

  if v_count = 0 then
    raise notice 'document_types_ocr_kind_tagging: no row normalized-matching ''NRIC / Identification Copy'' found — skipped.';
  elsif v_count > 1 then
    raise exception 'document_types_ocr_kind_tagging: % rows normalized-matching ''NRIC / Identification Copy'' found — refusing to tag ambiguously, resolve duplicates first.', v_count;
  else
    update public.document_types
      set ocr_kind = 'nric'
      where lower(trim(name)) = lower(trim('NRIC / Identification Copy'))
        and ocr_kind is distinct from 'nric';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 6. "Sale and Purchase Agreement (SPA)" — deliberately NOT touched. No
--    statement in this migration references this row. Its ocr_kind must
--    remain NULL — it is not one of ADR 0016's 6 OCR-eligible kinds.
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- 7. "EA Form" -> ea_form. Does not exist in production yet as of this
--    migration being authored — INSERT it. Also handles the case where a
--    human independently created this row between authoring and running
--    this file (UPDATE branch), and re-runs of this file (idempotent no-op
--    once tagged). category_id is left NULL — see file header.
-- ----------------------------------------------------------------------------
do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.document_types where lower(trim(name)) = lower(trim('EA Form'));

  if v_count = 0 then
    insert into public.document_types (name, ocr_kind)
    values ('EA Form', 'ea_form');
  elsif v_count = 1 then
    update public.document_types
      set ocr_kind = 'ea_form'
      where lower(trim(name)) = lower(trim('EA Form'))
        and ocr_kind is distinct from 'ea_form';
  else
    raise exception 'document_types_ocr_kind_tagging: % rows normalized-matching ''EA Form'' found — refusing to tag ambiguously, resolve duplicates first.', v_count;
  end if;
end $$;

commit;

-- ============================================================================
-- Rollback (NOT executed by this migration — documented for a human to run
-- manually if this needs to be reverted). Reverts the 5 existing rows'
-- ocr_kind back to NULL, and deletes the EA Form row entirely, since it did
-- not exist before this migration and (as of this migration) nothing else
-- references it yet:
--
--   update public.document_types set ocr_kind = null
--     where name in (
--       'Bank Statement',
--       'Employment Confirmation Letter',
--       'EPF Statement',
--       'Latest 3 Months Payslip',
--       'NRIC / Identification Copy'
--     );
--
--   delete from public.document_types where name = 'EA Form';
--
-- Before running the DELETE above, a human should confirm no documents,
-- mortgage_rule_documents, or loan_case_required_documents row has come to
-- reference the EA Form document_types row in the meantime — this rollback
-- is only safe immediately after this migration, not arbitrarily later.
-- ============================================================================

-- ============================================================================
-- Verification (NOT executed by this migration — for a human to run
-- manually after applying the migration above, to visually confirm the 5
-- rows are tagged, SPA is still NULL, and EA Form exists with ea_form):
--
--   select name, ocr_kind
--   from public.document_types
--   order by name;
--
-- Expected result (7 rows):
--   Bank Statement                     | bank_statement
--   EA Form                            | ea_form
--   EPF Statement                      | epf_statement
--   Employment Confirmation Letter     | employment_letter
--   Latest 3 Months Payslip            | salary_slip
--   NRIC / Identification Copy         | nric
--   Sale and Purchase Agreement (SPA)  | (NULL)
-- ============================================================================
