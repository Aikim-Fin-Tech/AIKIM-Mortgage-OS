# API Surface

> Consolidated version of this reference: [../API_REFERENCE.md](../API_REFERENCE.md).
> This file remains the detailed source of truth; keep both in sync.

No separate REST/GraphQL API — the app talks to Postgres via Supabase's PostgREST
layer, gated by RLS. The "API" is the set of Server Actions and RPCs below.

## Server Actions

| Action | File | Notes |
|---|---|---|
| `login(prevState, formData)` | `src/app/login/actions.ts` | Email/password only, generic error message |
| `createLoanCase(prevState, formData)` | `src/app/(app)/loan-cases/new/actions.ts` | Zod-validated, calls `create_loan_case` RPC |
| `globalSearch(rawQuery)` | `src/lib/actions/search.ts` | Parameterized `ilike` across cases/customers/bankers, excludes IC number |
| `recordDocumentUpload(caseNumber, input)` | `src/app/(app)/loan-cases/[id]/documents/actions.ts` | Metadata insert only — the file itself is uploaded client-side directly to Storage first. Sprint 6.1. |
| `deleteDocumentAction(caseNumber, documentId)` | `src/app/(app)/loan-cases/[id]/documents/actions.ts` | Removes the Storage object then the `documents` row. Sprint 6.1. |
| `getDocumentSignedUrlAction(caseNumber, documentId, options?)` | `src/app/(app)/loan-cases/[id]/documents/actions.ts` | 60s signed URL; `{ download: true }` sets Content-Disposition: attachment. Sprint 6.1. |
| `updateBorrowerProfile(caseNumber, prevState, formData)` | `src/app/(app)/loan-cases/[id]/actions.ts` | Zod-validated against `borrower-profile-options.ts`; saves the 4 profile fields then calls `generateRequiredDocuments()`. Sprint 6.2 Phase 1. |
| `createRule` / `updateRule(ruleId, ...)` / `setRuleActive(ruleId, isActive)` / `duplicateRuleAction(ruleId)` | `src/app/(app)/settings/mortgage-rules/actions.ts` | `super_admin` only. No delete action exists — `setRuleActive(false)` is the only way to retire a rule. Sprint 6.2 Phase 2. |
| `addRuleDocument` / `updateRuleDocument` / `removeRuleDocument` / `reorderRuleDocuments` | `src/app/(app)/settings/mortgage-rules/actions.ts` | `super_admin` only. Manage one rule's required-document line items. Sprint 6.2 Phase 2. |
| `createCategory` / `updateCategory` / `setCategoryActive` / `reorderCategories` | `src/app/(app)/settings/document-categories/actions.ts` | `super_admin` only. No delete — deactivate only. Sprint 6.2 Phase 2 — **frozen**. |
| `extractDocumentData(caseNumber, documentId)` | `src/app/(app)/loan-cases/[id]/documents/actions.ts` | Downloads the file from Storage, calls `getOCRProvider()`, stores the result as a new `document_extractions` row (every attempt kept). MVP P0. |
| `generateCaseNextAction(caseNumber)` | `src/app/(app)/loan-cases/[id]/actions.ts` | Gathers real case data via `getCaseSummaryData`, asks Gemini for a one-sentence next action. On request only, never stored. MVP P0. |
| `updateLoanCaseStatus(caseNumber, newStatus)` | `src/app/(app)/loan-cases/[id]/actions.ts` | First status-change capability after case creation. Records a `status_changed` timeline event. MVP Sprint Day 2. |

## Postgres RPCs

- `generate_case_number() returns text` — column default for `loan_cases.case_number`,
  not called directly by the app.
- `create_loan_case(p_customer_mode, p_customer_id, p_customer_full_name,
  p_customer_phone, p_customer_email, p_customer_ic_number, p_property_project,
  p_property_address, p_loan_amount, p_bank_name, p_stage, p_status, p_banker_id)
  returns loan_cases` — `SECURITY INVOKER`, one transaction.

No RPC for the Mortgage Rules Engine — the matching algorithm deliberately lives in
TypeScript, not SQL. See
[../decisions/0006-mortgage-rules-engine.md](../decisions/0006-mortgage-rules-engine.md).

## TypeScript services (`src/lib/mortgage-rules/*.ts`)

- `matchMortgageRule(profile, rules)` — pure function, no DB access. Wildcard +
  most-specific-wins matching. Sprint 6.2 Phase 1.
- `generateRequiredDocuments(loanCaseId, profile)` — server-only. Matches a rule,
  reconciles `loan_case_required_documents`, writes
  `loan_case_required_document_events`. Sprint 6.2 Phase 1.
- `PROFILE_DIMENSIONS` (`profile-dimensions.ts`) — declarative list of the
  matching dimensions, iterated by the matcher and both the Borrower Profile and
  admin Rule forms. The extension point for adding a new dimension later — see
  [../decisions/0007-mortgage-rule-admin.md](../decisions/0007-mortgage-rule-admin.md).

## OCR (`src/lib/ocr/*.ts`)

- `OCRProvider` interface (`types.ts`) — the only thing application code depends on.
- `GeminiOCRProvider` (`gemini-provider.ts`) — sole implementation, Gemini 2.5 Pro,
  structured-output mode (`responseSchema`).
- `getOCRProvider()` (`get-ocr-provider.ts`) — the one factory/swap point.
- `getGeminiClient()` (`src/lib/ai/get-gemini-client.ts`) — shared client construction,
  used by both OCR and the AI Case Summary's next-action generation.

See [../decisions/0008-ocr-and-ai-case-summary.md](../decisions/0008-ocr-and-ai-case-summary.md).

## Loan Health Score and Next Action (no AI)

- `calculateLoanHealthScore(factors)` (`src/lib/loan-health/calculate-health-score.ts`)
  — pure function, equal-weighted average of 4 factors, each 0-100.
- `determineNextAction(...)` / `estimateCompletion(status)`
  (`src/lib/next-action/determine-next-action.ts`) — pure, rule-based, deliberately
  distinct from the AI Case Summary's AI-generated next action.

See [../decisions/0009-loan-processing-workflow.md](../decisions/0009-loan-processing-workflow.md).

## Read-only data functions (`src/lib/database/*.ts`)

Never throw; return `{ ..., error }`.

| Function | Backs |
|---|---|
| `getDashboardData()` | `/` |
| `getLoanCases()` | `/loan-cases` |
| `getLoanCaseByCaseNumber(caseNumber)` | available, unused by current pages |
| `getLoanCaseDetails(caseNumber)` | `/loan-cases/[id]` |
| `getNewLoanCaseFormOptions()` | `/loan-cases/new` |
| `getRecentActivity()` | Header notification bell |
| `getCurrentUser()` | `(app)/layout.tsx`, dashboard |
| `getLoanCaseDocuments(caseNumber)` | `/loan-cases/[id]/documents` (Sprint 6.1) |
| `getDocumentTypeOptions()` | `/loan-cases/[id]/documents` upload dialog (Sprint 6.1) |
| `getRequiredDocuments(caseNumber)` | `/loan-cases/[id]/documents` Required Documents section (Sprint 6.2 Phase 1) |
| `getMortgageRulesList()` / `getMortgageRuleDetail(ruleId)` | `/settings/mortgage-rules`, `/settings/mortgage-rules/[ruleId]` (Sprint 6.2 Phase 2) |
| `getDocumentCategoriesList()` / `getDocumentTypesWithCategory()` | `/settings/document-categories`, rule-document picker (Sprint 6.2 Phase 2 — frozen) |
| `getCaseSummaryData(caseNumber)` | Case Summary card on `/loan-cases/[id]` (MVP P0) |
| `getCaseTimeline(caseNumber)` | Timeline card on `/loan-cases/[id]` (MVP Sprint Day 2) |
| `getLoanHealthScore(caseNumber)` | Loan Health Score card on `/loan-cases/[id]` (MVP Sprint Day 2) |

## Conventions for new API surface

- New atomic multi-table mutation → `SECURITY INVOKER` RPC.
- New read → add to `src/lib/database/`, never query Supabase directly from a page.
- Every new Server Action Zod-validates `FormData` before touching the database.
