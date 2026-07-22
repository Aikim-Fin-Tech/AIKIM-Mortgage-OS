# API Reference

No separate REST/GraphQL API — the app talks to Postgres via Supabase's
PostgREST layer, gated by RLS. The "API" is the set of Server Actions, RPCs,
and read functions below. Verified directly against source as of this
writing. Convention detail: [docs/api/overview.md](api/overview.md) (the
original, still-maintained version of this reference).

## Server Actions

| Action | File | Notes |
|---|---|---|
| `login(prevState, formData)` | `src/app/login/actions.ts` | Email/password only, generic error message |
| `createLoanCase(prevState, formData)` | `src/app/(app)/loan-cases/new/actions.ts` | Zod-validated, calls `create_loan_case` RPC |
| `globalSearch(rawQuery)` | `src/lib/actions/search.ts` | Parameterized `ilike` across cases/customers/bankers, excludes IC number |
| `recordDocumentUpload(caseNumber, input)` | `.../loan-cases/[id]/documents/actions.ts` | Metadata insert only — file already uploaded client-side directly to Storage |
| `deleteDocumentAction(caseNumber, documentId)` | `.../loan-cases/[id]/documents/actions.ts` | Removes the Storage object then the `documents` row |
| `getDocumentSignedUrlAction(caseNumber, documentId, options?)` | `.../loan-cases/[id]/documents/actions.ts` | 60s signed URL; `{download:true}` sets Content-Disposition: attachment |
| `extractDocumentData(caseNumber, documentId)` | `.../loan-cases/[id]/documents/actions.ts` | Runs OCR via `getOCRProvider()`, stores a new `document_extractions` row |
| `updateBorrowerProfile(caseNumber, prevState, formData)` | `.../loan-cases/[id]/actions.ts` | Saves the 4 profile fields, then calls `generateRequiredDocuments()` |
| `generateCaseNextAction(caseNumber)` | `.../loan-cases/[id]/actions.ts` | Gemini call for the AI Case Summary's next-action text; on request only, never stored |
| `updateLoanCaseStatus(caseNumber, newStatus)` | `.../loan-cases/[id]/actions.ts` | First status-change capability; records a `status_changed` timeline event |
| `createRule` / `updateRule(ruleId,...)` / `setRuleActive(ruleId, isActive)` / `duplicateRuleAction(ruleId)` | `.../settings/mortgage-rules/actions.ts` | `super_admin` only. No delete action — `setRuleActive(false)` only |
| `addRuleDocument` / `updateRuleDocument` / `removeRuleDocument` / `reorderRuleDocuments` | `.../settings/mortgage-rules/actions.ts` | `super_admin` only |
| `createCategory` / `updateCategory` / `setCategoryActive` / `reorderCategories` | `.../settings/document-categories/actions.ts` | `super_admin` only, no delete |

All Server Actions re-derive the caller's identity/role server-side
(`getCurrentUser()` / `auth.getUser()`) — never trust a role, user id, or
`loan_case_id` passed from the client. RLS is the real enforcement; app-level
role checks are a friendlier-error convenience only.

## Postgres RPCs

- `generate_case_number() returns text` — `SECURITY DEFINER`, column default
  for `loan_cases.case_number`, not called directly by the app.
- `create_loan_case(p_customer_mode, p_customer_id, p_customer_full_name,
  p_customer_phone, p_customer_email, p_customer_ic_number,
  p_property_project, p_property_address, p_loan_amount, p_bank_name,
  p_stage, p_status, p_banker_id) returns loan_cases` — `SECURITY INVOKER`,
  one atomic transaction.

No RPC exists for the Mortgage Rules Engine — see [RULE_ENGINE.md](RULE_ENGINE.md).

## TypeScript Services (non-database business logic)

| Function | File | Purpose |
|---|---|---|
| `matchMortgageRule(profile, rules)` | `src/lib/mortgage-rules/match-rule.ts` | Pure, no DB access |
| `generateRequiredDocuments(loanCaseId, profile)` | `src/lib/mortgage-rules/generate-required-documents.ts` | Server-only, reconciles the checklist |
| `PROFILE_DIMENSIONS` | `src/lib/mortgage-rules/profile-dimensions.ts` | Declarative dimension list — the Rule Engine's extension point |
| `GeminiOCRProvider.extract()` | `src/lib/ocr/gemini-provider.ts` | Via `OCRProvider` interface |
| `getOCRProvider()` | `src/lib/ocr/get-ocr-provider.ts` | The provider swap point |
| `getGeminiClient()` | `src/lib/ai/get-gemini-client.ts` | Shared Gemini client construction |
| `generateNextAction(data)` | `src/lib/case-summary/generate-next-action.ts` | AI Case Summary's next-action text |
| `calculateLoanHealthScore(factors)` | `src/lib/loan-health/calculate-health-score.ts` | Pure, no AI |
| `determineNextAction(...)` / `estimateCompletion(status)` | `src/lib/next-action/determine-next-action.ts` | Pure, rule-based, no AI |
| `recordTimelineEvent(...)` | `src/lib/timeline/record-timeline-event.ts` | Server-only |

## Read-Only Data Functions (`src/lib/database/*.ts`)

Never throw; every function returns `{ ..., error }`.

| Function | Backs |
|---|---|
| `getDashboardData()` | `/` |
| `getLoanCases()` | `/loan-cases` |
| `getLoanCaseByCaseNumber(caseNumber)` | Available, unused by current pages |
| `getLoanCaseDetails(caseNumber)` | `/loan-cases/[id]` |
| `getNewLoanCaseFormOptions()` | `/loan-cases/new` |
| `getRecentActivity()` | Header notification bell |
| `getCurrentUser()` | `(app)/layout.tsx`, dashboard |
| `getLoanCaseDocuments(caseNumber)` | `/loan-cases/[id]/documents` |
| `getDocumentTypeOptions()` | Upload dialog |
| `getRequiredDocuments(caseNumber)` | Required Documents section + Checklist Progress card |
| `getMortgageRulesList()` / `getMortgageRuleDetail(ruleId)` | `/settings/mortgage-rules` (frozen) |
| `getDocumentCategoriesList()` / `getDocumentTypesWithCategory()` | `/settings/document-categories` (frozen), rule-document picker |
| `getCaseSummaryData(caseNumber)` | Case Summary card |
| `getCaseTimeline(caseNumber)` | Timeline card |
| `getLoanHealthScore(caseNumber)` | Loan Health Score card |

## Conventions for New API Surface

- New atomic multi-table mutation → a `SECURITY INVOKER` Postgres RPC (the
  established exception is the Rule Engine's matcher, which is TypeScript by
  explicit product decision — don't generalize from that one exception).
- New read → add to `src/lib/database/`, never query Supabase directly from a
  page or component.
- Every new Server Action Zod-validates `FormData` before touching the
  database.
- Never trust the client for role, user id, or foreign-key ownership fields —
  always re-derive server-side.
