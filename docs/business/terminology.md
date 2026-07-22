# Terminology

| Term | Meaning |
|---|---|
| Case | A row in `loan_cases`; one mortgage application, keyed by `case_number` |
| Case number | Human-readable case ID, `ML-<year>-<counter>` (e.g. `ML-2026-001`) |
| Stage | Where a case is in underwriting — see `loan_stage` enum |
| Status | The case's current decision state — see `loan_status` enum |
| Banker | Bank-side contact assigned to a case (`bankers` table) — not the app user role |
| Staff | The set of app roles allowed to create cases: `super_admin`, `banker`, `property_agent`, `mortgage_outsource_agent` |
| IC number | Malaysian NRIC — always masked before display, never logged, never searched |
| RLS | Row Level Security — Postgres's per-row authorization, the actual security boundary of this app |
| RPC | A Postgres function called via `supabase.rpc(...)`, used for atomic multi-table writes |
| Audit log | A row in `audit_logs`, written by trigger on `loan_cases` insert/update/delete |
| ADR | Architecture Decision Record — see [../decisions/](../decisions/) |
| Borrower profile | A case's `nationality`/`income_country`/`employment_type`/`income_structure` — drives which documents are required |
| Mortgage rule | A `mortgage_rules` row matching a borrower profile (fields may be wildcard/`null`) to a set of required document types |
| Required document | A row in `loan_case_required_documents` — a document type the matched mortgage rule says this case needs, with a `required_count` of uploads to be "Completed" |
| Not Required | A required-document row whose document type is no longer called for after a profile/rule change — kept, never deleted, so an already-uploaded document's history survives |

Full enum values and role list: [../architecture/database.md](../architecture/database.md).
