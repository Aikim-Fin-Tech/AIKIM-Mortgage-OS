# Current Status

Snapshot as of 2026-07-24. Verified against the repository directly — see
[PROJECT_SUMMARY.md](PROJECT_SUMMARY.md) for narrative context.

## Build Health

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ Clean, including the Sprint 6.3 (Mortgage Knowledge Database) code |
| `npm run lint` | ✅ Clean, including the Sprint 6.3 (Mortgage Knowledge Database) code |
| `npm run build` | ✅ Succeeds, all 11 routes compile (last verified pre-Sprint-6.3; Sprint 6.3 ships no new routes/UI) |
| Dev server boots | ✅ Verified, zero console errors on unauthenticated pages |
| Original 8 migrations executed against live DB | ✅ **6 of 8 files executed**, in order, confirmed directly by the user in the Supabase SQL Editor. The 2 earliest draft files (`20260716000000_loan_case_creation.sql`, `20260716010000_fix_create_loan_case_rpc.sql`) were superseded by `20260716020000_create_loan_case_rpc.sql` and intentionally never run |
| Sprint 6.3 migrations executed against live DB (Mortgage Knowledge Database — Income, Commitment, DSR Rules, Property Rules, Eligibility Engine) | ❌ **0 of 11 files executed** — all authored, pending human review and execution in the Supabase SQL Editor |
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
| Income Knowledge (Sprint 6.3B-1) | Implemented, backend only — no UI, migrations authored, not executed | — | Awaiting migration execution (human) |
| Commitment Knowledge (Sprint 6.3B-2) | Implemented, backend only — no UI, migrations authored, not executed | — | Awaiting migration execution (human) |
| DSR Rules Knowledge (Sprint 6.3B-3) | Implemented, backend only — no UI, migrations authored, not executed | — | Awaiting migration execution (human) |
| Property Rules Knowledge (Sprint 6.3B-4) | Implemented, backend only — no UI, migrations authored, not executed | — | Awaiting migration execution (human) |
| Eligibility Engine (Sprint 6.3C, `create_eligibility_verdict` RPC) | Implemented, backend only — no UI, migrations authored, not executed | — | Awaiting migration execution (human) |
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

Separately, and not a blocker for the Banker MVP itself: the 11 Sprint 6.3
Mortgage Knowledge Database migrations (Income, Commitment, DSR Rules,
Property Rules, Eligibility Engine) are authored but not executed against
the live database, and none of those five domains have any UI yet. The only
remaining domain of that PRD's 11-table blueprint, AI Recommendation, has
not been started and requires a separate CTO/user review before it may
begin.

See [TODO.md](TODO.md) for the full technical debt list.
