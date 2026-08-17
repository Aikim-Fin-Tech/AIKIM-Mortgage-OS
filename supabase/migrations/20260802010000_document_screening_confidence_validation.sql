-- ============================================================================
-- AIKIM Mortgage OS — Sprint 2: Document Screening API v1.0 (schema)
--
-- Authorizing decision: docs/decisions/0016-document-screening-classification-
-- and-validation.md ("ADR 0016"), Decision 4. This migration implements
-- exactly that section — nothing more. It does not touch any Mortgage
-- Knowledge Engine table (income_recognition_rules, commitment_recognition_
-- rules, dsr_rules, property_rules, evidence, derivation_results,
-- eligibility_verdicts, commitments, etc.) — explicitly out of scope for this
-- sprint per the ADR's Context section ("keeps AI extraction decoupled from
-- mortgage policy"). It does not touch src/ — this is the schema half only;
-- backend-engineer is building src/lib/ocr/*, src/lib/document-screening/*
-- from the same ADR in parallel.
--
-- Scope, in order below:
--   1. Widen document_types.ocr_kind's live CHECK constraint
--      (document_types_ocr_kind_valid) from 2 kinds to 6.
--   2. Widen document_extractions.kind's live CHECK constraint
--      (document_extractions_kind_check) from 2 kinds to 6.
--   3. Add 5 nullable columns to document_extractions (confidence,
--      validation_status, validation_issues, classification_predicted_kind,
--      classification_confidence) plus their own CHECK constraints.
--   4. Document (not execute) the required human follow-up: document_types
--      rows for the 4 new kinds do not exist yet and this migration
--      deliberately does not insert them — see section 4 below for why.
--
-- Both constraints widened in steps 1-2 are LIVE — already executed against
-- production as part of 20260724010000_ocr_document_extraction.sql (the
-- CHANGELOG's migration #7 of the original 8 already-run files). That file is
-- never edited in place; per this repo's migration policy every change here
-- is a new file that drops and recreates what it needs to widen.
--
-- Constraint names used below were read directly out of
-- 20260724010000_ocr_document_extraction.sql, not assumed:
--   - `document_types_ocr_kind_valid` — explicitly named in that file (its
--     own `do $$ ... if not exists (select 1 from pg_constraint where
--     conname = 'document_types_ocr_kind_valid') ...` guard), currently
--     `check (ocr_kind is null or ocr_kind in ('nric', 'salary_slip'))`.
--   - `document_extractions_kind_check` — that file declares this as an
--     inline, unnamed column constraint (`kind text not null check (kind in
--     ('nric', 'salary_slip'))` inside the `create table` statement), so its
--     live name is whatever Postgres's default naming convention assigned on
--     table creation — not guaranteed. An earlier version of this migration
--     assumed the name `document_extractions_kind_check` and claimed a wrong
--     guess would "fail with a duplicate-check error" — that claim was
--     incorrect: if the real name differs, `drop constraint if exists
--     document_extractions_kind_check` is a harmless no-op, but the
--     following `add constraint document_extractions_kind_check ...` would
--     NOT fail (no name collision) — it would silently create a *second*
--     CHECK constraint alongside the still-active original 2-value one,
--     which would keep rejecting the 4 new kinds with no error at migration
--     time. Section 2 below no longer assumes a name at all — it discovers
--     the real constraint by column (via `pg_attribute`/`pg_constraint`,
--     matched on `conkey`), and hard-fails with `raise exception` if zero or
--     more than one single-column CHECK constraint is found on `kind`,
--     rather than guessing. Section 1 (`document_types.ocr_kind`) applies
--     the same discovery for consistency and defense-in-depth, even though
--     its constraint was given an explicit name in the original migration
--     (lower risk, but this codebase has confirmed prior incidents of
--     production schema drifting from migration assumptions — see
--     docs/architecture/database.md's "Schema reconciliations" section).
--
-- Purely additive/widening: no existing column is dropped, renamed, or
-- retyped; no existing row on document_types or document_extractions is
-- touched. Widening a CHECK constraint (allowing more values than before)
-- can only make previously-valid rows remain valid — it can never invalidate
-- an existing row.
--
-- No function is added or changed here, so no `notify pgrst, 'reload
-- schema';` is needed (same posture as
-- 20260730040000_knowledge_rule_index_correction.sql). No RLS policy is
-- added or changed either — new nullable columns on an already-RLS-covered
-- table need no new policy, and this repo has no column-level RLS anywhere
-- to invent one for (same posture as 20260801030000_commitments_schema.sql's
-- header note on this point).
--
-- Idempotent: sections 1 and 2 (the two widened CHECK constraints) discover
-- the constraint to drop dynamically by column, not by an assumed name — see
-- each section's own comment for why — and hard-fail via `raise exception`
-- if that discovery is ambiguous, rather than guessing; every column in
-- section 3 is `add column if not exists`; every new column's CHECK
-- constraint is added inside a `do $$ ... if not exists (select 1 from
-- pg_constraint where conname = ...) ...` guard, the exact idiom
-- 20260724010000_ocr_document_extraction.sql itself used for
-- `document_types_ocr_kind_valid`. Re-running this whole file after a
-- successful run changes nothing (every statement's guard evaluates to a
-- no-op the second time).
--
-- Transactional: this entire file is wrapped in an explicit `begin;` /
-- `commit;` (added after independent review flagged that relying on the SQL
-- client's own multi-statement batching behavior for atomicity was
-- unverified). Any unhandled error anywhere between `begin;` and `commit;` —
-- including a `raise exception` inside one of the `do $$ ... $$` blocks
-- below — aborts the whole transaction; issuing `commit;` on an aborted
-- transaction is a no-op (Postgres reports ROLLBACK), so a failure partway
-- through cannot leave this migration half-applied.
--
-- Copy this entire file into the Supabase SQL Editor and run it once, after
-- 20260801030000_commitments_schema.sql. NOT executed by this session —
-- pending human review and manual execution. Verify the constraint name note
-- above before running if there is any doubt about live schema drift.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. document_types.ocr_kind — widen document_types_ocr_kind_valid from
--    ('nric', 'salary_slip') to all 6 kinds. Matches src/lib/ocr/types.ts's
--    widened OCRDocumentKind union (per ADR 0016 Decision 3's module layout)
--    exactly — the TypeScript union remains the source of truth for what's
--    valid; this CHECK still only guards against typos at the data layer.
--
--    Discovers the live constraint by column rather than trusting the
--    hardcoded name `document_types_ocr_kind_valid` (that name IS the one
--    explicitly assigned in the original migration, so risk here is lower
--    than section 2 below — but the same mechanism is used for consistency
--    and defense-in-depth). Matches on `conkey` (the exact set of column
--    attnums a CHECK constraint's expression references) rather than a
--    multi-column or expression-based match, so a compound CHECK involving
--    `ocr_kind` plus another column would not be picked up here — that is
--    deliberate: this migration only knows how to safely replace a
--    single-column CHECK on `ocr_kind`, not reason about a compound one, and
--    hard-fails rather than guessing if the discovered state doesn't match
--    that shape.
-- ----------------------------------------------------------------------------
do $$
declare
  v_attnum smallint;
  v_conname text;
  v_count int;
begin
  select attnum into v_attnum
  from pg_attribute
  where attrelid = 'public.document_types'::regclass
    and attname = 'ocr_kind'
    and not attisdropped;

  if v_attnum is null then
    raise exception 'document_screening_confidence_validation: column public.document_types.ocr_kind not found — refusing to proceed.';
  end if;

  select count(*) into v_count
  from pg_constraint
  where conrelid = 'public.document_types'::regclass
    and contype = 'c'
    and conkey = array[v_attnum];

  if v_count = 0 then
    raise exception 'document_screening_confidence_validation: no single-column CHECK constraint found on public.document_types.ocr_kind — refusing to guess. Inspect pg_constraint manually before proceeding.';
  elsif v_count > 1 then
    raise exception 'document_screening_confidence_validation: % single-column CHECK constraints found on public.document_types.ocr_kind — ambiguous, refusing to guess which to drop.', v_count;
  end if;

  select conname into v_conname
  from pg_constraint
  where conrelid = 'public.document_types'::regclass
    and contype = 'c'
    and conkey = array[v_attnum];

  execute format('alter table public.document_types drop constraint %I', v_conname);
end $$;

alter table public.document_types
  add constraint document_types_ocr_kind_valid
  check (
    ocr_kind is null or ocr_kind in (
      'nric', 'salary_slip', 'bank_statement', 'epf_statement',
      'employment_letter', 'ea_form'
    )
  );

comment on column public.document_types.ocr_kind is
  'NULL = not OCR-eligible. Otherwise must match src/lib/ocr/types.ts OCRDocumentKind (nric | salary_slip | bank_statement | epf_statement | employment_letter | ea_form). Widened from 2 to 6 kinds by 20260802010000_document_screening_confidence_validation.sql per ADR 0016.';

-- ----------------------------------------------------------------------------
-- 2. document_extractions.kind — widen its CHECK constraint from 2 to 6
--    kinds, same value list as above. The original migration
--    (20260724010000_ocr_document_extraction.sql) declared this as an
--    inline, unnamed column constraint (`kind text not null check (kind in
--    (...))`), so its live name is only an inferred default, not confirmed —
--    see the header note above. Rather than assume the name
--    `document_extractions_kind_check` and risk silently leaving the real,
--    differently-named constraint active alongside a new one (two ANDed
--    CHECK constraints would still enforce the old 2-value rule even after
--    this migration reports success), this discovers the actual constraint
--    by column: find the single-column CHECK constraint on `kind` via
--    `pg_attribute`/`pg_constraint.conkey`, hard-failing if none or more
--    than one is found, then drop it by its real name before adding the new,
--    explicitly-named 6-value constraint.
-- ----------------------------------------------------------------------------
do $$
declare
  v_attnum smallint;
  v_conname text;
  v_count int;
begin
  select attnum into v_attnum
  from pg_attribute
  where attrelid = 'public.document_extractions'::regclass
    and attname = 'kind'
    and not attisdropped;

  if v_attnum is null then
    raise exception 'document_screening_confidence_validation: column public.document_extractions.kind not found — refusing to proceed.';
  end if;

  select count(*) into v_count
  from pg_constraint
  where conrelid = 'public.document_extractions'::regclass
    and contype = 'c'
    and conkey = array[v_attnum];

  if v_count = 0 then
    raise exception 'document_screening_confidence_validation: no single-column CHECK constraint found on public.document_extractions.kind — refusing to guess. Inspect pg_constraint manually before proceeding.';
  elsif v_count > 1 then
    raise exception 'document_screening_confidence_validation: % single-column CHECK constraints found on public.document_extractions.kind — ambiguous, refusing to guess which to drop.', v_count;
  end if;

  select conname into v_conname
  from pg_constraint
  where conrelid = 'public.document_extractions'::regclass
    and contype = 'c'
    and conkey = array[v_attnum];

  execute format('alter table public.document_extractions drop constraint %I', v_conname);
end $$;

alter table public.document_extractions
  add constraint document_extractions_kind_check
  check (
    kind in (
      'nric', 'salary_slip', 'bank_statement', 'epf_statement',
      'employment_letter', 'ea_form'
    )
  );

-- ----------------------------------------------------------------------------
-- 3. document_extractions — 5 new nullable columns carrying the confidence
--    and validation signals ADR 0016 Decision 2/3 introduces. All additive,
--    no existing row touched. Written exclusively by the new screenDocument
--    Server Action (src/lib/document-screening/screen-document.ts, not part
--    of this migration) — extractDocumentData's existing insert path leaves
--    all 5 of these NULL, which is how a future reader distinguishes which
--    flow produced a given row without a separate discriminator column, per
--    ADR 0016's own documented consequence.
-- ----------------------------------------------------------------------------
alter table public.document_extractions
  add column if not exists confidence numeric,
  add column if not exists validation_status text,
  add column if not exists validation_issues jsonb,
  add column if not exists classification_predicted_kind text,
  add column if not exists classification_confidence numeric;

comment on column public.document_extractions.confidence is
  'Extraction self-reported confidence (0-1), from OCRExtractionResult.confidence per ADR 0016 Decision 2. NULL for rows written by extractDocumentData (the existing "Extract Data" button flow), which does not compute or persist this.';
comment on column public.document_extractions.validation_status is
  'PASS | REVIEW | FAIL, computed deterministically by computeValidation() (src/lib/document-screening/compute-validation.ts) — never AI-decided, per ADR 0016 Decision 2. NULL for rows not written by screenDocument.';
comment on column public.document_extractions.validation_issues is
  'jsonb array of ValidationIssue objects ({code, field, message}, see ADR 0016 Decision 3). No default — stays NULL, not ''[]''::jsonb, when no screening attempt has computed validation for this row (deliberate per ADR 0016 Decision 4, not an oversight).';
comment on column public.document_extractions.classification_predicted_kind is
  'The kind classify() (an independent, unprimed Gemini call, per ADR 0016 Decision 1) guessed for this file, or ''unrecognized''. NULL if classify() was not run or itself failed for this attempt — a classify() failure never blocks or fails the rest of the screening attempt. Compare against kind (the human-assigned type) at read time to detect a mismatch; not stored as a separate boolean, per ADR 0016 Decision 4''s "compute live, don''t store a derived fact" convention.';
comment on column public.document_extractions.classification_confidence is
  'classify()''s self-reported confidence (0-1) for classification_predicted_kind. NULL under the same conditions as classification_predicted_kind.';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'document_extractions_confidence_range_check'
  ) then
    alter table public.document_extractions
      add constraint document_extractions_confidence_range_check
      check (confidence is null or (confidence >= 0 and confidence <= 1));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'document_extractions_validation_status_valid'
  ) then
    alter table public.document_extractions
      add constraint document_extractions_validation_status_valid
      check (validation_status is null or validation_status in ('PASS', 'REVIEW', 'FAIL'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'document_extractions_classification_predicted_kind_valid'
  ) then
    alter table public.document_extractions
      add constraint document_extractions_classification_predicted_kind_valid
      check (
        classification_predicted_kind is null or classification_predicted_kind in (
          'nric', 'salary_slip', 'bank_statement', 'epf_statement',
          'employment_letter', 'ea_form', 'unrecognized'
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'document_extractions_classification_confidence_range_check'
  ) then
    alter table public.document_extractions
      add constraint document_extractions_classification_confidence_range_check
      check (classification_confidence is null or (classification_confidence >= 0 and classification_confidence <= 1));
  end if;
end $$;

commit;

-- ----------------------------------------------------------------------------
-- 4. document_types rows for the 4 new kinds — deliberately NOT inserted by
--    this migration. Required human follow-up, documented here rather than
--    executed.
--
--    Verified before writing this migration: no migration in this repo's
--    history has ever inserted a row into document_types (grepped for
--    `insert into public.document_types` / `document_types (name` across
--    every file under supabase/migrations/ — zero matches). document_types
--    itself is not even created by any migration here — like `banks` and
--    `documents`, its base rows are managed entirely out-of-band via the
--    Supabase SQL Editor, with no admin UI (document_categories/mortgage_
--    rules' Phase 2 admin surface does not cover document_types itself).
--
--    20260724010000_ocr_document_extraction.sql, the migration that first
--    added ocr_kind, followed exactly this posture — it added the column and
--    its CHECK constraint only, and ADR 0008's own Consequences section
--    states explicitly: "set to null for every existing document type until
--    a human tags the real NRIC/salary slip types via SQL (no admin UI for
--    this yet...)". No nric/salary_slip document_types rows were ever
--    inserted by that migration either.
--
--    This migration matches that same posture for the 4 new kinds rather
--    than inventing a different one. Unlike nric/salary_slip (which likely
--    already had pre-existing document_types rows a human retags), the 4 new
--    kinds (Bank Statement, EPF Statement, Employment Letter, EA Form) may
--    not have any corresponding document_types row at all yet — a human must
--    both confirm whether a matching row already exists under some name and,
--    if not, create one, then tag it with the correct ocr_kind. This is a
--    judgment call about real production data (existing row names, whether
--    duplicates would be created) that this session cannot safely make
--    without live schema/data access, so it is intentionally left as a
--    manual step rather than guessed at.
--
--    Illustrative template only — NOT executed by this migration. A human
--    should adjust `name`/`category_id` to match this bank's actual
--    document catalog before running, and confirm via SELECT first whether
--    a matching row already exists to retag instead of inserting a new one:
--
--      insert into public.document_types (name, ocr_kind)
--      select 'Bank Statement', 'bank_statement'
--      where not exists (select 1 from public.document_types where name = 'Bank Statement');
--
--      insert into public.document_types (name, ocr_kind)
--      select 'EPF Statement', 'epf_statement'
--      where not exists (select 1 from public.document_types where name = 'EPF Statement');
--
--      insert into public.document_types (name, ocr_kind)
--      select 'Employment Letter', 'employment_letter'
--      where not exists (select 1 from public.document_types where name = 'Employment Letter');
--
--      insert into public.document_types (name, ocr_kind)
--      select 'EA Form', 'ea_form'
--      where not exists (select 1 from public.document_types where name = 'EA Form');
--
--    (Guarded by `where not exists (...)` by name, matching this repo's
--    established `where not exists` idiom for reference-data seeding, e.g.
--    20260731010000_aikim_standard_baseline_seed.sql's rule-row inserts —
--    used here purely as a template for the human step, not executed as
--    part of this migration. document_types has no declared unique
--    constraint on `name` to `on conflict` against, per its current known
--    shape in docs/architecture/database.md, so `where not exists` is the
--    correct guard here, not `on conflict`.)
-- ----------------------------------------------------------------------------

-- ============================================================================
-- End of Sprint 2 Document Screening API v1.0 schema migration.
--
-- After this migration is run, and once a human has completed step 4's
-- document_types tagging separately, all 6 OCRDocumentKind values are valid
-- end-to-end: document_types.ocr_kind can tag a document type as any of the
-- 6, document_extractions.kind/classification_predicted_kind accept all 6
-- (plus 'unrecognized' for the latter), and document_extractions can carry a
-- full confidence/validation payload from the new screenDocument Server
-- Action alongside the existing extractDocumentData flow's plainer rows.
-- ============================================================================
