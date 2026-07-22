# AI Handover — Context Reset Package

**Read this file first, before any other file in this repository.** It is
written so that a brand-new AI assistant (Claude, GPT, Gemini, or otherwise)
can continue development on AIKIM Mortgage OS without reading any prior
conversation. Everything here was verified against the actual repository, not
reconstructed from memory. If anything here ever conflicts with the live
code or database, **the live code/database wins** — this documentation set
has never been checked against a real Supabase schema export.

---

## ✔ What This Project Is

AIKIM Mortgage OS — the single system of record for a mortgage case's
lifecycle in Malaysia, for bankers, property agents, and mortgage outsource
agents. Long-term SaaS product, not a demo: handles real money and regulated
PII (NRIC, income). Full vision: [docs/product/vision.md](product/vision.md).
5-minute overview: [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md).

## ✔ Current System State

- **Stack**: Next.js 16.2.10 (App Router, Turbopack — has breaking changes
  from typical training data, read root `AGENTS.md` before writing framework
  code), React 19.2.4, Tailwind CSS 4, Supabase (Postgres/Auth/Storage/
  PostgREST), Gemini 2.5 Pro.
- **Build health**: `npx tsc --noEmit`, `npm run lint`, `npm run build` all
  clean as of the last checkpoint.
- **Git**: `main` is confirmed **pushed and up to date with `origin/main`**
  (an earlier version of this document wrongly claimed it was unpushed — that
  claim was stale). Commits include `6f73121` ("Phase 1 Complete"), which
  contains the entire product described in this documentation set, and
  `0f747d6` ("AIKIM Project Memory v1.0").
- **Database**: **6 of 8 authored migrations have been executed against the
  live database**, in order, confirmed directly by the user in the Supabase
  SQL Editor: `create_loan_case_rpc`, `document_management_mvp`,
  `mortgage_rules_engine`, `mortgage_rule_admin`, `ocr_document_extraction`,
  `loan_workflow`. The two earliest draft files (`loan_case_creation`,
  `fix_create_loan_case_rpc`) were superseded and intentionally never run.
  The schema described in this documentation is now live, but **no real
  mortgage rule data has been seeded yet** (`mortgage_rules` is schema-only,
  zero rows) and `document_types.ocr_kind` has not been set on any actual
  row.
- **Deployment**: none. Not hosted anywhere.
- **AI (Gemini)**: package installed, API key configured, pipeline verified
  end-to-end with synthetic test fixtures — but blocked on Gemini billing for
  real documents (`429 quota exceeded, limit: 0` on `gemini-2.5-pro`).

Full detail: [CURRENT_STATUS.md](CURRENT_STATUS.md).

## ✔ What's Actually Built

Auth, Dashboard, Loan Cases (list/detail/create), Global Search, Document
Management (upload/preview/download/delete), Borrower Profile, Mortgage Rules
Engine (database-driven matching, generates a required-document checklist),
Mortgage Rule Admin UI (**frozen** — built, working, explicitly paused, not
abandoned), OCR (NRIC + salary slip via Gemini, behind a swappable
`OCRProvider` interface), AI Case Summary (facts computed live, only the
"next action" field is AI-generated, on request only), Loan Status pipeline
(7 states), Case Timeline, Checklist Progress, rule-based Next Action Card,
Loan Health Score (no AI).

Full module-by-module breakdown: [CURRENT_STATUS.md](CURRENT_STATUS.md) and
[PROJECT_SUMMARY.md](PROJECT_SUMMARY.md).

## ✔ What Is NOT Built — Verify Before Assuming Otherwise

Customers module, Bankers module, Case Notes/Follow-ups, Dashboard status
buckets, WhatsApp integration, document verify/reject workflow, DSR/
eligibility/recommendation logic, automated tests, CI/CD, deployment.

**Never previously part of this project at all — treat as entirely new scope
if ever requested**: n8n, Supabase Edge Functions, MCP as a product feature.
(MCP tooling exists only in the Claude Code *development environment* used to
build this project — not in the shipped app.)

Full list with reasoning: [TODO.md](TODO.md).

## ✔ All Important Design Decisions (condensed from 9 ADRs)

Full reasoning for each: [docs/decisions/](decisions/README.md).

1. **Supabase is the entire backend** — no separate API server.
2. **RLS is the sole authorization boundary** — any app-level role check is a
   UX convenience only, never a substitute.
3. **Next.js 16's `proxy.ts`** (not `middleware.ts`) refreshes sessions and
   gates every route.
4. **Multi-table atomic writes use a `SECURITY INVOKER` Postgres RPC**
   (`create_loan_case` is the reference pattern) — except the Rule Engine
   (see #6).
5. **Documents live in Supabase Storage**, metadata in `public.documents`,
   access via short-lived signed URLs, never permanent public links.
6. **The Mortgage Rules Engine's matching algorithm is TypeScript, not SQL**
   — an explicit exception to #4, made so it can be extended for future
   AI-assisted screening without a rewrite. Rule *data* is still 100%
   database-driven.
7. **No hard delete of a `mortgage_rules` row, ever** — deactivate only, no
   DELETE RLS policy exists. Category is always derived from
   `document_types.category_id`, never duplicated.
8. **OCR/AI use Gemini 2.5 Pro** behind an `OCRProvider` interface so the
   provider can be swapped later without touching application code. Only
   OCR and one summary field are AI — everything else (health score, next
   action, rule matching) is deterministic.
9. **Case timeline is a new table, not `audit_logs`** (which is
   `super_admin`-only by RLS and must not gate a banker-facing view).
   `on_hold` was kept in the `loan_status` enum (not removed — Postgres can't
   cheaply drop an enum value) but retired from the application.

## ✔ Things You Must Never Do

- Execute a migration. Ever. Author the `.sql` file, stop, wait for a human.
- Put a `service_role` key anywhere in application code.
- Invent a table/column/enum/RPC that isn't verified in [DATABASE.md](DATABASE.md)
  or the actual migration files.
- Present mock data as if it were live.
- Run `npm install` or edit `package.json` yourself if operating as an agent
  under this repo's `.claude/settings.json` (it blocks this deliberately) —
  ask the user.
- Handle API keys/secrets on the user's behalf — ask them to add to
  `.env.local`.
- Assume n8n/Edge Functions/MCP/WhatsApp/testing/CI exist just because a
  request mentions them.

## ✔ Next Phase Goals

In order (full detail: [ROADMAP.md](ROADMAP.md)):
1. ~~Human executes the pending migrations.~~ **Done** — 6 of 8 executed
   against the live DB (2 early draft files superseded, intentionally not
   run).
2. Resolve Gemini billing.
3. Product decisions: Dashboard bucket definitions, WhatsApp provider.
4. Seed real mortgage rule data.
5. Stand up deployment + CI.
6. ~~Push the checkpoint commit.~~ **Done** — `main` is confirmed up to date
   with `origin/main`.
7. Then: Dashboard buckets, WhatsApp receive-and-attach, document
   verify/reject.
8. Explicitly out of scope until separately approved: DSR, eligibility,
   bank-product matching, recommendation engine.

## ✔ Where Everything Else Lives

| Topic | File |
|---|---|
| Full architecture | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Full database inventory | [DATABASE.md](DATABASE.md) |
| AI/OCR mechanics + exact prompts | [AI_ENGINE.md](AI_ENGINE.md), [PROMPTS.md](PROMPTS.md) |
| Mortgage rule matching internals | [RULE_ENGINE.md](RULE_ENGINE.md) |
| Business-process view of a case | [MORTGAGE_ENGINE.md](MORTGAGE_ENGINE.md) |
| Case timeline mechanics | [WORKFLOW.md](WORKFLOW.md) |
| Full Server Action / RPC / read-function list | [API_REFERENCE.md](API_REFERENCE.md) |
| Deployment status/checklist | [DEPLOYMENT.md](DEPLOYMENT.md) |
| All technical debt | [TODO.md](TODO.md) |
| Commit/migration history | [CHANGELOG.md](CHANGELOG.md) |
| Phased plan to production | [ROADMAP.md](ROADMAP.md) |
| How to actually work on this repo | [DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md) |
| Documentation index (every file, one line each) | [README.md](README.md) |

This package is intentionally the only file you need to read to get oriented.
Everything else is depth, not new context.
