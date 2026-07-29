-- ============================================================================
-- AIKIM Mortgage OS - Bank / Bank Products Schema Reconciliation
--
-- public.banks and public.bank_products already exist in production,
-- created out-of-band before any Sprint 6.3 migration ran. Confirmed live
-- bank_products shape (0 rows): id, bank_id, product_name, property_type,
-- min_loan_amount, max_margin, max_tenure_years, interest_rate,
-- lock_in_period_years, status, created_at. banks also confirmed to exist
-- with 0 rows; its full column list beyond id was not confirmed, so every
-- column below is added defensively via IF NOT EXISTS.
--
-- Purely additive. Adds only the columns required by
-- 20260726010000_income_knowledge_schema.sql and this codebase's
-- application code. Does not touch any pre-existing column, constraint, or
-- row on either table. Must run BEFORE
-- 20260726010000_income_knowledge_schema.sql is (re-)run.
--
-- Idempotent - every statement is ADD COLUMN IF NOT EXISTS, safe to re-run.
-- NOT executed by this session - pending human review and manual execution
-- in the Supabase SQL Editor.
--
-- Full incident narrative and rationale: docs/architecture/database.md,
-- "Schema reconciliations" section.
-- ============================================================================

alter table public.banks add column if not exists name text not null unique;
alter table public.banks add column if not exists short_code text;
alter table public.banks add column if not exists is_active boolean not null default true;
alter table public.banks add column if not exists effective_from date;
alter table public.banks add column if not exists effective_to date;
alter table public.banks add column if not exists created_at timestamptz not null default now();
alter table public.banks add column if not exists updated_at timestamptz not null default now();

alter table public.bank_products add column if not exists product_code text;
alter table public.bank_products add column if not exists financing_structure text;
alter table public.bank_products add column if not exists is_active boolean not null default true;
alter table public.bank_products add column if not exists effective_from date;
alter table public.bank_products add column if not exists effective_to date;
alter table public.bank_products add column if not exists updated_at timestamptz not null default now();
