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

Status: **Done**, builds clean, **not deployed, no migration executed.**

## Phase 2 — Production Readiness (Not Started)

The immediate next work, in the order it's actually unblockable:

1. **Execute migrations** — a human reviews and runs all 8 files in
   `supabase/migrations/` in order, against a real Supabase project.
2. **Resolve Gemini billing** — upgrade the Google Cloud project so
   `gemini-2.5-pro` has real quota; re-verify OCR/AI Summary against an actual
   NRIC and salary slip.
3. **Seed real mortgage rule data** — requires unfreezing the Rule Admin UI,
   or a human authoring rows directly via SQL in the interim.
4. **Tag real `document_types`** with `ocr_kind` so "Extract Data" appears on
   the right uploads.
5. **Product decisions**: Dashboard bucket definitions, WhatsApp provider
   choice (see [TODO.md](TODO.md) Open Questions).
6. **Deployment**: pick a hosting target, stand up CI, see
   [DEPLOYMENT.md](DEPLOYMENT.md).
7. **Push the checkpoint commit** to `origin/main` (currently held locally,
   by design — awaiting explicit approval).

## Phase 3 — Banker MVP Completion (Blocked on Phase 2 decisions)

- Dashboard status-bucket view (My Cases / Pending / Waiting Customer / Need
  Documents / Completed)
- WhatsApp document receipt (receive + attach only — no chatbot, no
  automation), blocked on both a provider decision and Phase 2's deployment
- Document verify/reject workflow
- Linking checklist completion to automatic stage transitions

## Phase 4 — Advanced AI & Screening (Out of Scope Until Approved)

Explicitly excluded from every sprint to date; requires a fresh, explicit
scoping decision before any of this is started:
- DSR (Debt Service Ratio) calculation
- Eligibility screening
- Bank-product matching
- Recommendation engine
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
