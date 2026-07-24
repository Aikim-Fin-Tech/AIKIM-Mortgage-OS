# Development Roadmap

Re-planned to Production. This is the forward-looking companion to
[CHANGELOG.md](CHANGELOG.md) (what happened) and [CURRENT_STATUS.md](CURRENT_STATUS.md)
(where things stand right now). Status legend: **Done**, **In Progress**,
**Not Started**, **Blocked**, **Frozen**, **Out of Scope**.

## Phase 1 — Core Platform (Done)

Everything in the single `6f73121` checkpoint commit:
- Auth, Dashboard, Loan Cases (list/detail/create), Global Search
- Document Management (upload/preview/download/delete)
- Borrower Profile + Mortgage Rules Engine + generated checklist
- Mortgage Rule Admin UI (**frozen** immediately after completion — see below)
- OCR (Gemini 2.5 Pro) + AI Case Summary
- Loan Status pipeline (7 states), Case Timeline, Checklist Progress, Next
  Action Card, Loan Health Score

Status: **Done**, builds clean, **not deployed; migrations now executed
against the live DB (see Phase 2, step 1).**

## Phase 2 — Production Readiness (In Progress)

The immediate next work, in the order it's actually unblockable:

1. **Execute migrations** — **Done.** All 6 non-superseded files in
   `supabase/migrations/` were run, in order, against the live Supabase
   project, confirmed directly by the user in the Supabase SQL Editor:
   `20260716020000_create_loan_case_rpc.sql`,
   `20260721010000_document_management_mvp.sql`,
   `20260722010000_mortgage_rules_engine.sql`,
   `20260723010000_mortgage_rule_admin.sql`,
   `20260724010000_ocr_document_extraction.sql`,
   `20260725010000_loan_workflow.sql`. The two earliest draft files
   (`20260716000000_loan_case_creation.sql`,
   `20260716010000_fix_create_loan_case_rpc.sql`) were superseded and
   intentionally never run.
2. **Resolve Gemini billing** — **Not Started, blocked.** Upgrade the Google
   Cloud project so `gemini-2.5-pro` has real quota; re-verify OCR/AI Summary
   against an actual NRIC and salary slip.
3. **Seed real mortgage rule data** — **Not Started, blocked.** The
   `mortgage_rules` schema is live but has zero rows. Requires unfreezing the
   Rule Admin UI, or a human authoring rows directly via SQL in the interim.
4. **Tag real `document_types`** with `ocr_kind` so "Extract Data" appears on
   the right uploads. Not yet done on any row.
5. **Product decisions**: Dashboard bucket definitions, WhatsApp provider
   choice (see [TODO.md](TODO.md) Open Questions).
6. **Deployment**: pick a hosting target, stand up CI, see
   [DEPLOYMENT.md](DEPLOYMENT.md).
7. **Push the checkpoint commit** to `origin/main` — **Done.** `main` is
   confirmed up to date with `origin/main`.

## Phase 3 — Banker MVP Completion (Blocked on Phase 2 decisions)

- Dashboard status-bucket view (My Cases / Pending / Waiting Customer / Need
  Documents / Completed)
- WhatsApp document receipt (receive + attach only — no chatbot, no
  automation), blocked on both a provider decision and Phase 2's deployment
- Document verify/reject workflow
- Linking checklist completion to automatic stage transitions

## Phase 4 — Advanced AI & Screening (Mostly Done; AI Recommendation Still Out of Scope)

Per explicit CTO authorization recorded in
[docs/product/roadmap.md](product/roadmap.md)'s Status section, most of this
phase has since been implemented as the Mortgage Knowledge Database
(Sprints 6.3A–6.3C — schema/RLS/RPC + TypeScript service layers only, no UI,
migrations authored but not executed against the live database):
- Income Knowledge, Commitment Knowledge (bank/product-scoped recognition of
  income and existing commitments)
- DSR (Debt Service Ratio) calculation
- Property Rules Knowledge (margin-of-finance, tenure, property constraints)
- Eligibility screening — the `create_eligibility_verdict` RPC, combining
  DSR and Property Rules outputs into a per-case, per-bank-product verdict

See [docs/product/roadmap.md](product/roadmap.md) for the sprint-by-sprint
detail and [ADRs 0010–0014](decisions/README.md).

Still requires a fresh, explicit CTO/user scoping decision before starting:
- **AI Recommendation** — the last remaining domain of the Mortgage
  Knowledge Database's 11-table blueprint (ranking/recommending bank
  products)
- Additional OCR document templates beyond NRIC/salary slip

## Phase 5 — Scale (Future Vision, Not Scoped)

Longer-horizon, aspirational — see [docs/business/product-vision.md](business/product-vision.md):
- Customer-facing portal (the `customer` role already exists in the schema,
  unused)
- Structured bank reference data (replacing free-text `bank_name`)
- Multi-branch/multi-agency support
- Analytics module
- Customers module, Bankers module (dedicated list/detail UIs)
- Case Notes, Follow-ups (currently permanent UI stubs, no backing table)

## What Is Explicitly Frozen (Not Cancelled)

Sprint 6.2 Phase 2 (Mortgage Rule Admin) — code complete, migration authored,
paused by explicit instruction to prioritize the Banker MVP. Resume when told
to. See [ADR 0007](decisions/0007-mortgage-rule-admin.md).

## What Is Never In Scope Unless Explicitly Requested Fresh

n8n, Supabase Edge Functions, MCP integration into the product itself. None
of these have ever been part of this project's actual implementation —
mentioned in a request does not mean prior art exists.
