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
- **Build health**: `npx tsc --noEmit` and `npm run lint` are both clean on
  the full tree, including the Sprint 6.3 (Mortgage Knowledge Database) code
  and Alpha-001 (Mortgage Assessment UI, `npm run build` also clean per
  `security-reviewer`/`qa-engineer` review).
- **Git**: `main` is confirmed **pushed and up to date with `origin/main`**
  (an earlier version of this document wrongly claimed it was unpushed — that
  claim was stale). Commits, oldest to newest: `d54eabf` (Initial Next.js
  project), `6f73121` ("Phase 1 Complete" — the entire Banker MVP feature set
  described in this documentation set), `0f747d6` ("AIKIM Project Memory
  v1.0"), `5db4c99` (Sprint 6.2 production database foundation), `b859e97`
  (Mortgage Knowledge Base PRD/Architecture baseline, Sprint 6.3), `8f43ee5`
  (Mortgage Knowledge Database PRD baseline, Sprint 6.3A), `fa53682` (Income
  Knowledge, Sprint 6.3B-1), `336757d` (Commitment Knowledge, Sprint 6.3B-2),
  `aa238f7` (DSR Rules Knowledge, Sprint 6.3B-3), `7e0bb5c` (Property Rules
  Knowledge, Sprint 6.3B-4), `a644295` (Eligibility Engine, Sprint 6.3C,
  closing Sprint 6.3 — see
  [ADR 0014](decisions/0014-eligibility-engine-implementation.md)). An
  earlier version of this document described that last commit as still
  landing; it has since landed and is corrected here. Two further
  migrations (a partial-unique-index correction and the AIKIM Standard
  baseline seed — [ADR 0015](decisions/0015-aikim-standard-baseline-seeding.md))
  and a new orchestrating feature, **Alpha-001 ("Mortgage Assessment")** —
  see "What's Actually Built" below — have also been authored since
  `a644295`; none of this has a confirmed commit hash as of this
  documentation pass.
- **Database**: **6 of the original 8 authored migrations have been executed
  against the live database**, in order, confirmed directly by the user in the
  Supabase SQL Editor: `create_loan_case_rpc`, `document_management_mvp`,
  `mortgage_rules_engine`, `mortgage_rule_admin`, `ocr_document_extraction`,
  `loan_workflow`. The two earliest draft files (`loan_case_creation`,
  `fix_create_loan_case_rpc`) were superseded and intentionally never run.
  The schema described for those 6 files is now live, but **no real mortgage
  rule data has been seeded yet** (`mortgage_rules` is schema-only, zero
  rows) and `document_types.ocr_kind` has not been set on any actual row.
  Separately, **13 further migrations for the Mortgage Knowledge Database**
  (Sprints 6.3A–6.3C: Income Knowledge, Commitment Knowledge, DSR Rules
  Knowledge, Property Rules Knowledge, Eligibility Engine — 10 new tables plus
  one new RPC, `create_eligibility_verdict`; plus 2 later migrations, a
  partial-unique-index correction and the AIKIM Standard baseline seed —
  [ADR 0015](decisions/0015-aikim-standard-baseline-seeding.md)) have been
  authored and **none have been executed against the live database yet** —
  all pending manual review and execution in the Supabase SQL Editor. A new
  UI, **Alpha-001 ("Mortgage Assessment")**, now exists to invoke all five
  domains together for one loan case (see "What's Actually Built" below),
  but it depends on these same migrations and has not been exercised
  against a real case either.
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

**Mortgage Knowledge Database (Sprints 6.3A–6.3C) — schema authored but not
executed against the live database**: Income Knowledge, Commitment
Knowledge, DSR Rules Knowledge, and Property Rules Knowledge (each a
TypeScript matching/computation module plus one new rule table, reusing
shared `banks`/`bank_products`/`evidence`/`derivation_results` tables
introduced in Sprint 6.3B-1); and the Eligibility Engine (Sprint 6.3C) — the
first Decision Knowledge domain, combining DSR and Property Rules outputs
into a per-case, per-bank-product verdict via a new `SECURITY INVOKER` RPC,
`create_eligibility_verdict` (the second multi-table RPC in this codebase
after `create_loan_case`). See [ADRs 0010–0014](decisions/README.md) and
[mortgage-knowledge-database-prd.md](product/mortgage-knowledge-database-prd.md).
The only remaining domain of this PRD's 11-table blueprint, **AI
Recommendation, has not been started** and requires a separate CTO/user
review before any work begins.

**Alpha-001 ("Mortgage Assessment") — the first UI/invocation surface for
any of the five domains above**: `src/lib/mortgage-assessment/actions.ts`
(`runMortgageAssessment`, an orchestrating Server Action sequencing all 5
domains' already-existing Server Actions in one call — record evidence,
income recognition, commitment recognition, DSR, property rules,
eligibility verdict — for one loan case against the "AIKIM
Standard"/"Standard Mortgage" baseline resolved by name lookup, no picker;
see [ADR 0015](decisions/0015-aikim-standard-baseline-seeding.md)) plus a
new "Assessment" tab on the loan case detail page
(`src/app/(app)/loan-cases/[id]/assessment/page.tsx`,
`src/components/loan-cases/assessment/AssessmentForm.tsx`). Zero new
business logic — pure orchestration reusing every already-implemented
domain function as-is, bailing out and naming the exact failed step on the
first error. Code-complete, `tsc`/`eslint`/`next build` clean,
`security-reviewer`-passed with no findings — **but not yet exercised
against a real case**, since the 13 migrations above (which create every
table these 5 domains and this orchestrator depend on) have not been run
against the live database.

Full module-by-module breakdown: [CURRENT_STATUS.md](CURRENT_STATUS.md) and
[PROJECT_SUMMARY.md](PROJECT_SUMMARY.md).

## ✔ What Is NOT Built — Verify Before Assuming Otherwise

Customers module, Bankers module, Case Notes/Follow-ups, Dashboard status
buckets, WhatsApp integration, document verify/reject workflow, AI
Recommendation (the last domain of the Mortgage Knowledge Database's
11-table blueprint — explicitly not started, gated on a separate CTO/user
review), automated tests, CI/CD, deployment. Income Knowledge, Commitment
Knowledge, DSR Rules Knowledge, Property Rules Knowledge, and the
Eligibility Engine now exist as backend code + authored migrations (see
above), invocable together via the new Alpha-001 Mortgage Assessment tab
(no dedicated UI of their own), and are **not executed against the live
database** — so Alpha-001 itself has not been exercised against a real case
yet either.

**Never previously part of this project at all — treat as entirely new scope
if ever requested**: n8n, Supabase Edge Functions, MCP as a product feature.
(MCP tooling exists only in the Claude Code *development environment* used to
build this project — not in the shipped app.)

Full list with reasoning: [TODO.md](TODO.md).

## ✔ All Important Design Decisions (condensed from 14 ADRs)

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
10. **RPC parameters that reference another table must be scope-validated
    with a real, RLS-subject `SELECT`, never a bare foreign key alone** —
    established via `create_eligibility_verdict` (Sprint 6.3C,
    [ADR 0014](decisions/0014-eligibility-engine-implementation.md)). A
    `SECURITY INVOKER` RPC is directly callable by any authenticated caller,
    not only through its intended TypeScript caller; a foreign key alone only
    proves an id exists *somewhere*, not that it belongs to the specific
    case/product/domain being acted on, since FK checks aren't subject to
    RLS on the referenced table. Scope **every** dimension that matters — a
    closing-review pass on this same RPC found its first-pass fix scoped
    case/product but omitted `domain`, letting a same-case/product,
    wrong-domain id slip through. See
    [docs/architecture/security.md](architecture/security.md).

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
1. ~~Human executes the pending migrations.~~ **Partially done** — 6 of the
   original 8 are executed against the live DB (2 early draft files
   superseded, intentionally not run). **Still pending**: all 13 Sprint
   6.3-era Mortgage Knowledge Database migrations (Income, Commitment, DSR
   Rules, Property Rules, Eligibility Engine, plus the later index-
   correction and AIKIM Standard baseline seed migrations) are authored and
   awaiting human review and execution — this also blocks Alpha-001
   (Mortgage Assessment) from being exercised against a real case.
2. Resolve Gemini billing.
3. Product decisions: Dashboard bucket definitions, WhatsApp provider.
4. Seed real mortgage rule data.
5. Stand up deployment + CI.
6. ~~Push the checkpoint commit.~~ **Done** — `main` is confirmed up to date
   with `origin/main`.
7. Then: Dashboard buckets, WhatsApp receive-and-attach, document
   verify/reject.
8. Explicitly out of scope until separately approved: **AI Recommendation**
   — the last remaining domain of the Mortgage Knowledge Database's
   11-table blueprint. DSR, eligibility, and Income/Commitment/Property
   Rules Knowledge are no longer out of scope — all five have been
   implemented per explicit CTO authorization, and are now also invocable
   together via Alpha-001, the Mortgage Assessment tab (see "What's
   Actually Built" above); see
   [mortgage-knowledge-database-prd.md](product/mortgage-knowledge-database-prd.md).

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
