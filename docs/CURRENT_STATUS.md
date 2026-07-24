# Current Status

Snapshot as of 2026-07-24. Verified against the repository directly — see
[PROJECT_SUMMARY.md](PROJECT_SUMMARY.md) for narrative context.

## Build Health

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ Clean, including the Sprint 6.3 (Mortgage Knowledge Database) code and Alpha-001 (Mortgage Assessment UI) |
| `npm run lint` | ✅ Clean, including the Sprint 6.3 (Mortgage Knowledge Database) code and Alpha-001 (Mortgage Assessment UI) |
| `npm run build` | ✅ Succeeds, all 12 routes compile — Alpha-001 adds the first new route since Sprint 6.3 began (`/loan-cases/[id]/assessment`); code-complete and `security-reviewer`-passed with no findings, but not yet exercised against a real case (its 5 backing domains have no live tables yet — see the migration row below) |
| Dev server boots | ✅ Verified, zero console errors on unauthenticated pages |
| Original 8 migrations executed against live DB | ✅ **6 of 8 files executed**, in order, confirmed directly by the user in the Supabase SQL Editor. The 2 earliest draft files (`20260716000000_loan_case_creation.sql`, `20260716010000_fix_create_loan_case_rpc.sql`) were superseded by `20260716020000_create_loan_case_rpc.sql` and intentionally never run |
| Sprint 6.3 migrations executed against live DB (Mortgage Knowledge Database — Income, Commitment, DSR Rules, Property Rules, Eligibility Engine) | ❌ **0 of 13 files executed** — 11 schema/RLS/RPC files for the 5 domains, plus 2 later files (a partial-unique-index correction and the AIKIM Standard baseline seed, [decisions/0015](decisions/0015-aikim-standard-baseline-seeding.md)) — all authored, pending human review and execution in the Supabase SQL Editor. Alpha-001 (Mortgage Assessment), the new UI that invokes these 5 domains, is blocked on this same execution before it can be exercised against a real case. |
| Deployed anywhere | ❌ No |
| Pushed to GitHub | ✅ Yes — `main` is up to date with `origin/main` |

## Feature Status

| Feature | Status | Priority | Next Action |
|---|---|---|---|
| Authentication | Implemented | — | None |
| Dashboard (aggregates) | Implemented | P2 | Add status-bucket view (needs product input) |
| Loan Cases (list/detail/create) | Implemented | — | None |
| Global Search | Implemented | — | None |
| Document Upload/Preview/Download/Delete | Implemented | — | None |
| Borrower Profile | Implemented | — | None |
| Mortgage Rules Engine (matching) | Implemented, schema live in DB — zero rule rows | P1 | Seed real rule data (admin UI still frozen; author via SQL in the interim) |
| Mortgage Rule Admin UI | Implemented, **frozen** | — | Resume when unfrozen |
| OCR (NRIC, Salary Slip) | Implemented, unverified on real docs | P0 | Resolve Gemini billing |
| AI Case Summary | Implemented, unverified on real docs | P0 | Resolve Gemini billing |
| Loan Status Pipeline (7 states) | Implemented | — | None |
| Case Timeline | Implemented | — | None |
| Checklist Progress | Implemented | — | None |
| Next Action Card (rule-based) | Implemented | — | None |
| Loan Health Score | Implemented | — | None |
| Bank Rules (bank_name reference data) | Free text, unconstrained | P3 | Consider a real `banks` table (see [TODO.md](TODO.md)) |
| Customers module | Not started | P2 | Scope with product-manager |
| Bankers module | Not started | P2 | Scope with product-manager |
| CRM / Notes / Follow-ups | Not started | P3 | No backing table |
| Dashboard Buckets | Not started | P0 (blocked) | Needs bucket definitions from product |
| WhatsApp document receipt | Not started | P0 (blocked) | Needs provider choice + deployment |
| Document verify/reject workflow | Not started | P2 | — |
| Income Knowledge (Sprint 6.3B-1) | Implemented, no dedicated UI — invocable via the Alpha-001 Mortgage Assessment tab, migrations authored, not executed | — | Awaiting migration execution (human) |
| Commitment Knowledge (Sprint 6.3B-2) | Implemented, no dedicated UI — invocable via the Alpha-001 Mortgage Assessment tab, migrations authored, not executed | — | Awaiting migration execution (human) |
| DSR Rules Knowledge (Sprint 6.3B-3) | Implemented, no dedicated UI — invocable via the Alpha-001 Mortgage Assessment tab, migrations authored, not executed | — | Awaiting migration execution (human) |
| Property Rules Knowledge (Sprint 6.3B-4) | Implemented, no dedicated UI — invocable via the Alpha-001 Mortgage Assessment tab, migrations authored, not executed | — | Awaiting migration execution (human) |
| Eligibility Engine (Sprint 6.3C, `create_eligibility_verdict` RPC) | Implemented, no dedicated UI — invocable via the Alpha-001 Mortgage Assessment tab, migrations authored, not executed | — | Awaiting migration execution (human) |
| Mortgage Assessment / Alpha-001 (`src/lib/mortgage-assessment/actions.ts`, "Assessment" tab on loan case detail) | Implemented, code-complete, `security-reviewer`-passed with no findings — **not yet verified against live data**. Orchestrates the 5 rows above against the "AIKIM Standard"/"Standard Mortgage" baseline; adds zero new business logic | P0 | Awaiting migration execution (human), then a real end-to-end run against a live case |
| AI Recommendation | Not started | — | Last remaining Mortgage Knowledge Database domain; requires a separate CTO/user review before starting |
| Automated tests | Not started | P2 | See [DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md) |
| CI/CD, Deployment | Not started | P1 | See [DEPLOYMENT.md](DEPLOYMENT.md) |
| n8n / Edge Functions / MCP | Not part of project | — | Not planned unless newly requested |

Status legend: **Implemented** (code complete, builds clean), **Not started**,
**Out of scope** (explicitly excluded until approved), **Frozen** (built, paused
by explicit instruction).

## What Is Blocking Production Right Now

1. No real mortgage rule data exists — `mortgage_rules` is schema-only, zero
   rows, so the engine has nothing to match against.
2. Gemini billing tier blocks real OCR/AI Summary usage.
3. No deployment target exists.

Separately, and not a blocker for the Banker MVP itself: the 13 Sprint
6.3-era Mortgage Knowledge Database migrations (Income, Commitment, DSR
Rules, Property Rules, Eligibility Engine, plus a later index correction and
the AIKIM Standard baseline seed) are authored but not executed against the
live database. None of those five domains has a dedicated UI, though
Alpha-001 (Mortgage Assessment, a new "Assessment" tab on the loan case
detail page) now provides a single orchestrating invocation surface for all
five — itself code-complete and security-reviewed but, like the five domains
it calls, not yet exercised against a real case, since it depends on the
same not-yet-executed migrations. The only remaining domain of that PRD's
11-table blueprint, AI Recommendation, has not been started and requires a
separate CTO/user review before it may begin.

See [TODO.md](TODO.md) for the full technical debt list.
