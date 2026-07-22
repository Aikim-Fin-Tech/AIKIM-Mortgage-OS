# 0008. OCR (Gemini 2.5 Pro) and AI Case Summary

Status: Proposed (migration authored, not confirmed run; package not yet installed)
Date: 2026-07-24

## Context

MVP Sprint P0 #1 and #2: extract structured fields from NRIC and salary slip
uploads, and show a Case Summary card (Customer, Employment, Income, Missing
Documents, Current Status, Next Action). Product decision: Gemini 2.5 Pro for
both, behind a provider interface so it can be swapped later without touching
the application.

## Decisions

**`OCRProvider` interface** (`src/lib/ocr/types.ts`) is the only thing
application code depends on — `GeminiOCRProvider` is the sole implementation,
instantiated once in `src/lib/ocr/get-ocr-provider.ts`. Swapping providers
later means adding a new class and changing that one factory function.

**Structured output, not free-text parsing.** Gemini's `responseSchema` mode
constrains the model to return exactly the JSON shape asked for
(`NricFields` / `SalarySlipFields`), rather than free text the app then has
to parse and guess at.

**Every OCR attempt is stored, never overwritten.** `document_extractions` is
append-only (no update/delete RLS policy) — a failed attempt and a
successful re-attempt are both permanent rows; the UI reads the most recent
one.

**Only the "Next Action" field is AI-generated.** Customer, Employment,
Income, and Missing Documents are all computed live from real tables
(`getCaseSummaryData`, `src/lib/database/case-summary.ts`) — zero
hallucination risk on facts a banker will act on. Only the one field where an
LLM's judgment genuinely adds value (what to do next) calls Gemini, and only
on request (a button), never automatically, never stored — regenerated fresh
each time so it reflects current data.

**One shared Gemini client** (`src/lib/ai/get-gemini-client.ts`), used by
both `GeminiOCRProvider` and `generateNextAction` — the "read
`GEMINI_API_KEY`, fail loudly if missing" logic exists exactly once.

## Consequences

- Requires `npm install @google/generative-ai` and a real `GEMINI_API_KEY` in
  `.env.local` before any of this can process a real document — neither
  exists in this repo yet (audited before starting: zero AI-related
  dependencies or keys were present). The agent's own settings.json blocks
  installing packages or editing `package.json`, so this is a required human
  step, not an oversight.
- `npx tsc --noEmit` / `npm run build` will fail (module not found) until the
  package is installed — confirmed and isolated to exactly 2 files
  (`get-gemini-client.ts`, `gemini-provider.ts`); no other code is affected.
- `document_types.ocr_kind` (new, nullable) determines which uploaded
  documents get an "Extract Data" action on the Documents tab — set to `null`
  for every existing document type until a human tags the real NRIC/salary
  slip types via SQL (no admin UI for this yet, consistent with
  `document_categories`' Phase 2 posture).

## Evidence

`supabase/migrations/20260724010000_ocr_document_extraction.sql`,
`src/lib/ocr/*.ts`, `src/lib/ai/get-gemini-client.ts`,
`src/lib/case-summary/*.ts`, `src/lib/database/case-summary.ts`,
`src/app/(app)/loan-cases/[id]/documents/actions.ts` (`extractDocumentData`),
`src/app/(app)/loan-cases/[id]/actions.ts` (`generateCaseNextAction`).
