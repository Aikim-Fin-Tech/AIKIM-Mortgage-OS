# Roadmap

> Phased plan to production (Phase 1-5): [../ROADMAP.md](../ROADMAP.md).
> Feature-by-feature status table: [../CURRENT_STATUS.md](../CURRENT_STATUS.md).
> This file remains the detailed, sprint-by-sprint build history.

Status legend used across this project's docs: **Implemented** (live in code today,
verified), **Planned** (scoped or a near-term candidate, not built), **Future Vision**
(aspirational, long-horizon, not scoped — see
[../business/product-vision.md](../business/product-vision.md)).

Sprint numbers referenced elsewhere in the code (Sprint 4, 6, 6.5, 9A) are
reconstructed from inline comments — historical breadcrumbs, not a verified log. New
work should get an ADR in [../decisions/](../decisions/) instead of an ad hoc sprint
comment.

## 14-day Banker MVP sprint (current)

Everything else is paused. The only question for new work: "will this help the
first banker use AIKIM in a real loan case?" P0 order:

1. OCR (NRIC, salary slip) — Gemini 2.5 Pro, behind an `OCRProvider` interface. Done,
   verified working end-to-end (synthetic fixtures) pending Gemini billing.
2. AI Case Summary card. Done.
3. ~~Dashboard buckets~~ — superseded by MVP Sprint Day 2's expanded loan status
   pipeline (see below); still not started, still needs product input (Open
   Questions).
4. WhatsApp document receipt (receive + attach only, no chatbot, no automation) —
   **not yet started; provider/scope still needs product input.**
5. **MVP Sprint Day 2 — Complete Loan Processing Workflow**: expanded `loan_status`
   pipeline; case Timeline; Checklist progress card; rule-based Next Action card;
   Loan Health Score (no AI). Done. See below.

## Frozen (paused, not abandoned)

- Sprint 6.2 Phase 2 — Mortgage Rule Admin (`/settings/mortgage-rules`,
  `/settings/document-categories`). Code complete, migration authored, **not
  executed**. See [../decisions/0007-mortgage-rule-admin.md](../decisions/0007-mortgage-rule-admin.md).
- Rule Version UI, further admin enhancements, Advanced Rule Engine work, Event
  History UI — none started beyond what Phase 2 already shipped.
- Mortgage Knowledge Base beyond Income Knowledge: **Commitment Knowledge is not
  started** and requires a separate CTO review before starting — see "Sprint 6.3B-1
  — Income Knowledge Implementation" below. Income Knowledge itself is no longer
  frozen; it has been authored per explicit CTO authorization.

## Implemented

- Auth: login/logout, session refresh, route protection (`src/proxy.ts`).
- Dashboard: live aggregates from `loan_cases`, `documents`, `audit_logs`.
- Loan Cases list + detail: live data, RLS-scoped.
- New Loan Case creation: atomic `create_loan_case()` RPC, Zod-validated, role-gated.
- Global search across cases, customers, bankers.
- **Sprint 6.1 — Document Management MVP**: Documents tab; upload (PDF/JPG/PNG,
  20MB max); list; preview; download; delete. Migration
  (`20260721010000_document_management_mvp.sql`) authored, not confirmed run. See
  [../decisions/0005-document-storage-model.md](../decisions/0005-document-storage-model.md).
- **Sprint 6.2 Phase 1 — Dynamic Mortgage Document Checklist**: borrower profile
  fields on Loan Case; database-driven Mortgage Rules Engine matched by
  `src/lib/mortgage-rules/`; generated, auditable per-case checklist; Required
  Documents section on the Documents tab. Migration
  (`20260722010000_mortgage_rules_engine.sql`) authored, not confirmed run. See
  [../decisions/0006-mortgage-rules-engine.md](../decisions/0006-mortgage-rules-engine.md).
- **MVP Sprint P0 #1/#2 — OCR + AI Case Summary**: `OCRProvider` interface
  (`src/lib/ocr/`), `GeminiOCRProvider` implementation, "Extract Data" action on
  OCR-eligible documents (NRIC, salary slip), append-only `document_extractions`
  history; Case Summary card (Customer/Employment/Income/Missing Documents/Current
  Status computed live, "Next Action" AI-generated on request only). **Blocked**:
  `npm install @google/generative-ai` and a real `GEMINI_API_KEY` have not been
  added yet — `npx tsc --noEmit` / `npm run build` fail until then (isolated to 2
  files). Migration (`20260724010000_ocr_document_extraction.sql`) authored, not
  confirmed run. See
  [../decisions/0008-ocr-and-ai-case-summary.md](../decisions/0008-ocr-and-ai-case-summary.md).
  `@google/generative-ai` is installed and `GEMINI_API_KEY` is configured — verified
  working end-to-end against synthetic test fixtures; real extraction is blocked
  only on the Google Cloud project's Gemini billing tier (`gemini-2.5-pro` returned
  `429 quota exceeded, limit: 0` on the free tier).
- **MVP Sprint Day 2 — Complete Loan Processing Workflow**: `loan_status` expanded
  to `new`/`waiting_document`/`under_review`/`ready_to_submit`/`submitted`/
  `approved`/`rejected` (`on_hold` retired, not removed — see the ADR); a first
  status-change action + `StatusChanger` control on the case header; a merged case
  Timeline (Customer/Loan Created synthesized, Document Uploaded/OCR Completed/
  Status Changed explicitly recorded, Checklist Updated synthesized from Phase 1's
  event table — never `audit_logs`); a Checklist progress card ("N / M Completed");
  a rule-based Next Action card (distinct from the AI Case Summary's AI-generated
  one); a Loan Health Score (equal-weighted, 4 factors, no AI). Migration
  (`20260725010000_loan_workflow.sql`) authored, not confirmed run. See
  [../decisions/0009-loan-processing-workflow.md](../decisions/0009-loan-processing-workflow.md).
- **Sprint 6.3B-1 — Income Knowledge Implementation**: the first implemented slice
  of the Mortgage Knowledge Database blueprint
  ([mortgage-knowledge-database-prd.md](mortgage-knowledge-database-prd.md)). 5 new
  tables (`banks`, `bank_products`, `income_recognition_rules`, `evidence`,
  `derivation_results`) — migrations authored
  (`20260726010000_income_knowledge_schema.sql`,
  `20260726020000_income_knowledge_rls.sql`), **not executed**; a template seed
  (`supabase/seeds/20260726010000_income_knowledge_seed.sql`, placeholder values
  only, lives outside `supabase/migrations/` by design, never auto-run); a new
  `src/lib/income-knowledge/` module (matching algorithm extending
  `src/lib/mortgage-rules/match-rule.ts` with bank/product scoping, plus two
  Zod-validated Server Actions, `recordEvidence` and `computeIncomeRecognition`);
  5 read-only functions in `src/lib/database/income-knowledge.ts`. No UI —
  explicitly out of scope this sprint. See
  [../architecture/database.md](../architecture/database.md) for the 5 tables and
  [../architecture/security.md](../architecture/security.md) for the PII-handling
  decision on recognized income figures.
  **CTO authorization**: the CTO explicitly authorized this specific slice —
  Sprint 6.3B-1, scoped to Income Knowledge only — in conversation, with the
  express condition that Commitment Knowledge requires a separate CTO review
  before it may start. This did not lift approval for the rest of Sprint 6.3B or
  for the database PRD generally; the primary record of this authorization is in
  [mortgage-knowledge-database-prd.md](mortgage-knowledge-database-prd.md)'s
  Status section. Commitment Knowledge is **not started**.

## Planned

- Customers module (list/detail UI).
- Bankers module (management UI).
- Case Notes, Follow-ups — no backing tables exist.
- AI Assistant, Analytics (Sidebar placeholders only — Settings is real, super_admin
  only, but frozen per above).
- Customer-facing views.
- Commit a real schema baseline (see
  [../architecture/database.md](../architecture/database.md)).
- Retire or migrate the legacy `mortgage_cases` table.
- Document verify/reject workflow, and linking "all documents verified" to a stage
  transition (see [../business/mortgage-workflow.md](../business/mortgage-workflow.md)).
- Real mortgage rule data — Phase 2 ships zero seeded rules by design; every case
  shows "no rule matched" until a super_admin authors real ones (once unfrozen).
- Tagging real document_types with `ocr_kind` ('nric'/'salary_slip') — ships with
  every type untagged (null) until a human sets this via SQL.

## Open questions blocking P0 #3 and #4

- Dashboard: what distinguishes "Waiting Customer" from "Need Documents"? The
  latter maps cleanly to the existing Required Documents checklist; the former
  doesn't correspond to anything in the schema yet.
- Dashboard: does "My Cases" scope by `loan_cases.created_by` (the only ownership
  field any code here has ever queried), or does a real `assigned_agent_id` column
  exist live that should be used instead?
- WhatsApp: which provider (Meta Cloud API direct, or a BSP like Twilio/
  360dialog)? Receiving requires a real account and a public HTTPS webhook —
  this project has no deployment yet (see
  [../engineering/release-checklist.md](../engineering/release-checklist.md)).

## Future Vision

Longer-horizon, unscoped direction lives in
[../business/product-vision.md](../business/product-vision.md) — customer portal,
structured bank reference data, multi-branch support, analytics. Not a commitment.

## Explicitly out of scope right now

DSR calculation, eligibility, bank-product matching, recommendation logic, and any
chatbot/automation on WhatsApp remain out of scope until explicitly approved. OCR
and AI Case Summary are now in scope (Gemini 2.5 Pro) per the MVP sprint above —
this is a narrower, explicit exception to the earlier blanket "no AI" boundary, not
a lift of it.
