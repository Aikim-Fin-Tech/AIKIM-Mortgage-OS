# Database

> Consolidated version: [../DATABASE.md](../DATABASE.md).
>
> Reconstructed from inline comments in `src/lib/database/*.ts` and
> `supabase/migrations/*.sql`. Not verified against a live schema export — none
> exists in this repo yet. Update this file the moment a real baseline is committed.

## Known gap

No committed baseline schema. `supabase/migrations/` holds only incremental patches
(case-number generation + `create_loan_case`). Base tables, enums, and RLS policies
live only in the Supabase SQL Editor. Producing a real baseline is top priority for
`supabase-architect`.

## Tables referenced in code

| Table | Notes |
|---|---|
| `loan_cases` | Canonical. `case_number` = human key (`ML-YYYY-NNN`). **Planned columns** `nationality`, `income_country`, `employment_type`, `income_structure` — free text, authored in `supabase/migrations/20260722010000_mortgage_rules_engine.sql`, not confirmed run yet. Drive mortgage rule matching; see [../decisions/0006-mortgage-rules-engine.md](../decisions/0006-mortgage-rules-engine.md). |
| `customers` | `full_name`, `phone`, `email`, `ic_number`, `address` |
| `bankers` | `full_name`, `bank_name`, `branch`, `phone`, `email` |
| `documents` | `status`, `created_at`, `verified_at`, FK `loan_case_id`, `document_types`. **Planned columns** `file_name`, `storage_path`, `file_size`, `mime_type`, `uploaded_by_user_id`, `storage_provider` (default `'supabase'`), `document_hash` (nullable, unused), `processing_status` (default `'UPLOADED'`) — authored in `supabase/migrations/20260721010000_document_management_mvp.sql` (additive, `IF NOT EXISTS`), not confirmed run yet. |
| `document_types` | `name`. **Planned columns** `category_id` → `document_categories` (`20260722010000_mortgage_rules_engine.sql`), `ocr_kind` (`nric`\|`salary_slip`\|null — `20260724010000_ocr_document_extraction.sql`). Neither confirmed run yet. Every existing row will have `ocr_kind = null` until a human tags the real NRIC/salary slip types via SQL. |
| `user_profiles` | `auth_user_id → auth.users`, `full_name`, `role` |
| `audit_logs` | Trigger-populated. RLS: `super_admin`-only read today. |
| `case_number_counters` | `year` PK, `last_value`. Zero RLS policies — only reachable via `generate_case_number()`. |
| `mortgage_cases` | **Legacy/duplicate. Never query.** Not scheduled for removal. |
| `document_categories` | **Planned.** `name`, `display_order`, **`is_active`** (Phase 2). Groups `document_types`. Admin UI at `/settings/document-categories` (super_admin only, Phase 2) — deactivate only, no delete. |
| `mortgage_rules` | **Planned.** `rule_name`, `nationality`/`income_country`/`employment_type`/`income_structure` (any nullable = wildcard), `is_active`, plus **`description`, `version`, `effective_from`, `effective_to`** (Phase 2). Matched by `src/lib/mortgage-rules/match-rule.ts`, not SQL — see [0006](../decisions/0006-mortgage-rules-engine.md). Admin UI at `/settings/mortgage-rules` (super_admin only, Phase 2) — **no DELETE policy exists at all; deactivate only**, enforced at the database level. Partial unique index prevents two *active* rules sharing the same profile + version. |
| `mortgage_rule_documents` | **Planned.** Join: `mortgage_rule_id`, `document_type_id`, `required_count` (drives completion), `required_months` (display only), plus **`is_mandatory`, `display_order`, `notes`** (Phase 2). No `category_id` here by design — always derived via `document_type_id → document_types.category_id`, see [0007](../decisions/0007-mortgage-rule-admin.md). |
| `loan_case_required_documents` | **Planned.** Per-case generated checklist. `state` (`active`/`not_required`) is the only stored status — "Completed" vs "Missing" is always computed live against `documents`, never stored. |
| `loan_case_required_document_events` | **Planned.** Append-only audit trail of every add/mark-not-required/reactivate transition, keyed by rule change. |
| `document_extractions` | **Planned.** One row per OCR attempt (`20260724010000_ocr_document_extraction.sql`) — `document_id`, `kind`, `extracted_data` (jsonb, null on failure), `model_name`, `error`, `extracted_by_user_id`. Append-only — every attempt kept, never overwritten. See [0008](../decisions/0008-ocr-and-ai-case-summary.md). |
| `loan_case_timeline_events` | **Planned.** `20260725010000_loan_workflow.sql`. Explicitly-recorded case events (`document_uploaded`, `ocr_completed`, `status_changed`) only — "Customer/Loan Created" and "Checklist Updated" are synthesized at read time, not stored here. Append-only. Visible to any staff role (not `audit_logs`-gated). See [0009](../decisions/0009-loan-processing-workflow.md). |
| `banks` | **Planned.** Sprint 6.3B-1 (Income Knowledge). `name` (unique), `short_code`, `is_active`/`effective_from`/`effective_to` (deactivate-only, no `version` column — a bank is an entity, not a revised policy value). Structured replacement for `loan_cases`/`bankers`' free-text `bank_name`, not yet wired to either. Authored in `supabase/migrations/20260726010000_income_knowledge_schema.sql`. Not confirmed run yet. |
| `bank_products` | **Planned.** Sprint 6.3B-1. `bank_id` (FK → `banks`), `product_name`, `product_code`, `financing_structure` (open vocabulary, no classification scheme asserted), `is_active`/`effective_from`/`effective_to`. Authored in `supabase/migrations/20260726010000_income_knowledge_schema.sql`. Not confirmed run yet. |
| `income_recognition_rules` | **Planned.** Sprint 6.3B-1. Converts a raw income `evidence` fact into a bank/product-scoped recognized figure. `bank_id` (required, never a wildcard), `bank_product_id` (nullable = this bank's default), the same 4 wildcard-if-null borrower-profile columns `mortgage_rules` uses (`nationality`, `income_country`, `employment_type`, `income_structure`), `recognition_method` (`full_value`\|`percentage_haircut`\|`rolling_average`, CHECK-constrained), `haircut_percentage`, `averaging_window_months`, `minimum_history_months`, `version`, `is_active`/`effective_from`/`effective_to`. Matched by `src/lib/income-knowledge/match-income-rule.ts`, not SQL — extends `src/lib/mortgage-rules/match-rule.ts`'s wildcard/most-specific-wins algorithm with `bank_id`/`bank_product_id` scoping. Same partial-unique-active-profile-version index and no-empty-string-wildcard guard as `mortgage_rules`. No real bank policy figures (haircut %, averaging window) are seeded by the migration itself. Authored in `supabase/migrations/20260726010000_income_knowledge_schema.sql`. Not confirmed run yet. |
| `commitment_recognition_rules` | **Planned.** Sprint 6.3B-2 (Commitment Knowledge). The bank-specific treatment applied to a borrower's existing commitment `evidence`, for DSR purposes. `bank_id` (required, never a wildcard), `bank_product_id` (nullable = this bank's default, wildcard/most-specific-wins — same pattern as every other rule table), `commitment_type` (required, exact match, e.g. housing loan / hire purchase / personal loan / credit card / other — open text, not CHECK-constrained, same posture as `income_recognition_rules.income_source_type`), `recognition_method` (open text, e.g. `full_instalment` / `percentage_of_limit` — not CHECK-constrained; unlike `income_recognition_rules.recognition_method`, the DB PRD does not name this a closed set), `recognition_percentage`, `allows_to_be_settled_exclusion` (boolean, default false), `version`, `is_active`/`effective_from`/`effective_to`. **Deliberately has no borrower-profile wildcard columns** (`nationality`/`income_country`/`employment_type`/`income_structure`) — per DB PRD Section 3.5 this table's matching dimensions are only `bank_id`/`bank_product_id`/`commitment_type`, unlike `income_recognition_rules`. Partial unique index (`commitment_recognition_rules_active_profile_version_idx`) scoped to `bank_id`, `bank_product_id`, `commitment_type`, `version` — not a copy of `income_recognition_rules`' 4-column guard, which has no equivalent here. No `no-empty-string-wildcard` CHECK guard either: this table's only nullable matching column is `bank_product_id` (a uuid, no empty-string state), and `commitment_type` is required, not a wildcard. No real bank policy figures (recognition percentage) are seeded by the migration itself. Authored in `supabase/migrations/20260727010000_commitment_knowledge_schema.sql`. Not confirmed run yet. |
| `dsr_rules` | **Planned.** Sprint 6.3B-3 (DSR Rules Knowledge). The DSR formula and threshold for a bank/product. `bank_id` (required, never a wildcard), `bank_product_id` (nullable = this bank's default, wildcard/most-specific-wins — same pattern as every other rule table), `max_dsr_percentage`, `stress_test_rate_buffer_percentage`, `income_tier_lower_bound`/`income_tier_upper_bound`, `description`, `version`, `is_active`/`effective_from`/`effective_to`. **No borrower-profile wildcard columns and no exact-match dimension** — unlike both prior rule tables, this table's third matching dimension (`income_tier_lower_bound`/`income_tier_upper_bound`) is a **half-open numeric range test**, not a wildcard-equality check: a rule matches a given recognized-income figure when `(income_tier_lower_bound IS NULL OR income >= income_tier_lower_bound) AND (income_tier_upper_bound IS NULL OR income < income_tier_upper_bound)` — NULL on either bound means "no restriction on that side," not "wildcard the whole dimension" the way NULL works on every other matching column in this Knowledge Base. Range-matching logic is implemented in `src/lib/dsr-knowledge/match-dsr-rule.ts` — the half-open range test above, written explicitly rather than reusing the equality-wildcard helper `src/lib/mortgage-rules/match-rule.ts`/`src/lib/income-knowledge/match-income-rule.ts`/`src/lib/commitment-knowledge/match-commitment-rule.ts` share; specificity ("fewest wildcards wins") is extended to 3 dimensions (`bankProductId` plus each tier bound being non-null). This is documented inline in the migration and via `COMMENT ON COLUMN` on both bound columns so a future reader does not assume the equality-wildcard convention applies here. Partial unique index (`dsr_rules_active_profile_version_idx`) scoped to `bank_id`, `bank_product_id`, `version` only — **does not catch two active rules with overlapping income-tier ranges for the same bank/product/version** (e.g. `[0, 5000)` and `[3000, 8000)` both active simultaneously); accepted Phase 1 gap, explicitly documented in the migration, mirroring the same NULL-uniqueness accepted-gap precedent `mortgage_rules` already established in Sprint 6.2 Phase 1 ("rule data is human-curated and low-volume... accepted gap for now, not a blocking issue"). No real bank policy figures (`max_dsr_percentage`, `stress_test_rate_buffer_percentage`) are seeded by the migration itself — and, unlike Income/Commitment Knowledge's seed templates, no "safe illustrative" numeric choice exists for this domain either, so the seed template leaves both figures `NULL` and says so explicitly. Authored in `supabase/migrations/20260728010000_dsr_knowledge_schema.sql`. Not confirmed run yet. See [0012](../decisions/0012-dsr-knowledge-implementation.md). |
| `property_rules` | **Planned.** Sprint 6.3B-4 (Property Rules Knowledge). Margin-of-finance, tenure, and eligibility constraints that vary by the property being financed, per bank/product. `bank_id` (required, never a wildcard), `bank_product_id` (nullable = this bank's default, wildcard/most-specific-wins — same pattern as every other rule table), `rule_name`, `property_type`/`construction_status`/`occupancy_intent` (all required, exact-match, never a wildcard — e.g. residential/commercial/land/other, completed/under_construction/progressive_drawdown, owner_occupied/investment — open text, not CHECK-constrained, same posture as `commitment_recognition_rules.commitment_type`), `existing_property_count_min`/`existing_property_count_max`, `margin_of_finance_percentage`, `max_tenure_years`, `description`, `version`, `is_active`/`effective_from`/`effective_to`. **Combines both prior matching shapes**: three required exact-match text dimensions (like `commitment_recognition_rules.commitment_type`) *plus* a numeric-range dimension (like `dsr_rules`' income-tier bounds) — but `existing_property_count_min`/`existing_property_count_max` deliberately use an **INCLUSIVE-INCLUSIVE range**, not `dsr_rules`' half-open convention: a rule matches a given existing-financed-property count when `(existing_property_count_min IS NULL OR count >= existing_property_count_min) AND (existing_property_count_max IS NULL OR count <= existing_property_count_max)`. This is a deliberately different bound convention from `dsr_rules`' half-open income-tier range (`>= lower AND < upper`), documented explicitly in the migration and via `COMMENT ON COLUMN` on both bound columns, because this is a discrete integer count (no fractional value can sit ambiguously on a boundary the way a continuous income figure can) rather than a continuous decimal value — a future reader should not assume both range-typed rule tables in this Knowledge Base share one bound convention. Range-matching logic is a future TypeScript task (`src/lib/property-rules-knowledge/match-property-rule.ts`), not implemented by this migration. Partial unique index (`property_rules_active_profile_version_idx`) scoped to `bank_id`, `bank_product_id`, `property_type`, `construction_status`, `occupancy_intent`, `version` — **does not catch two active rules with overlapping existing-property-count ranges** for an otherwise-identical scope; accepted Phase 1 gap, same precedent as `dsr_rules`' income-tier-overlap gap. No real bank policy figures (`margin_of_finance_percentage`, `max_tenure_years`) are seeded by the migration itself — same "no safe illustrative numeric value exists" posture as `dsr_rules`' seed template. Authored in `supabase/migrations/20260729010000_property_rules_knowledge_schema.sql`. Not confirmed run yet. |
| `evidence` | **Planned.** Sprint 6.3B-1. A normalized fact record decoupled from its origin (OCR, manual entry, customer declaration), the shared input every Derivation Knowledge rule (income and commitment today; property in future sprints) reasons over. `loan_case_id` (FK, cascade delete), `evidence_type`/`source_type` (open vocabulary, not enums), `value` (jsonb), `source_document_id`/`source_extraction_id` (nullable FKs), `captured_by_user_id`, `captured_at`, `superseded_by_evidence_id` (a correction is always a new row pointing forward; the corrected row is never edited). Append-only — no UPDATE/DELETE RLS policy at all. Authored in `supabase/migrations/20260726010000_income_knowledge_schema.sql`. Not confirmed run yet. |
| `derivation_results` | **Planned.** Sprint 6.3B-1. An append-only, computation-time snapshot of one derivation output for a case + `bank_product_id`, referencing the rule row/version that produced it. `domain` (`income_recognition`\|`commitment_recognition`\|`property_rules`\|`dsr`, CHECK-constrained — `income_recognition`, `commitment_recognition` (Sprint 6.3B-2), `dsr` (Sprint 6.3B-3), and `property_rules` (Sprint 6.3B-4) now all have live rule tables), `rule_version` (snapshot copy, kept redundantly so the reasoning chain stays reconstructable without a join), `input_evidence_ids` (jsonb array of `evidence.id`, not a join table — **exception: `domain = 'dsr'` rows always store `[]` here**, since DSR does not consume `evidence` directly; its inputs are other `derivation_results` rows, Income/Commitment Recognition's own outputs, so the lineage is recorded inside `result_value.incomeDerivationResultIds`/`result_value.commitmentDerivationResultIds` instead — see `src/lib/dsr-knowledge/actions.ts` and the `COMMENT ON COLUMN` added to `input_evidence_ids` in `20260728010000_dsr_knowledge_schema.sql`), `result_value` (jsonb), `computed_by_user_id` (nullable — a system recomputation may have no acting user). **`rule_id` is a deliberate non-FK, polymorphic reference** — it conceptually points at whichever domain-specific rule table `domain` names (`income_recognition_rules`, `commitment_recognition_rules`, `dsr_rules`, or, as of Sprint 6.3B-4, `property_rules`), but Postgres cannot express one FK across four tables. This is a considered design choice (documented inline in the migration, mirroring ADR 0006's precedent that rule-matching logic lives in TypeScript, not SQL), not an oversight — validating `rule_id` against `domain` is an application-layer responsibility. Append-only — no UPDATE/DELETE RLS policy at all. Authored in `supabase/migrations/20260726010000_income_knowledge_schema.sql`. Not confirmed run yet. No column or CHECK-constraint change to this table was needed for Sprint 6.3B-2, Sprint 6.3B-3, or Sprint 6.3B-4 — `commitment_recognition`, `dsr`, and `property_rules` were already accepted `domain` values. |

**Confirmed not to exist**: `case_notes`, `follow_ups`, `activity_logs`, `ai_sessions`,
`loan_assessments`, `whatsapp_conversations`.

## Enums

```
loan_stage:      new_enquiry | document_collection | credit_review |
                 bank_submission | approved
loan_status:     new | waiting_document | under_review | ready_to_submit |
                 submitted | approved | rejected
                 (on_hold retired but still a valid legacy value — see
                 STATUS_LABELS in src/lib/loan-cases-data.ts.
                 `documents_pending` renamed to `waiting_document`, `new` and
                 `ready_to_submit` added — 20260725010000_loan_workflow.sql,
                 not confirmed run yet. See
                 ../decisions/0009-loan-processing-workflow.md.)
document_status: pending | verified | rejected
```

## Functions

- `generate_case_number() returns text` — `SECURITY DEFINER`. Backs
  `loan_cases.case_number` default.
- `create_loan_case(...) returns loan_cases` — `SECURITY INVOKER`. See
  [../api/overview.md](../api/overview.md) for the full signature.

## Storage

`loan-documents` bucket — **Planned**, authored in
`supabase/migrations/20260721010000_document_management_mvp.sql`, not confirmed run
yet. Private (not public); 20MB file size limit; `application/pdf`, `image/jpeg`,
`image/png` only (enforced at the bucket level, not just client-side). Objects are
keyed `<loan_case_id>/<uuid>-<file_name>`. See
[../decisions/0005-document-storage-model.md](../decisions/0005-document-storage-model.md).

## RLS policies referenced (definitions not in repo)

`loan_cases_insert_staff`, `loan_cases_select_scope`, `customers_insert_staff`,
`customers_select_staff_or_self`.

`documents_insert_staff`, `documents_delete_staff`, and the `storage.objects`
policies for the `loan-documents` bucket are authored (not confirmed run) in the
`20260721010000_document_management_mvp.sql` migration — see that file for their
exact definitions, since they mirror `loan_cases` visibility via an `EXISTS`
subquery rather than duplicating its logic. The same pattern is used for
`loan_case_required_documents` and `loan_case_required_document_events` in
`20260722010000_mortgage_rules_engine.sql`.

`mortgage_rules`, `mortgage_rule_documents`, and `document_categories` were
read-only for everyone in Phase 1 (zero write policies). Phase 2
(`20260723010000_mortgage_rule_admin.sql`) adds `super_admin`-only
INSERT/UPDATE policies on all three, plus a `super_admin`-only DELETE policy
on `mortgage_rule_documents` only — `mortgage_rules` and `document_categories`
have no DELETE policy at all, by design (deactivate only).

`document_extractions` (`20260724010000_ocr_document_extraction.sql`) follows the
same visibility-via-`EXISTS` pattern, joined through `documents → loan_cases`.
`STAFF_ROLES` can insert; no update/delete policy at all — append-only.

`loan_case_timeline_events` (`20260725010000_loan_workflow.sql`) — same pattern,
`STAFF_ROLES` insert-only, append-only.

`banks`, `bank_products`, `income_recognition_rules` (`20260726020000_income_knowledge_rls.sql`)
— read-only reference/rule data for any authenticated user (`auth.uid() is not null`),
same Phase-1-before-Phase-2 posture `mortgage_rules`/`document_categories` shipped
with. No insert/update/delete policy — writes are a future, separately-approved
admin-surface migration.

`evidence`, `derivation_results` (`20260726020000_income_knowledge_rls.sql`) — same
visibility-via-`EXISTS` pattern re-checking the parent `loan_cases` row, joined via
`loan_case_id`. `STAFF_ROLES` can insert; no update/delete policy at all —
append-only. No DELETE policy on any of the 5 tables above, matching `mortgage_rules`'
"no DELETE RLS policy at all, ever" precedent.

`commitment_recognition_rules` (`20260727020000_commitment_knowledge_rls.sql`) —
same read-only-for-any-authenticated-user posture as `banks`/`bank_products`/
`income_recognition_rules`. No insert/update/delete policy. No changes were made
to `evidence`/`derivation_results` RLS for Sprint 6.3B-2 — both policies already
cover every `domain` value via the same `EXISTS`-against-`loan_cases` pattern,
with no reference to `domain` in either policy definition.

`dsr_rules` (`20260728020000_dsr_knowledge_rls.sql`) — same
read-only-for-any-authenticated-user posture as `banks`/`bank_products`/
`income_recognition_rules`/`commitment_recognition_rules`. No insert/update/delete
policy. No changes were made to `evidence`/`derivation_results` RLS for
Sprint 6.3B-3, for the same reason as Sprint 6.3B-2 — neither policy references
`domain`.

`property_rules` (`20260729020000_property_rules_knowledge_rls.sql`) — same
read-only-for-any-authenticated-user posture as `banks`/`bank_products`/
`income_recognition_rules`/`commitment_recognition_rules`/`dsr_rules`. No
insert/update/delete policy. No changes were made to `evidence`/`derivation_results`
RLS for Sprint 6.3B-4, for the same reason as Sprint 6.3B-2/6.3B-3 — neither
policy references `domain`.

## Roles

`super_admin`, `banker`, `property_agent`, `mortgage_outsource_agent`, `customer`.
`STAFF_ROLES` (can insert loan cases) = all except `customer`.
