-- ============================================================================
-- AIKIM Mortgage OS — Sprint 1.4 (Option A): income_recognition_rules
-- optional link to income_types
--
-- Additive-only enhancement to the EXISTING public.income_recognition_rules
-- table (created in 20260726010000_income_knowledge_schema.sql, not yet
-- confirmed run against production, but already the schema
-- src/lib/income-knowledge/ and the Alpha-001 Mortgage Assessment feature
-- are built against). Nothing about that table's existing columns changes.
--
-- Adds one nullable column, income_type_id, an optional normalized
-- reference into the new public.income_types table (see the companion
-- migration 20260801010000_income_types_schema.sql), so future rule
-- authoring can use a typo-proof canonical vocabulary instead of only free
-- text. The existing free-text income_source_type column (not null) is
-- UNCHANGED and remains what src/lib/income-knowledge/match-income-rule.ts
-- and computeIncomeRecognition actually read/match on today. Nothing in the
-- current TypeScript engine reads or matches on income_type_id yet — wiring
-- it into the matcher is a deliberate future decision, not implied by this
-- column's existence, and every existing/future row can safely leave it
-- NULL.
--
-- Deliberately NOT done here (out of scope for this migration):
--   - income_type_id is NOT made NOT NULL.
--   - No backfill of income_type_id from income_source_type.
--   - 20260731010000_aikim_standard_baseline_seed.sql is not touched.
--     Backfilling that seed's rows' income_type_id is a natural low-risk
--     follow-up, not done here.
--
-- Idempotent: `add column if not exists` / `create index if not exists`,
-- safe to re-run. Does not touch any existing row data or column. NOT
-- executed by this session — pending human review and manual execution in
-- the Supabase SQL Editor.
-- ============================================================================

alter table public.income_recognition_rules
  add column if not exists income_type_id uuid references public.income_types(id);

comment on column public.income_recognition_rules.income_type_id is
  'Optional normalized reference into public.income_types, added so future rule authoring can use a typo-proof canonical vocabulary. Does NOT replace, rename, or deprecate income_source_type (text, not null), which is unchanged and remains what src/lib/income-knowledge/match-income-rule.ts and computeIncomeRecognition actually read/match on today. Nothing in the current TypeScript engine reads or matches on this column yet — wiring it into the matcher is a deliberate future decision. Nullable; every existing/future row may safely leave it NULL.';

create index if not exists income_recognition_rules_income_type_id_idx
  on public.income_recognition_rules(income_type_id);

-- ============================================================================
-- End of Sprint 1.4 (Option A) income_recognition_rules.income_type_id
-- migration.
-- ============================================================================
