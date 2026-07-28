-- ============================================================================
-- AIKIM Mortgage OS — Bank / Bank Products Schema Reconciliation
-- (production incident fix — must run BEFORE
-- 20260726010000_income_knowledge_schema.sql is (re-)run)
--
-- INCIDENT
-- --------
-- 20260726010000_income_knowledge_schema.sql was executed against the live
-- production database and failed partway through. Investigation (human
-- operator, direct SQL against production) found:
--
--   1. public.banks and public.bank_products ALREADY EXISTED in production
--      before any Sprint 6.3 migration ever ran — created entirely
--      out-of-band, outside this repo's migration history. No file in
--      supabase/migrations/ ever creates either table; nothing in src/,
--      supabase/, or docs/ references bank_products' pre-existing columns.
--      Both tables had 0 rows at the time of investigation.
--
--   2. Because public.bank_products already existed, line 69's
--      `create table if not exists public.bank_products (...)` in
--      20260726010000_income_knowledge_schema.sql was a silent no-op — it
--      did not create any of the columns that CREATE TABLE statement names.
--      Execution then continued to line 84-85,
--      `comment on column public.bank_products.financing_structure is ...`,
--      which failed:
--        ERROR 42703: column "financing_structure" of relation
--        "public.bank_products" does not exist
--      — because that column was never actually created (see #2 above).
--
--   3. Postgres implicitly wraps a multi-statement batch sent via the
--      Supabase SQL Editor in a single transaction. The failure above rolled
--      back the ENTIRE batch, including whatever that file's own (also
--      no-op'd) `create table if not exists public.banks (...)` and every
--      later CREATE TABLE (income_recognition_rules, evidence,
--      derivation_results) attempted. Confirmed directly: none of
--      income_recognition_rules, evidence, or derivation_results exist in
--      production as of this writing — the failed run left literally
--      nothing new behind beyond the two pre-existing tables it found.
--
-- CONFIRMED LIVE SHAPE (human operator, direct query against production)
-- ------------------------------------------------------------------------
-- public.bank_products — 11 columns, 0 rows:
--   id, bank_id, product_name, property_type, min_loan_amount, max_margin,
--   max_tenure_years, interest_rate, lock_in_period_years, status,
--   created_at
-- That is the FULL, confirmed column list — nothing else exists on this
-- table today. It is missing every column this codebase's design and
-- application code need: product_code, financing_structure, is_active,
-- effective_from, effective_to, updated_at.
--
-- public.banks — confirmed to exist, confirmed 0 rows. Its exact column
-- list was NOT retrieved during the investigation (unlike bank_products, we
-- do not have its full current shape confirmed). Because it is proven
-- pre-existing and out-of-band exactly like bank_products, this migration
-- treats banks' current shape as UNKNOWN beyond `id` and is written
-- defensively rather than assuming it already matches this codebase's
-- design — every column below is its own `ADD COLUMN IF NOT EXISTS`
-- statement, so any column that happens to already exist under the same
-- name (whatever its current type/constraints) is left completely
-- untouched.
--
-- WHAT THIS MIGRATION DOES
-- -------------------------
-- Purely additive: `alter table ... add column if not exists ...` only, for
-- BOTH tables, reconciling the pre-existing live schema with what this
-- codebase's design (20260726010000_income_knowledge_schema.sql's own
-- intent) and application code (src/lib/database/income-knowledge.ts'
-- getBanks()) actually need — without touching any pre-existing column,
-- constraint, or row on either table.
--
--   banks: adds (if missing) name text not null unique, short_code text,
--   is_active boolean not null default true, effective_from date,
--   effective_to date, created_at timestamptz not null default now(),
--   updated_at timestamptz not null default now() — exactly what
--   20260726010000_income_knowledge_schema.sql's own `create table if not
--   exists public.banks` intended, and exactly what getBanks() selects
--   (src/lib/database/income-knowledge.ts).
--
--   bank_products: adds (if missing) ONLY the 6 confirmed-missing columns:
--   product_code text, financing_structure text, is_active boolean not
--   null default true, effective_from date, effective_to date, updated_at
--   timestamptz not null default now(). Does NOT touch property_type,
--   min_loan_amount, max_margin, max_tenure_years, interest_rate,
--   lock_in_period_years, status, id, bank_id, product_name, or created_at
--   — all 11 confirmed-existing columns are pre-existing, unrelated to this
--   codebase's design, and explicitly out of scope. The human operator was
--   explicit: do not modify existing production bank_products in any way
--   beyond adding what is missing.
--
-- Both tables are confirmed to have 0 rows, so adding NOT NULL columns
-- (with or without a DEFAULT) is safe here — there is no existing row that
-- could violate the new constraint. This migration does not touch RLS
-- (`enable row level security` / policies) on either table — that already
-- happened, if at all, out-of-band or in a prior migration; this file's
-- scope is column reconciliation only. If RLS is not yet enabled on either
-- table, that is unchanged by this migration and remains the responsibility
-- of 20260726020000_income_knowledge_rls.sql / whatever out-of-band setup
-- already exists.
--
-- WHY THIS FILE'S TIMESTAMP SORTS WHERE IT DOES
-- -----------------------------------------------
-- Filename 20260726005000 deliberately sorts AFTER
-- 20260725010000_loan_workflow.sql (the last migration confirmed actually
-- applied to production) and BEFORE 20260726010000_income_knowledge_schema.sql
-- (the migration that failed) — this file MUST be run first, so that when
-- 20260726010000_income_knowledge_schema.sql is next (re-)run, its own
-- `create table if not exists public.bank_products` no-ops harmlessly
-- against a bank_products that now already has every column that file's
-- later `comment on column ...financing_structure` statement (and any
-- future code) expects, and the run completes instead of failing again at
-- the same point.
--
-- Idempotent: every statement is `add column if not exists`, safe to re-run.
-- Touches zero existing row data. Does not create, drop, or rename any
-- table, and does not alter/retype/rename any pre-existing column. Does not
-- add or change any function/RPC, so no `notify pgrst, 'reload schema';` is
-- needed here (grep across supabase/migrations/ confirms that statement is
-- only used when a function/RPC signature PostgREST exposes changes — never
-- for plain column/table DDL; e.g. 20260730040000_knowledge_rule_index_correction.sql,
-- a schema-only migration like this one, omits it for the same reason).
--
-- Copy this entire file into the Supabase SQL Editor and run it once,
-- BEFORE (re-)running 20260726010000_income_knowledge_schema.sql. NOT
-- executed by this session — pending human review and manual execution.
--
-- VERIFICATION (run manually after applying, to confirm the fix)
-- ------------------------------------------------------------------
-- After this migration is run:
--   select column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'banks'
--   order by ordinal_position;
-- should list at least: id, name, short_code, is_active, effective_from,
-- effective_to, created_at, updated_at.
--
--   select column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'bank_products'
--   order by ordinal_position;
-- should list at least: id, bank_id, product_name, property_type,
-- min_loan_amount, max_margin, max_tenure_years, interest_rate,
-- lock_in_period_years, status, created_at (all 11 pre-existing, unchanged),
-- PLUS the 6 newly added: product_code, financing_structure, is_active,
-- effective_from, effective_to, updated_at.
--
--   select count(*) from public.banks;
--   select count(*) from public.bank_products;
-- both should still return 0 — this migration adds columns only, never
-- rows, and touches no existing row.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. banks — add the columns this codebase's design
--    (20260726010000_income_knowledge_schema.sql) and application code
--    (src/lib/database/income-knowledge.ts getBanks()) require. `id uuid
--    primary key` is assumed to already exist (mirroring bank_products'
--    confirmed pattern) and is intentionally NOT touched here. Every other
--    column is its own defensive ADD COLUMN IF NOT EXISTS — banks' current
--    full shape beyond `id` was not confirmed during the investigation, so
--    nothing here assumes a column is absent, or that an existing
--    same-named column (if any) matches this type/constraint exactly.
-- ----------------------------------------------------------------------------
alter table public.banks add column if not exists name text not null unique;
alter table public.banks add column if not exists short_code text;
alter table public.banks add column if not exists is_active boolean not null default true;
alter table public.banks add column if not exists effective_from date;
alter table public.banks add column if not exists effective_to date;
alter table public.banks add column if not exists created_at timestamptz not null default now();
alter table public.banks add column if not exists updated_at timestamptz not null default now();

comment on table public.banks is
  'Bank identity anchor (Bank Knowledge Layer). Pre-existing in production out-of-band before any Sprint 6.3 migration ran (discovered during the 20260726010000_income_knowledge_schema.sql production incident) — this table''s CREATE TABLE was a no-op against production; only the ADD COLUMN IF NOT EXISTS statements in 20260726005000_bank_products_schema_reconciliation.sql actually reconciled its shape with this codebase''s design. Deactivate-only, no DELETE policy (see companion RLS migration) — a case evaluated against a now-deactivated bank must stay explainable.';

-- ----------------------------------------------------------------------------
-- 2. bank_products — add ONLY the 6 confirmed-missing columns. Every other
--    column already exists in production (id, bank_id, product_name,
--    property_type, min_loan_amount, max_margin, max_tenure_years,
--    interest_rate, lock_in_period_years, status, created_at) and is
--    deliberately left untouched — out of scope for this reconciliation.
-- ----------------------------------------------------------------------------
alter table public.bank_products add column if not exists product_code text;
alter table public.bank_products add column if not exists financing_structure text;
alter table public.bank_products add column if not exists is_active boolean not null default true;
alter table public.bank_products add column if not exists effective_from date;
alter table public.bank_products add column if not exists effective_to date;
alter table public.bank_products add column if not exists updated_at timestamptz not null default now();

comment on table public.bank_products is
  'A specific mortgage product belonging to exactly one bank. Pre-existing in production out-of-band before any Sprint 6.3 migration ran, with an unrelated 11-column shape (property_type, min_loan_amount, max_margin, max_tenure_years, interest_rate, lock_in_period_years, status, plus id/bank_id/product_name/created_at) — discovered during the 20260726010000_income_knowledge_schema.sql production incident. Those 11 pre-existing columns are untouched by this codebase and out of scope for this Knowledge Base work. product_code/financing_structure/is_active/effective_from/effective_to/updated_at were added by 20260726005000_bank_products_schema_reconciliation.sql. No real product names/terms are seeded — see supabase/seeds/20260726010000_income_knowledge_seed.sql.';
comment on column public.bank_products.financing_structure is
  'Open vocabulary (e.g. conventional/Islamic). No real classification scheme asserted by this migration.';

-- ============================================================================
-- End of Bank / Bank Products Schema Reconciliation migration.
--
-- Next step for the human operator: re-run
-- 20260726010000_income_knowledge_schema.sql. Its own `create table if not
-- exists public.banks` / `public.bank_products` statements will again no-op
-- (both tables already exist), but every column and comment that file
-- references on those two tables now actually exists, so it will proceed
-- past the point it previously failed and go on to create
-- income_recognition_rules, evidence, and derivation_results, none of which
-- exist in production yet.
-- ============================================================================
