# Database

> **Critical caveat, repeated deliberately**: no migration listed here has been
> executed against the live Supabase database. Every table/column/policy below
> exists only as an authored `.sql` file in `supabase/migrations/`, verified by
> reading those files directly (not by querying a live schema — no live schema
> export exists in this repo). A human must review and run each file in the
> Supabase SQL Editor. See `CLAUDE.md`'s Migration Policy.

Deeper narrative/reasoning for each table lives in the
[ADRs](decisions/README.md) and [docs/architecture/database.md](architecture/database.md)
(the original, more granular version of this file). This document is the
consolidated inventory.

## Tables

| Table | Origin | Purpose |
|---|---|---|
| `loan_cases` | Pre-existing (Sprint 4, uncommitted baseline) + additive columns below | Canonical case record, `case_number` = human key (`ML-YYYY-NNN`) |
| `customers` | Pre-existing | Borrower contact info, `ic_number` always masked in the UI |
| `bankers` | Pre-existing | Bank-side contact per case (not an app user role) |
| `document_types` | Pre-existing + additive columns below | Platform-wide document catalog |
| `user_profiles` | Pre-existing | `auth_user_id → auth.users`, `full_name`, `role` |
| `audit_logs` | Pre-existing | Trigger-populated on `loan_cases` changes; RLS: `super_admin`-only read |
| `case_number_counters` | `20260716000000_loan_case_creation.sql` | Backs `generate_case_number()`; zero RLS policies, `SECURITY DEFINER`-only access |
| `mortgage_cases` | Pre-existing | **Legacy/duplicate table. Never query.** Not scheduled for removal — see [TODO.md](TODO.md) |
| `document_categories` | `20260722010000_mortgage_rules_engine.sql` | Groups `document_types`; `is_active` added in `20260723010000` |
| `mortgage_rules` | `20260722010000_mortgage_rules_engine.sql` | One row per borrower-profile rule; `description`/`version`/`effective_from`/`effective_to` added in `20260723010000` |
| `mortgage_rule_documents` | `20260722010000_mortgage_rules_engine.sql` | A rule's required-document line items; `is_mandatory`/`display_order`/`notes` added in `20260723010000` |
| `loan_case_required_documents` | `20260722010000_mortgage_rules_engine.sql` | Generated per-case checklist |
| `loan_case_required_document_events` | `20260722010000_mortgage_rules_engine.sql` | Append-only audit trail of checklist changes |
| `document_extractions` | `20260724010000_ocr_document_extraction.sql` | One row per OCR attempt, append-only |
| `loan_case_timeline_events` | `20260725010000_loan_workflow.sql` | Explicitly-recorded case events (upload/OCR/status change only — see [WORKFLOW.md](WORKFLOW.md)) |

**Confirmed NOT to exist**: `case_notes`, `follow_ups`, `activity_logs`,
`ai_sessions`, `loan_assessments`, `whatsapp_conversations`.

## Additive Columns (by migration)

| Migration | Table | Columns added |
|---|---|---|
| `20260721010000_document_management_mvp.sql` | `documents` | `file_name`, `storage_path`, `file_size`, `mime_type`, `uploaded_by_user_id`, `storage_provider` (default `'supabase'`), `document_hash` (unused, reserved), `processing_status` (default `'UPLOADED'`) |
| `20260722010000_mortgage_rules_engine.sql` | `loan_cases` | `nationality`, `income_country`, `employment_type`, `income_structure` (free text, wildcard = NULL) |
| `20260722010000_mortgage_rules_engine.sql` | `document_types` | `category_id` → `document_categories` |
| `20260723010000_mortgage_rule_admin.sql` | `mortgage_rules` | `description`, `version`, `effective_from`, `effective_to` |
| `20260723010000_mortgage_rule_admin.sql` | `mortgage_rule_documents` | `is_mandatory`, `display_order`, `notes` |
| `20260723010000_mortgage_rule_admin.sql` | `document_categories` | `is_active` |
| `20260724010000_ocr_document_extraction.sql` | `document_types` | `ocr_kind` (`nric`\|`salary_slip`\|`null`) |

## Enum Changes

`loan_status` (`20260725010000_loan_workflow.sql`):
- `documents_pending` **renamed** to `waiting_document` (existing rows preserved)
- `new`, `ready_to_submit` **added**
- `on_hold` **deliberately not removed** — Postgres cannot cheaply drop an enum
  value, and no live schema check was possible. It remains valid at the DB
  level; the application no longer offers it, and it displays as "Waiting
  Document" for any legacy row (`STATUS_LABELS` in `src/lib/loan-cases-data.ts`).

Current full enum vocabularies:
```
loan_stage:      new_enquiry | document_collection | credit_review |
                 bank_submission | approved
loan_status:     new | waiting_document | under_review | ready_to_submit |
                 submitted | approved | rejected   (+ legacy: on_hold)
document_status: pending | verified | rejected
```

## Storage

One bucket: `loan-documents` (`20260721010000_document_management_mvp.sql`).
Private, 20MB limit, `application/pdf`/`image/jpeg`/`image/png` only (enforced
at the bucket level). Keyed `<loan_case_id>/<uuid>-<file_name>`.

## RLS Policy Inventory

All policies below are authored in the migrations, **not confirmed applied**.
Full policy SQL is in the migration files themselves — this is an index, not a
copy.

| Table/Bucket | select | insert | update | delete |
|---|---|---|---|---|
| `documents` | (pre-existing) | `STAFF_ROLES` | — | `STAFF_ROLES` |
| `storage.objects` (`loan-documents`) | case-visible | `STAFF_ROLES` | — | `STAFF_ROLES` |
| `document_categories` | any authenticated | `super_admin` | `super_admin` | **none** (deactivate only) |
| `mortgage_rules` | any authenticated | `super_admin` | `super_admin` | **none, ever** (deactivate only) |
| `mortgage_rule_documents` | any authenticated | `super_admin` | `super_admin` | `super_admin` |
| `loan_case_required_documents` | case-visible | `STAFF_ROLES` | `STAFF_ROLES` | — |
| `loan_case_required_document_events` | case-visible | `STAFF_ROLES` | — | — (append-only) |
| `document_extractions` | case-visible | `STAFF_ROLES` | — | — (append-only) |
| `loan_case_timeline_events` | case-visible | `STAFF_ROLES` | — | — (append-only) |

"Case-visible" means the policy re-checks the parent `loan_cases` row's own
visibility via an `EXISTS` subquery, rather than duplicating whatever
`loan_cases_select_scope` actually does (that policy's definition is not
committed to this repo either — see the gap below).

**Not committed to this repo, referenced by name only**: `loan_cases_insert_staff`,
`loan_cases_select_scope`, `customers_insert_staff`, `customers_select_staff_or_self`.
These predate this documentation effort and were never exported.

## Migration History

| # | File | Purpose |
|---|---|---|
| 1 | `20260716000000_loan_case_creation.sql` | `case_number_counters`, `generate_case_number()` |
| 2 | `20260716010000_fix_create_loan_case_rpc.sql` | Fixes a PostgREST schema-cache issue on `create_loan_case` |
| 3 | `20260716020000_create_loan_case_rpc.sql` | Recreates `create_loan_case` self-contained (2 was insufficient) |
| 4 | `20260721010000_document_management_mvp.sql` | Document upload/preview/download/delete infrastructure |
| 5 | `20260722010000_mortgage_rules_engine.sql` | Borrower profile fields, mortgage rules schema, generated checklist |
| 6 | `20260723010000_mortgage_rule_admin.sql` | Rule admin UI schema (versioning, effective dates, admin RLS) |
| 7 | `20260724010000_ocr_document_extraction.sql` | OCR kind tagging + extraction results storage |
| 8 | `20260725010000_loan_workflow.sql` | Loan status pipeline expansion + case timeline |

**None of these 8 files have been confirmed run.** Run in order if/when a human
executes them.

## Functions (RPCs)

- `generate_case_number() returns text` — `SECURITY DEFINER` (only exception to
  the invoker-only rule; bypasses RLS solely to reach a table with zero
  policies).
- `create_loan_case(...) returns loan_cases` — `SECURITY INVOKER`, one atomic
  transaction. Full signature: [API_REFERENCE.md](API_REFERENCE.md).

No RPC exists for the Mortgage Rules Engine — that matching logic deliberately
lives in TypeScript. See [RULE_ENGINE.md](RULE_ENGINE.md).

## Roles

`super_admin`, `banker`, `property_agent`, `mortgage_outsource_agent`, `customer`.
`STAFF_ROLES` (can create/modify cases and their related records) = all except
`customer`.

## What's Done vs. TODO

**Done** (authored, code-complete): all 8 migrations above, all RLS policies
listed, all enum changes.

**TODO**: execute the migrations; verify actual live schema matches what's
documented here (no live schema export has ever been pulled); commit a real
baseline schema instead of relying on incremental patches; retire
`mortgage_cases`; tag real `document_types` rows with `ocr_kind`; seed real
`mortgage_rules` data. Full list: [TODO.md](TODO.md).
