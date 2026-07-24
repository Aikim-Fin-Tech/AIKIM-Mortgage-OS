-- ============================================================================
-- AIKIM Mortgage OS — Sprint 6.3B-3: DSR Rules Knowledge (schema)
--
-- Scope: exactly ONE new table, per the CTO-approved Mortgage Knowledge
-- Database blueprint (docs/product/mortgage-knowledge-database-prd.md
-- Section 3.6, "follow exactly") and the CTO's Sprint 6.3B-3 authorization
-- ("DSR Rules Knowledge Implementation", same discipline as Sprint 6.3B-1
-- Income and 6.3B-2 Commitment):
--   dsr_rules                                — Computation Knowledge (DSR)
--
-- banks, bank_products, evidence, and derivation_results already exist
-- (Sprint 6.3B-1, 20260726010000_income_knowledge_schema.sql) and are NOT
-- touched, recreated, or altered by this migration. derivation_results'
-- `domain` CHECK constraint already accepts 'dsr' as of that migration — no
-- change to derivation_results is needed here.
--
-- Deliberately NOT created here (future, separately-approved sprints):
--   property_rules, eligibility_verdicts,
--   eligibility_verdict_derivation_results, ai_recommendations.
--
-- Shape difference from both prior rule tables (read this before assuming
-- symmetry — see ADR 0010/0011 for those tables' precedents, and DB PRD
-- Section 3.6 vs 3.4/3.5 for why this one differs from both):
-- dsr_rules has NO borrower-profile wildcard columns (like
-- commitment_recognition_rules) AND no exact-match dimension like
-- commitment_recognition_rules.commitment_type. Its matching dimensions are
-- bank_id (required, exact), bank_product_id (nullable, wildcard,
-- most-specific-wins — same pattern as every other rule table), and — new
-- to this table — income_tier_lower_bound / income_tier_upper_bound, a
-- NUMERIC RANGE, not a wildcard-equality check. See the design note on
-- those two columns below the CREATE TABLE statement.
--
-- RLS is enabled below (`enable row level security`) but no policy is
-- defined here by design — see the companion migration
-- 20260728020000_dsr_knowledge_rls.sql, run immediately after this one.
-- Until that second migration runs, this table is RLS-enabled with zero
-- policies, i.e. inaccessible to anyone but the table owner — never
-- silently open.
--
-- Audit note: as with every prior migration in this repo, this session has
-- no live database connection and cannot verify the current schema. Every
-- statement below is written defensively (IF NOT EXISTS / additive-only) and
-- touches zero existing rows or tables.
--
-- Copy this entire file into the Supabase SQL Editor and run it once, after
-- all prior migrations (including both Income Knowledge migrations and both
-- Commitment Knowledge migrations). Idempotent: safe to re-run. Does not
-- touch any existing row data. NOT executed by this session — pending human
-- review and manual execution.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. dsr_rules — the DSR formula and threshold for a bank/product (DB PRD
--    Section 3.6).
--
--    Reuses the same bank_id (required, exact) / bank_product_id (nullable,
--    wildcard, most-specific-wins) scoping every other rule table uses —
--    the same algorithm src/lib/mortgage-rules/match-rule.ts,
--    src/lib/income-knowledge/match-income-rule.ts, and
--    src/lib/commitment-knowledge/match-commitment-rule.ts already
--    implement, to be extended by a future
--    src/lib/dsr-knowledge/match-dsr-rule.ts (not part of this migration;
--    schema only).
--
--    ---------------------------------------------------------------------
--    Design note: income_tier_lower_bound / income_tier_upper_bound are a
--    NUMERIC RANGE, not a wildcard-equality-match column like every other
--    matching dimension in this Knowledge Base so far.
--
--    Every other rule table's nullable matching columns (the 4
--    borrower-profile columns on income_recognition_rules,
--    commitment_recognition_rules.commitment_type's exact-match
--    counterpart, bank_product_id everywhere) follow one shared rule: NULL
--    means "matches anything for this dimension," a non-NULL value means
--    "matches exactly this value." These two columns do NOT follow that
--    rule. A future matcher must evaluate them as a half-open numeric
--    range test against a given recognized-income figure, not an equality
--    test:
--
--      (income_tier_lower_bound IS NULL OR income >= income_tier_lower_bound)
--      AND (income_tier_upper_bound IS NULL OR income < income_tier_upper_bound)
--
--    i.e. NULL on either bound means "no restriction on that side" (an
--    open-ended range boundary), not "wildcard the whole dimension" the way
--    NULL works everywhere else in this schema. A future
--    src/lib/dsr-knowledge/match-dsr-rule.ts must implement this as a range
--    comparison, never reuse the coalesce-to-empty-string /
--    equality-wildcard helper the other matchers share. This is schema-only
--    intent recorded here for that future TypeScript task — no matching
--    logic is implemented by this migration.
--    ---------------------------------------------------------------------
-- ----------------------------------------------------------------------------
create table if not exists public.dsr_rules (
  id uuid primary key default gen_random_uuid(),
  bank_id uuid not null references public.banks(id),
  bank_product_id uuid references public.bank_products(id),
  rule_name text not null,
  max_dsr_percentage numeric,
  stress_test_rate_buffer_percentage numeric,
  income_tier_lower_bound numeric,
  income_tier_upper_bound numeric,
  description text,
  version integer not null default 1,
  is_active boolean not null default true,
  effective_from date,
  effective_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.dsr_rules is
  'The DSR formula and threshold for a bank/product (DB PRD Section 3.6). No borrower-profile wildcard columns and no exact-match dimension — matching here is bank_id (required) + bank_product_id (nullable wildcard) + an income-tier NUMERIC RANGE (income_tier_lower_bound/income_tier_upper_bound), not an equality wildcard. See the design note above this table''s CREATE TABLE statement. Deactivate-only, no DELETE policy (see companion RLS migration).';
comment on column public.dsr_rules.max_dsr_percentage is
  'The maximum ratio this bank/product allows. No real percentage is seeded by this migration — requires real bank policy input.';
comment on column public.dsr_rules.stress_test_rate_buffer_percentage is
  'An interest-rate buffer applied to the proposed instalment before computing the DSR numerator, if this bank practices it. Not asserted by this migration.';
comment on column public.dsr_rules.income_tier_lower_bound is
  'Half-open range bound, NOT a wildcard-equality column like every other rule table''s matching columns. A rule matches a given recognized-income figure when (income_tier_lower_bound IS NULL OR income >= income_tier_lower_bound). NULL means no restriction on this side, not "matches any dimension." Range-matching logic is a future TypeScript task (src/lib/dsr-knowledge/match-dsr-rule.ts), not implemented by this migration.';
comment on column public.dsr_rules.income_tier_upper_bound is
  'Half-open range bound, exclusive: a rule matches when (income_tier_upper_bound IS NULL OR income < income_tier_upper_bound). NULL means no restriction on this side. See income_tier_lower_bound''s comment for the full range-matching intent — the two columns together define a numeric range, not two independent wildcard-equality columns.';
comment on column public.dsr_rules.version is
  'Same purpose as income_recognition_rules.version / commitment_recognition_rules.version / mortgage_rules.version: increments when a rule''s matching profile changes after it has been used, so historical derivation_results references stay interpretable.';

-- Prevent duplicate *active* rules sharing the same bank/product scope +
-- version. Same purpose as income_recognition_rules_active_profile_version_idx
-- / commitment_recognition_rules_active_profile_version_idx
-- (20260726010000_income_knowledge_schema.sql,
-- 20260727010000_commitment_knowledge_schema.sql), scoped to THIS table's
-- actual dimensions: bank_id, bank_product_id, version. bank_product_id is
-- NULL-safe (wildcard) via coalesce, same convention as every other rule
-- table's index. Scoped to active rows only so historical/deactivated
-- versions of the same combination may coexist.
--
-- Accepted Phase 1 gap, explicitly NOT solved here: this index does NOT
-- catch two active rules with OVERLAPPING income-tier ranges for the same
-- bank/product/version — e.g. one rule for [0, 5000) and another for
-- [3000, 8000) could both be active simultaneously, and an income of 4000
-- would technically match both. Postgres unique indexes cannot express a
-- range-overlap exclusion constraint over these two nullable columns
-- without a dedicated `EXCLUDE USING gist` constraint (a materially
-- different mechanism than every other rule table's btree unique index),
-- and this migration's brief scopes tier-overlap prevention out — not
-- attempted here. This mirrors the exact same accepted-gap precedent
-- already documented for mortgage_rules in Sprint 6.2 Phase 1
-- (20260722010000_mortgage_rules_engine.sql: "Postgres treats NULL as
-- always-distinct in a unique index, so this constraint does not catch two
-- fully-identical wildcard rules; rule data is human-curated and
-- low-volume, so this is an accepted gap for now, not a blocking issue.").
-- Same reasoning applies here: DSR rule data is human-curated and
-- low-volume, so tier-overlap prevention is an accepted gap for now, not a
-- blocking issue.
drop index if exists public.dsr_rules_active_profile_version_idx;
create unique index dsr_rules_active_profile_version_idx on public.dsr_rules (
  bank_id,
  coalesce(bank_product_id::text, ''),
  version
)
where is_active;

create index if not exists dsr_rules_bank_id_idx on public.dsr_rules(bank_id);
create index if not exists dsr_rules_bank_product_id_idx on public.dsr_rules(bank_product_id);

alter table public.dsr_rules enable row level security;

-- Clarifies, at the schema level (not just in application code comments),
-- that dsr-domain rows are the one exception to input_evidence_ids' stated
-- purpose — added here rather than left undocumented outside
-- src/lib/dsr-knowledge/actions.ts, per a security-review finding on this
-- sprint's TypeScript layer: a database-level reader (SQL Editor, a future
-- migration author) has no way to discover this fact from the column's
-- original comment alone.
comment on column public.derivation_results.input_evidence_ids is
  'jsonb array of public.evidence.id values this result was computed from. A jsonb array, not a separate join table — kept in this one shared table per the DB PRD''s "one shared shape" discipline; a dedicated join table is out of scope for this sprint''s 5-table slice. Exception: for domain = ''dsr'' rows, this is always ''[]'' — DSR does not consume evidence directly, its inputs are other derivation_results rows (Income/Commitment Recognition outputs). A dsr row''s contributing derivation_results ids are instead recorded inside result_value.incomeDerivationResultIds / result_value.commitmentDerivationResultIds — see src/lib/dsr-knowledge/actions.ts and ADR 0012.';

-- ============================================================================
-- End of Sprint 6.3B-3 DSR Rules Knowledge schema migration.
-- RLS policy for this table is in the companion migration:
-- 20260728020000_dsr_knowledge_rls.sql — run that immediately after this
-- file, otherwise the table above is enabled-RLS-with-zero-policies
-- (inaccessible to everyone but the table owner).
--
-- derivation_results.domain already accepts 'dsr' as of
-- 20260726010000_income_knowledge_schema.sql — no change needed there.
-- derivation_results.rule_id remains the app-validated, non-FK polymorphic
-- reference documented in that migration; a dsr-domain derivation_results
-- row's rule_id now has a real target table (dsr_rules) to be validated
-- against in application code, same discipline as income_recognition and
-- commitment_recognition today.
-- ============================================================================
