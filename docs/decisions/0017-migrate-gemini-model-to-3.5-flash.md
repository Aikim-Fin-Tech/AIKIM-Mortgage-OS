# 0017. Migrate Gemini model from 2.5 Pro to 3.5 Flash

Status: Accepted
Date: 2026-08-20

## Context

[0008](0008-ocr-and-ai-case-summary.md) chose Gemini 2.5 Pro (`gemini-2.5-pro`) for
both OCR (document classification and field extraction, `src/lib/ocr/gemini-provider.ts`)
and the AI Case Summary's "Next Action" suggestion
(`src/lib/case-summary/generate-next-action.ts`). During PD-017 Phase A manual
acceptance testing, the first real (non-mocked) call to Gemini in this
project's history failed — not with the `429 quota exceeded` billing issue
recorded as an open risk in [0008](0008-ocr-and-ai-case-summary.md) and
`docs/TODO.md`, but with an HTTP 404:

> This model models/gemini-2.5-pro is no longer available to new users.
> Please update your code to use models/gemini-3.1-pro-preview for the
> latest features and improvements.

Both call sites hardcoded `gemini-2.5-pro` as an independent `MODEL_NAME`
constant, so the failure was deterministic and affected both features
identically. The error message's suggested replacement,
`gemini-3.1-pro-preview`, was deliberately not adopted — a `-preview` model
carries no production stability/support guarantee, which is the same class
of risk that just caused this outage. `gemini-3.5-flash` was selected
instead as a stable, currently-supported model confirmed (by the user,
against Google's model documentation) to support text, image, PDF, and
structured-output workloads — everything both call sites require.

## Decision

Both `MODEL_NAME` constants now read `gemini-3.5-flash`:
- `src/lib/ocr/gemini-provider.ts`
- `src/lib/case-summary/generate-next-action.ts`

No other runtime behavior changed. The existing `try`/`catch` fallback in
both call sites (classification/extraction failure degrades to `null`,
never blocking the underlying upload or Case Summary render) was already in
place and is unchanged — it is what kept this deprecation from being a
user-facing failure beyond a missing AI field.

Two narrowly-scoped regression tests were added
(`src/lib/ocr/gemini-provider.test.ts`,
`src/lib/case-summary/generate-next-action.test.ts`) that assert the exact
model ID passed to `getGenerativeModel()`, so a future accidental edit or
another provider-side deprecation is caught by the test suite rather than
discovered live.

The `@google/generative-ai` SDK version (0.24.1) was deliberately left
unchanged — this ADR is scoped to the model ID only. Google has since
published a unified `@google/genai` package; migrating to it is a separate,
future consideration, not addressed here.

## Consequences

- Both features (OCR classification/extraction, AI Case Summary next-action)
  now depend on `gemini-3.5-flash` remaining supported. The same deprecation
  risk that caused this migration can recur with any hosted model; the new
  regression tests catch a *code* drift (e.g. one call site edited and not
  the other) but cannot catch Google deprecating `gemini-3.5-flash` itself —
  that only surfaces at runtime, same as this incident did.
- The originally-recorded risk in `docs/TODO.md` and [0008](0008-ocr-and-ai-case-summary.md)
  ("Gemini billing — `gemini-2.5-pro` returns `429 quota exceeded`") is now
  obsolete as stated: the actual blocker encountered was the 404 deprecation
  above, not a billing/quota limit. Both are updated to reflect this.
- `@google/generative-ai` 0.24.1 remains in place; a future SDK migration to
  `@google/genai` is out of scope here and not scheduled.

## Evidence

Clean synthetic end-to-end verification, performed after the model-ID fix
landed, using a fully fictional test document
(`SYNTHETIC_PD017_PAYSLIP.pdf`, no real NRIC/name/contact data) uploaded to
a dedicated synthetic test case (`ML-2026-013`) by a dedicated synthetic
Banker test account — no production customer data was read, displayed, or
touched at any point:

- **Automatic classification: PASS.** Live Gemini call completed with no
  provider error; `document_type_id` was resolved automatically (no manual
  `assign_document_type` RPC call), confirmed via read-only SQL against
  `public.documents`/`public.document_types`.
- **Extraction: PASS.** `extractDocumentData` completed with no provider
  error; exactly one `document_extractions` row was written, confirmed via
  read-only SQL to contain the expected synthetic field values
  (`customerName`, `employerName`, `grossIncome`, `netSalary`,
  `epfEmployeeContribution`, `salaryMonth`).
- Code: `src/lib/ocr/gemini-provider.ts`, `src/lib/case-summary/generate-next-action.ts`,
  `src/lib/ocr/gemini-provider.test.ts`, `src/lib/case-summary/generate-next-action.test.ts`.
- Commits: `a642fd5` (model-ID fix + tests), `f27ff82` (author identity
  correction, no content change), `83f97d8` (stale comment cleanup).
