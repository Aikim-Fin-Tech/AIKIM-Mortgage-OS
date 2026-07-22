# AIKIM Mortgage OS — Executive Summary

> Read this first. 5-minute read for a brand-new AI assistant or developer.
> Everything here is verified against the actual repository as of this writing
> (2026-07-26), not reconstructed from memory. See [AI_HANDOVER.md](AI_HANDOVER.md)
> for the condensed context-reset package, and [DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md)
> for how to actually continue work.

## 1. Project Vision

AIKIM Mortgage OS is the single system of record for a mortgage case's lifecycle in
Malaysia — from first enquiry through bank submission to approval — with
real-time, role-scoped visibility for bankers, property agents, and mortgage
outsource agents. It is being built as a **long-term SaaS product, not a demo**:
every feature is treated as compliance-relevant (it handles real customers'
money and regulated personal data — NRIC, income, employment), and every
non-trivial decision is written down so the product can outlive any single
developer or AI session.

Full vision: [docs/product/vision.md](product/vision.md). Longer-horizon,
unscoped direction (customer portal, multi-branch, analytics): [docs/business/product-vision.md](business/product-vision.md).

## 2. Current Progress

**Stack**: Next.js 16.2.10 (App Router, Turbopack), React 19.2.4, Tailwind CSS 4,
Supabase (Postgres + Auth + Storage + PostgREST), Gemini 2.5 Pro (OCR + AI
summary). No separate backend service — Server Actions and Supabase are the
entire backend. Full detail: [ARCHITECTURE.md](ARCHITECTURE.md).

**Git**: single repo, `main` branch, remote
`https://github.com/Aikim-Fin-Tech/AIKIM-Mortgage-OS.git`. Two commits: the
original `create-next-app` scaffold, then one large checkpoint commit
containing everything described in this document. **That checkpoint has not
been pushed to GitHub** — it exists only locally as of this writing. See
[CHANGELOG.md](CHANGELOG.md).

**Database**: **no migration has ever been executed against the live Supabase
database by an AI agent.** Every schema change described in this documentation
set exists only as an authored `.sql` file under `supabase/migrations/`,
waiting for a human to review and run it in the Supabase SQL Editor. This is a
hard project rule, not an oversight — see [DATABASE.md](DATABASE.md) and
`CLAUDE.md`'s Migration Policy.

## 3. Completed Modules (code complete, builds clean; DB migration status varies — see table)

| Module | What it does |
|---|---|
| Auth | Login/logout, session refresh, route protection (`src/proxy.ts`) |
| Dashboard | Live aggregates from `loan_cases`, `documents`, `audit_logs` |
| Loan Cases (list + detail) | Live data, RLS-scoped, atomic creation via `create_loan_case` RPC |
| Global Search | Cases, customers, bankers |
| Document Management | Upload (PDF/JPG/PNG, 20MB), preview, download, delete, Supabase Storage |
| Borrower Profile | 4 fields on Loan Case (nationality, income country, employment type, income structure) |
| Mortgage Rules Engine | Database-driven rule matching (wildcard + most-specific-wins), generates a per-case required-document checklist |
| Mortgage Rule Admin | `super_admin`-only UI to manage rules/documents/categories — **frozen** (paused, not abandoned) |
| OCR | NRIC + salary slip extraction via Gemini 2.5 Pro, behind a swappable `OCRProvider` interface |
| AI Case Summary | Customer/Employment/Income/Missing Docs/Status computed live; AI-generated "next action" on request only |
| Loan Processing Workflow | 7-state status pipeline, case Timeline, Checklist progress, rule-based Next Action card, Loan Health Score (no AI) |

See [DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md) for exact file locations per module.

## 4. Incomplete / Not Started Modules

| Module | Status |
|---|---|
| Customers module (list/detail UI) | Not started |
| Bankers module (management UI) | Not started |
| Case Notes, Follow-ups | Not started — no backing table exists |
| Dashboard status buckets (My Cases/Pending/Waiting Customer/Need Documents/Completed) | Not started — bucket definitions need product input, see [TODO.md](TODO.md) |
| WhatsApp document receipt | Not started — needs a WhatsApp Business API account + public deployment, neither exists |
| Document verify/reject workflow | Not started |
| OCR → stage-transition linkage | Not started |
| DSR calculation, eligibility, bank-product matching, recommendation engine | Explicitly out of scope until approved |
| Automated tests, CI, deployment pipeline | Not started |
| n8n, Edge Functions, MCP integration | **Never part of this project** — no code, no references anywhere in the repo. If a future request mentions these, treat as new scope, not existing work. |

## 5. Current Development State

- **Not deployed anywhere.** No hosting, no CI/CD, no staging environment.
- **No migration has been run.** 8 migration files exist, none executed.
- **No mortgage rule data exists.** The rules engine works, but zero real rules are
  seeded — every case will show "no rule matched" until a `super_admin` authors
  real ones (and that admin UI is currently frozen).
- **OCR is wired but unverified against a real document.** `@google/generative-ai`
  is installed, `GEMINI_API_KEY` is configured, and the pipeline was proven
  end-to-end with synthetic test fixtures — real use is blocked only on the
  Google Cloud project's Gemini billing tier (`gemini-2.5-pro` returned `429
  quota exceeded, limit: 0` on the free tier at last check).
- **`npx tsc --noEmit`, `npm run lint`, `npm run build` are all clean** as of the
  last checkpoint commit.

## 6. Next Steps

In priority order (see [ROADMAP.md](ROADMAP.md) for full phasing):
1. A human confirms/executes the pending migrations against the live database.
2. Resolve Gemini billing so OCR/AI Case Summary work against real documents.
3. Product decisions needed: Dashboard bucket definitions, WhatsApp provider choice
   (see [TODO.md](TODO.md) Open Questions).
4. Real mortgage rule data authored (once the Rule Admin UI is unfrozen).
5. Everything else in [ROADMAP.md](ROADMAP.md) Phase 2 onward.
