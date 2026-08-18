# 0016. Document Screening — Classification vs. Human Assignment, and Confidence/Validation Ownership

Status: Accepted — migrations executed and verified against production; code committed and pushed; not yet wired into any UI or exercised against a real document
Date: 2026-08-07

## Context

Sprint 2 ("Document Screening API v1.0") extends the live OCR pipeline
([0008](0008-ocr-and-ai-case-summary.md)) from 2 document kinds (`nric`,
`salary_slip`) to 6 (adding `bank_statement`, `epf_statement`,
`employment_letter`, `ea_form`), and adds a confidence/validation layer plus
a unified response envelope that doesn't exist today. The CTO's brief is
explicit that this must be an additive extension of the existing
`OCRProvider` abstraction (`src/lib/ocr/types.ts` already documents itself
as designed for exactly this), not a redesign, and explicitly keeps AI
extraction decoupled from mortgage policy (Income/Commitment/DSR/Eligibility
Knowledge Engine tables are out of scope for this sprint).

Two things exist today that the brief's "classify document type" and
"assign confidence scores" steps must reconcile with, verified directly
against the code before this decision was made:

1. **Human assignment already happens at upload time.** `documents.document_type_id`
   is picked by the uploader in `DocumentUploadDialog`; `extractDocumentData`
   (`src/app/(app)/loan-cases/[id]/documents/actions.ts`) derives `kind` from
   `document_types.ocr_kind` on that human-picked type — never from the file
   itself. Nothing today verifies the file actually matches the picked type.
2. **`extractDocumentData`'s current callers only read `.error`.**
   `DocumentsPanel.tsx`'s `handleExtract` calls `extractDocumentData` and
   only branches on `result.error`; the actual extraction result is
   re-fetched separately, fresh, via `getLoanCaseDocuments` →
   `document_extractions` (`src/lib/database/documents.ts`) after
   `router.refresh()`. So `extractDocumentData`'s return shape is not, in
   practice, load-bearing beyond `.error` — but its *behavior* (one row per
   attempt, append-only, `document_extractions` has no UPDATE policy) is.

## Decisions

### 1. Classification is a second, independent Gemini call — not derived from the extraction call

`OCRProvider` gains one new method, `classify(file): Promise<OCRClassificationResult>`,
alongside the existing `extract()`. It is unprimed — it does not know or
assume the human-assigned kind — and asks Gemini to pick one of the 6
supported kinds, or `"unrecognized"`, with a confidence.

**Why not fold this into the extraction call** (e.g. add a
`documentTypeConfidence` field to each kind's extraction schema): the
extraction prompt is deliberately primed ("this is a salary slip, extract
X") so the model can use that context to read the right fields. That same
priming would bias any self-reported "does this look like a salary slip?"
signal inside the same call — the model has already been told what it is.
An independent, unprimed classification call is the only way to get an
honest mismatch signal. This is one extra Gemini call per screening
attempt (2 total), which is an acceptable, clearly-scoped cost, not
complexity — `SCHEMAS`/`PROMPTS` already generalize to "one schema, one
prompt per concern" in `gemini-provider.ts`; classification is a third
concern with its own single (not per-kind) schema/prompt, following the
exact same pattern.

Classification and human assignment are not merged. `extractDocumentData`'s
existing behavior — extraction runs against the human-assigned kind,
because that's the actual field shape being extracted against — is
unchanged. A classification/assignment mismatch becomes a `REVIEW`-worthy
`validation.issues` entry (see Decision 2), never a block on extraction or
persistence.

`classify()`'s own failure (e.g. provider unavailable) must not fail the
whole screening operation or force a `REVIEW`/`FAIL` verdict by itself —
`extraction` quality is still assessed on its own signals; a missing
classification signal simply means no mismatch check runs this attempt.

### 2. AI reports extraction-quality facts; a deterministic TypeScript function decides PASS/REVIEW/FAIL

Confirmed and generalized from the CTO's own "do not let the AI invent
lending rules" principle: the AI never decides a verdict. Two additions
carry this:

- `OCRExtractionResult<K>` gains `confidence: number | null` (0–1,
  self-reported by the model per extraction, sitting alongside `fields`,
  `modelName`, `error` — never mixed into the domain `OCRFieldsFor<K>`
  type). This requires every entry in `gemini-provider.ts`'s `SCHEMAS`
  record to add a sibling `confidence` property (and `required` entry);
  `extract()` destructures `confidence` out of the parsed JSON before
  assigning the rest to `fields`. Applied uniformly across all 6 kinds —
  no kind-specific exception.
- Which fields are missing is **not** a second AI-reported signal — it's
  derived in code by checking the already-nullable `fields` object against
  a per-kind "important fields" list (a plain `Record<OCRDocumentKind, readonly string[]>`
  constant, same shape/spirit as the existing `SCHEMAS`/`PROMPTS` records —
  not a new database-driven rule table, consistent with the sprint's "no new
  rule architecture" non-goal). The extracted fields are already the source
  of truth for what was found (the model is instructed to return `null`
  rather than guess); asking the model to *also* self-report "which fields
  did you find" would create a second, potentially disagreeing source of
  truth for the same fact.

A new pure function, `computeValidation()` (see module layout below), takes
these signals plus `classify()`'s result and the human-assigned
`expectedKind`, and deterministically returns `{ status, confidence, issues }`.
Rules:

- **FAIL**: extraction itself errored (`OCRExtractionResult.error !== null`)
  or `fields === null` — matches the brief's FAIL definition (wrong/corrupt/
  unsupported/unusable), not imperfect confidence.
- **REVIEW** (any of, all additive `issues` entries, never mutually exclusive):
  - extraction `confidence` below a named, tunable threshold
    (`LOW_CONFIDENCE_THRESHOLD`, initial default 0.7 — an implementation
    constant, not an architectural decision, revisit from real data).
  - any "important field" for the kind is `null` in `fields`.
  - `classify()` succeeded, its `predictedKind !== expectedKind`, and its
    own confidence is at least `MISMATCH_MIN_CONFIDENCE` (initial default
    0.6, to avoid flagging a low-confidence guess as a real mismatch).
- **PASS**: none of the above.
- `validation.confidence` = the extraction's self-reported `confidence` when
  present; `0` when `FAIL` was reached via an extraction error (nothing to
  score).

"Unclear page" from the brief's REVIEW definition is intentionally not a
separate signal — it's expected to already manifest as low extraction
confidence; no new "legibility" signal is invented.

### 3. New `src/lib/document-screening/` module; `extractDocumentData` is widened but not restructured

Verified directly against `DocumentsPanel.tsx` and `lib/database/documents.ts`
before deciding (see Context #2): `extractDocumentData`'s return shape isn't
load-bearing for the existing UI. Even so, the lower-risk, more honest split
is:

- **`extractDocumentData` stays exactly as it is** — same signature
  (`{ error: string | null }`), same single-attempt-persist behavior — with
  only `isOcrKind` widened from 2 to 6 kinds (see below for a second
  instance of this guard that also needs widening). This keeps the existing
  Documents-tab "Extract Data" button working, now for all 6 kinds, with
  zero behavior change to its contract.
- **A new `screenDocument` Server Action** in `src/lib/document-screening/`
  orchestrates classify → extract → score → persist → the full response
  envelope, and is the only thing that computes/persists `confidence`,
  `validation_status`, `validation_issues`, `classification_predicted_kind`,
  `classification_confidence`. It is **not** wired into `DocumentsPanel.tsx`
  this sprint — no UI change is in scope, and none was requested.
- `screenDocument` does its **own** document lookup + storage download +
  actor resolution + `document_extractions` insert. It does not call
  `extractDocumentData` internally and then "add" confidence/validation
  afterward — `document_extractions` has no UPDATE policy (append-only, by
  design, per 0008), so a two-step insert-then-patch is not possible; one
  attempt must be one complete insert. This means the lookup/download logic
  is duplicated (a few dozen lines) between `extractDocumentData` and
  `screenDocument` rather than shared via a refactor of the existing,
  shipped Server Action file — a deliberate, small, low-risk duplication,
  consistent with the sprint's explicit "no broad refactoring" non-goal.
  (`backend-engineer` may extract a shared read-only helper — e.g. resolving
  the visible loan case and downloading the file — if it can be done without
  touching `extractDocumentData`'s existing behavior; not required.)
- `screenDocument` is a **Server Action**, not a Next.js Route Handler.
  `src/app/api/` does not exist anywhere in this codebase today, and
  `docs/architecture/overview.md` states "No separate backend/API server" as
  a real architectural fact, not an oversight. The brief's "unified JSON
  response" describes the *shape* of the return value, which a Server
  Action already delivers (structured, serializable data returned to the
  caller) — introducing an HTTP route handler would be a new request
  boundary and a genuine redesign, which the brief forbids. If a future
  external integration genuinely needs an HTTP-callable endpoint, that is a
  distinct, larger decision for `product-manager`/`system-architect` to scope
  separately — flagged here, not decided.

**Two more call sites need the same `isOcrKind` widening**, both found by
reading the actual code, not just the one the brief pointed at:
`extractDocumentData`'s guard in `documents/actions.ts`, and a **second,
separately-defined** `isOcrKind` in `src/lib/database/documents.ts` (used to
build `latestExtraction` for the Documents tab's read path). Missing the
second one would silently break display: extraction would succeed and
insert a row for a new kind, but the Documents tab's "latest extraction"
summary wouldn't show it. Also: `extractDocumentData`'s `kindLabel` ternary
(`kind === "nric" ? "NRIC" : "Salary Slip"`) only handles 2 cases and needs a
proper label map for 6, for its timeline event description.

### Module layout for `backend-engineer`

```
src/lib/ocr/
  types.ts             — extend OCRDocumentKind (6 kinds); add BankStatementFields,
                          EpfStatementFields, EmploymentLetterFields, EaFormFields;
                          extend OCRFieldsFor; add `confidence: number | null` to
                          OCRExtractionResult; add OCRClassificationResult; add
                          `classify()` to the OCRProvider interface.
  gemini-provider.ts   — extend SCHEMAS/PROMPTS to 6 kinds, each schema gains a
                          sibling `confidence` property; add a single (not per-kind)
                          classification Schema/prompt; implement `classify()`.
  get-ocr-provider.ts  — unchanged.

src/lib/document-screening/
  types.ts                 — DocumentScreeningEnvelope, ValidationStatus,
                              ValidationIssue (see shape below).
  important-fields.ts       — IMPORTANT_FIELDS: Record<OCRDocumentKind, readonly string[]>
                              (per-kind, from the CTO brief's exact field lists);
                              LOW_CONFIDENCE_THRESHOLD, MISMATCH_MIN_CONFIDENCE as
                              named, tunable constants.
  compute-validation.ts     — pure function, no I/O: computeValidation(signals) →
                              { status, confidence, issues }. Highest-value unit
                              test target (see Decision 5).
  mask-for-log.ts           — small, local, non-exported-elsewhere helper for
                              masking NRIC/account-like substrings in log/error
                              strings only (see Decision on PII below) — not a
                              shared refactor of the existing private maskIcNumber
                              in lib/database/loan-case-details.ts.
  screen-document.ts         — "use server"; screenDocument(caseNumber, documentId)
                              → Promise<DocumentScreeningEnvelope>. Orchestrates
                              classify + extract (Promise.all, independent calls),
                              computeValidation, its own document_extractions
                              insert, timeline event (reuses the existing
                              "ocr_completed" TimelineEntryType — no new event type
                              needed), revalidatePath.
```

Response envelope shape (`src/lib/document-screening/types.ts`):

```ts
export type ValidationStatus = "PASS" | "REVIEW" | "FAIL";

export type ValidationIssue = {
  code: string;           // "low_extraction_confidence" | "missing_required_field"
                           // | "document_type_mismatch" | "extraction_failed"
  field: string | null;   // specific field name, when applicable
  message: string;        // human-readable, no raw PII
};

export type DocumentScreeningEnvelope<K extends OCRDocumentKind = OCRDocumentKind> = {
  success: boolean;        // false only for an operational failure (not found,
                           // permission denied, storage/provider failure) —
                           // distinct from a "FAIL" validation verdict, which is
                           // success: true (the operation ran) with a bad verdict.
  document: {
    id: string;
    document_type: K;
    classification_confidence: number | null; // null if classify() itself failed
    processing_status: "COMPLETED" | "FAILED"; // FAILED only if extraction couldn't
                           // run at all; independent of validation.status
  } | null;                // null when success is false
  extracted_data: OCRFieldsFor<K> | null;
  validation: {
    status: ValidationStatus;
    confidence: number;
    issues: ValidationIssue[];
  } | null;                // null only when success is false (no attempt was made)
  error: string | null;    // same convention as every other Server Action in this repo
};
```

PII: mortgage documents in scope for this sprint (NRIC, bank statements, EPF
statements) contain NRIC/bank account numbers. `extracted_data` in the
envelope and in `document_extractions.extracted_data` is returned/stored
**unmasked** (same posture as `evidence.value`/`derivation_results.result_value`
for financial figures per `docs/architecture/security.md`'s "PII handling"
section — masking there is reserved for values *displayed* to a viewer, and
`document_extractions` access is already RLS-gated to case-visible staff).
What changes here is **logs**: `screen-document.ts` must never `console.error`
a raw NRIC/account number pulled from `extracted_data` — `mask-for-log.ts`
exists for the (rare) cases where a log line needs to reference an extracted
value at all; prefer logging field *names* and error codes, never values,
matching the existing convention elsewhere in this codebase.

### 4. `document_extractions` new columns

All nullable/additive, no data touched, per the CTO's brief and this repo's
migration policy — a **new** migration file, the live
`20260724010000_ocr_document_extraction.sql` is never edited:

```sql
alter table public.document_extractions
  add column if not exists confidence numeric,
  add column if not exists validation_status text,
  add column if not exists validation_issues jsonb,
  add column if not exists classification_predicted_kind text,
  add column if not exists classification_confidence numeric;

-- confidence, classification_confidence: check (... is null or (... >= 0 and ... <= 1))
-- validation_status: check (... is null or ... in ('PASS','REVIEW','FAIL'))
-- classification_predicted_kind: check (... is null or ... in (<6 kinds>, 'unrecognized'))
-- validation_issues: array of ValidationIssue objects, no default (stays NULL, not '[]'::jsonb)
```

Widen, in the same new migration, the two live CHECK constraints that
currently only allow `nric`/`salary_slip` (both must be dropped and
recreated, per this repo's existing idempotent-migration pattern — never
edit them in place):

- `document_types.document_types_ocr_kind_valid`
- `document_extractions_kind_check` (the inline `check (kind in (...))` on
  `document_extractions.kind`)

Both widened to the 6 kinds: `nric`, `salary_slip`, `bank_statement`,
`epf_statement`, `employment_letter`, `ea_form`.

**Deliberately not added**: a stored "classification matches assignment"
boolean (derivable at read time as `classification_predicted_kind !==
kind`, same "compute live, don't store a derived fact" convention already
used for `loan_case_required_documents`' completion status), and a separate
`document_classifications` table (classification and extraction are 1:1 per
screening attempt — one row is simpler and avoids a join on every read).

**Also needed** (not a schema change, but a data task in the same migration
or a follow-up note): the 4 new document kinds need real `document_types`
rows tagged with the matching `ocr_kind`, the same manual-SQL step 0008
already established for `nric`/`salary_slip` (no admin UI for this exists).
`supabase-architect` should either insert the 4 new rows directly in the
migration or explicitly flag this as a required human follow-up, consistent
with 0008's precedent.

### 5. Test infrastructure: Vitest, confirmed (not a new decision — executing an existing plan)

`docs/engineering/testing-strategy.md` already names Vitest as the
"Planned" candidate runner for this exact reason (Next.js 16 + React 19,
native ESM/TS, no config ceremony). This sprint is the first to actually
need automated tests — `computeValidation()` is a pure function with real
branching logic (FAIL/REVIEW/PASS across multiple signal combinations) that
is cheap and valuable to test in isolation, unlike anything OCR-adjacent
before it (which was all I/O — Gemini calls, Supabase reads — not unit-test
targets). This counts as tooling, not new architecture — no ADR needed for
the runner choice itself, it's already documented as intended.

- Co-located `*.test.ts`, matching this repo's file-organization convention
  (e.g. `src/lib/document-screening/compute-validation.test.ts`).
- Scope for this sprint: `compute-validation.test.ts` only (the pure,
  branching logic). Do not attempt to test `gemini-provider.ts` or
  `screen-document.ts` this sprint — they're I/O-bound (network calls,
  Supabase, storage) and mocking them meaningfully is a larger, separate
  effort not scoped here.
- Requires `npm install -D vitest` and a `"test": "vitest run"` script in
  `package.json` — a required human step (same posture as
  `@google/generative-ai` in 0008; this agent's tools cannot install
  packages or edit `package.json`).
- `documentation-engineer` should update `testing-strategy.md`'s "Current
  reality" section once this actually lands (moves from "Planned" to
  describing the first real test file) — not done as part of this design
  pass.

## Consequences

- Two Gemini calls per screening attempt (classify + extract) instead of
  one — roughly 2x the latency/cost of a single extraction, accepted for an
  honest, unprimed mismatch signal. If this proves too expensive in
  practice, revisit as a follow-up decision (e.g. only classify when the
  human-assigned kind's extraction confidence is itself low) — not decided
  here, would need real usage data.
- `document_extractions` now carries two parallel "quality" concepts
  (`confidence`/`validation_status`/`validation_issues` from `screenDocument`,
  vs. plain `error`-only rows from `extractDocumentData`) on the same table —
  which flow produced a given row is recoverable exactly by whether the new
  columns are `NULL`, with no explicit discriminator column. This is
  intentional (avoids a redundant column) but means any future reader must
  understand this convention rather than reading it off an explicit flag.
- `extractDocumentData` and `screenDocument` duplicate lookup/download logic
  rather than sharing it, a deliberate near-term cost in exchange for zero
  regression risk to the shipped Documents-tab flow this sprint. Revisit if
  a third caller of this logic appears.
- `screenDocument` is unreachable from any UI this sprint — it exists as a
  callable Server Action with a stable, tested-at-the-validation-layer
  contract, ready for a future sprint (UI surfacing, or wiring into a
  broader workflow) without having designed a UI or a policy-engine
  integration prematurely.
- Classification quality (how often Gemini's unprimed guess actually agrees
  with the human-assigned type) becomes an observable, queryable fact via
  `classification_predicted_kind` vs `kind` — useful operational signal for
  a future sprint, not used for anything automated in this one.

## Evidence

To be added once built: `src/lib/ocr/types.ts`, `src/lib/ocr/gemini-provider.ts`,
`src/lib/document-screening/*.ts`,
`supabase/migrations/<new>_document_screening_confidence_validation.sql`.

Verified against, unchanged by this decision: `src/lib/ocr/get-ocr-provider.ts`,
`src/app/(app)/loan-cases/[id]/documents/actions.ts` (`extractDocumentData`,
widened `isOcrKind` only), `src/lib/database/documents.ts` (widened
`isOcrKind` only), `src/components/loan-cases/documents/DocumentsPanel.tsx`
(no change), `supabase/migrations/20260724010000_ocr_document_extraction.sql`
(never edited, only superseded by a new migration).
