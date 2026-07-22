# Current Status

Snapshot as of 2026-07-26. Verified against the repository directly — see
[PROJECT_SUMMARY.md](PROJECT_SUMMARY.md) for narrative context.

## Build Health

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ Clean |
| `npm run lint` | ✅ Clean |
| `npm run build` | ✅ Succeeds, all 11 routes compile |
| Dev server boots | ✅ Verified, zero console errors on unauthenticated pages |
| Migrations executed against live DB | ✅ **6 of 8 files executed**, in order, confirmed directly by the user in the Supabase SQL Editor. The 2 earliest draft files (`20260716000000_loan_case_creation.sql`, `20260716010000_fix_create_loan_case_rpc.sql`) were superseded by `20260716020000_create_loan_case_rpc.sql` and intentionally never run |
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
| DSR / Eligibility / Recommendation | Out of scope | — | Awaiting explicit approval |
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

See [TODO.md](TODO.md) for the full technical debt list.
