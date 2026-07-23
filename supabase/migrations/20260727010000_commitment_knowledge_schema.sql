-- ============================================================================
-- AIKIM Mortgage OS — Sprint 6.3B-2: Commitment Knowledge (schema)
--
-- Scope: exactly ONE new table, per the CTO-approved Mortgage Knowledge
-- Database blueprint (docs/product/mortgage-knowledge-database-prd.md
-- Section 3.5, "follow exactly") and the CTO's Sprint 6.3B-2 authorization
-- ("Commitment Knowledge Implementation"):
--   commitment_recognition_rules             — Derivation Knowledge
--                                               (commitment)
--
-- banks, bank_products, evidence, and derivation_results already exist
-- (Sprint 6.3B-1, 20260726010000_income_knowledge_schema.sql) and are NOT
-- touched, recreated, or altered by this migration. derivation_results'
-- `domain` CHECK constraint already accepts 'commitment_recognition' as of
-- that migration — see this file's design note below; no change to
-- derivation_results is needed here.
--
-- Deliberately NOT created here (future, separately-approved sprints):
--   dsr_rules, property_rules, eligibility_verdicts,
--   eligibility_verdict_derivation_results, ai_recommendations.
--
-- Shape difference from income_recognition_rules (read this before assuming
-- symmetry — see ADR 0010 for that table's precedent, and the DB PRD's
-- Section 3.5 vs 3.4 for why the two tables differ):
-- commitment_recognition_rules has NO borrower-profile wildcard columns
-- (nationality / income_country / employment_type / income_structure). Per
-- DB PRD Section 3.5, its matching dimensions are only bank_id (required,
-- exact), bank_product_id (nullable, wildcard, most-specific-wins — same
-- pattern as every other rule table), and commitment_type (required, exact
-- match). This migration does not copy income_recognition_rules' 4-column
-- borrower-profile shape onto this table — it does not belong here.
--
-- RLS is enabled below (`enable row level security`) but no policy is
-- defined here by design — see the companion migration
-- 20260727020000_commitment_knowledge_rls.sql, run immediately after this
-- one. Until that second migration runs, this table is RLS-enabled with
-- zero policies, i.e. inaccessible to anyone but the table owner — never
-- silently open.
--
-- Audit note: as with every prior migration in this repo, this session has
-- no live database connection and cannot verify the current schema. Every
-- statement below is written defensively (IF NOT EXISTS / additive-only) and
-- touches zero existing rows or tables.
--
-- Copy this entire file into the Supabase SQL Editor and run it once, after
-- all prior migrations (including both Income Knowledge migrations).
-- Idempotent: safe to re-run. Does not touch any existing row data. NOT
-- executed by this session — pending human review and manual execution.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. commitment_recognition_rules — the bank-specific treatment applied to a
--    borrower's existing commitment Evidence, for DSR purposes (DB PRD
--    Section 3.5).
--
--    Reuses the same bank_id (required, exact) / bank_product_id (nullable,
--    wildcard, most-specific-wins) scoping every other rule table uses —
--    the same algorithm src/lib/mortgage-rules/match-rule.ts and
--    src/lib/income-knowledge/match-income-rule.ts already implement, to be
--    extended by a future src/lib/commitment-knowledge/match-commitment-rule.ts
--    (not part of this migration; schema only).
--
--    commitment_type and recognition_method are deliberately left as plain
--    text, NOT CHECK-constrained, even though the DB PRD's Section 3.5 lists
--    illustrative values for both. This is a considered decision, not an
--    oversight — see the design note immediately below.
--
--    ---------------------------------------------------------------------
--    Design note: why no CHECK constraint on commitment_type or
--    recognition_method (unlike income_recognition_rules.recognition_method,
--    which IS CHECK-constrained).
--
--    income_recognition_rules.recognition_method got a CHECK constraint
--    because the DB PRD names it as a definitively closed set — "the three
--    treatment shapes the PRD named" (full_value | percentage_haircut |
--    rolling_average), each mechanically gating which other columns are
--    meaningful (haircut_percentage only for percentage_haircut, etc.).
--    income_recognition_rules.income_source_type, by contrast, also has a
--    DB-PRD-listed vocabulary (basic salary, fixed allowance, commission,
--    bonus, ... , "other") but did NOT get a CHECK constraint in that
--    migration — left as open text, application-layer vocabulary, same
--    posture as loan_cases.income_structure.
--
--    commitment_recognition_rules.commitment_type matches the
--    income_source_type shape, not the recognition_method shape: DB PRD
--    Section 3.5 lists "Housing loan, hire purchase/car loan, personal
--    loan, credit card, other" — a domain-classification list ending in an
--    open "other" catch-all, the same shape as income_source_type's list,
--    not a mechanically closed set of treatment methods. It is left as open
--    text, matching that precedent.
--
--    commitment_recognition_rules.recognition_method also stays open text:
--    DB PRD Section 3.5 introduces its examples with "E.g." — "full_instalment",
--    "percentage_of_limit" — explicitly illustrative language, unlike
--    income_recognition_rules.recognition_method's definitive "the three
--    treatment shapes the PRD named". No closed set is named for this
--    column, so no CHECK is added; a real Malaysian credit-card underwriting
--    convention like "percentage_of_limit" is far from the only method a
--    future bank/product could require, and this column should not need a
--    migration every time a new bank introduces a new one.
--    ---------------------------------------------------------------------
-- ----------------------------------------------------------------------------
create table if not exists public.commitment_recognition_rules (
  id uuid primary key default gen_random_uuid(),
  bank_id uuid not null references public.banks(id),
  bank_product_id uuid references public.bank_products(id),
  rule_name text not null,
  commitment_type text not null,
  recognition_method text,
  recognition_percentage numeric,
  allows_to_be_settled_exclusion boolean not null default false,
  description text,
  version integer not null default 1,
  is_active boolean not null default true,
  effective_from date,
  effective_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.commitment_recognition_rules is
  'The bank-specific treatment applied to a borrower''s existing commitment Evidence, for DSR purposes (DB PRD Section 3.5). No borrower-profile wildcard columns — unlike income_recognition_rules, matching here is bank_id (required) + bank_product_id (nullable wildcard) + commitment_type (required, exact) only. Deactivate-only, no DELETE policy (see companion RLS migration).';
comment on column public.commitment_recognition_rules.commitment_type is
  'Required, exact match (never a wildcard) — e.g. housing loan, hire purchase/car loan, personal loan, credit card, other. Open vocabulary maintained by application-layer convention, not a database enum — same posture as income_recognition_rules.income_source_type. A new commitment type never requires a migration.';
comment on column public.commitment_recognition_rules.recognition_method is
  'E.g. "full_instalment", "percentage_of_limit" (a real Malaysian credit-card underwriting convention) — the method name only, illustrative per the DB PRD, not a closed set. No CHECK constraint: unlike income_recognition_rules.recognition_method, the DB PRD does not name this a definitively closed vocabulary. No real percentage is asserted by the method name itself.';
comment on column public.commitment_recognition_rules.recognition_percentage is
  'Only meaningful when recognition_method requires one (e.g. percentage_of_limit). No real percentage is seeded by this migration — requires real bank policy input.';
comment on column public.commitment_recognition_rules.allows_to_be_settled_exclusion is
  'Whether this bank allows excluding a commitment the borrower states will be settled before/at drawdown.';
comment on column public.commitment_recognition_rules.version is
  'Same purpose as income_recognition_rules.version / mortgage_rules.version: increments when a rule''s matching profile changes after it has been used, so historical derivation_results references stay interpretable.';

-- Prevent duplicate *active* rules sharing the same bank/product scope +
-- commitment_type + version. Same purpose as
-- income_recognition_rules_active_profile_version_idx
-- (20260726010000_income_knowledge_schema.sql), but scoped to THIS table's
-- actual matching dimensions — bank_id, bank_product_id, commitment_type,
-- version — not a copy of income_recognition_rules' 4 borrower-profile
-- columns, which have no equivalent here. bank_product_id is NULL-safe
-- (wildcard) via coalesce, same convention as every other rule table's
-- index; commitment_type is required (never NULL) so it needs no coalesce.
-- Scoped to active rows only so historical/deactivated versions of the same
-- combination may coexist.
--
-- No "no-empty-string-wildcard" CHECK guard is added here (unlike
-- income_recognition_rules_no_empty_string_wildcards). That guard exists
-- specifically to stop an empty string from silently defeating a
-- NULL-as-wildcard text column used in matching. This table's only nullable
-- matching column is bank_product_id, a uuid with no empty-string state to
-- guard against; commitment_type, the one text matching column, is NOT
-- NULL and not a wildcard at all (per DB PRD Section 3.5, "required, exact
-- match") — so the guard this pattern exists to prevent does not apply
-- here. Copying it anyway would guard against a failure mode this table's
-- actual column shape cannot produce.
drop index if exists public.commitment_recognition_rules_active_profile_version_idx;
create unique index commitment_recognition_rules_active_profile_version_idx on public.commitment_recognition_rules (
  bank_id,
  coalesce(bank_product_id::text, ''),
  commitment_type,
  version
)
where is_active;

create index if not exists commitment_recognition_rules_bank_id_idx on public.commitment_recognition_rules(bank_id);
create index if not exists commitment_recognition_rules_bank_product_id_idx on public.commitment_recognition_rules(bank_product_id);

alter table public.commitment_recognition_rules enable row level security;

-- ============================================================================
-- End of Sprint 6.3B-2 Commitment Knowledge schema migration.
-- RLS policy for this table is in the companion migration:
-- 20260727020000_commitment_knowledge_rls.sql — run that immediately after
-- this file, otherwise the table above is enabled-RLS-with-zero-policies
-- (inaccessible to everyone but the table owner).
--
-- derivation_results.domain already accepts 'commitment_recognition' as of
-- 20260726010000_income_knowledge_schema.sql — no change needed there.
-- derivation_results.rule_id remains the app-validated, non-FK polymorphic
-- reference documented in that migration; a commitment_recognition-domain
-- derivation_results row's rule_id now has a real target table
-- (commitment_recognition_rules) to be validated against in application
-- code, same discipline as income_recognition today.
-- ============================================================================
