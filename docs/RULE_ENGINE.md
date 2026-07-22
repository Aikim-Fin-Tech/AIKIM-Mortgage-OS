# Rule Engine

Technical reference for the Mortgage Rules Engine's matching mechanism.
Business-process view (how this fits into a case's lifecycle): [MORTGAGE_ENGINE.md](MORTGAGE_ENGINE.md).
Design reasoning: [ADR 0006](decisions/0006-mortgage-rules-engine.md) and
[ADR 0007](decisions/0007-mortgage-rule-admin.md).

## Core Principle

**Rule data lives in the database. The matching algorithm lives in
TypeScript.** This was an explicit product decision (overriding the author's
original recommendation of a Postgres RPC) so the engine can be extended later
for OCR-driven/AI-assisted screening without rewriting the matcher out of SQL.
`docs/decisions/0002` still governs: RLS is the real authorization boundary;
this engine is about *what documents are required*, not *who can see what*.

## Data Model

| Table | Role |
|---|---|
| `mortgage_rules` | One row per rule: 4 matching dimensions (any nullable = wildcard), `is_active`, `version`, `effective_from`/`effective_to` |
| `mortgage_rule_documents` | A rule's required-document line items: `document_type_id`, `required_count`, `required_months`, `is_mandatory`, `display_order`, `notes` |
| `document_categories` | Groups `document_types` for display — **not** duplicated onto `mortgage_rule_documents`; always derived via `document_type_id → document_types.category_id` |
| `loan_case_required_documents` | The generated, per-case checklist — `state` (`active`/`not_required`) is the only stored status; "Completed"/"Missing" is always computed live against `documents`, never stored |
| `loan_case_required_document_events` | Append-only audit trail of every checklist change |

Full column-level detail: [DATABASE.md](DATABASE.md).

## Matching Dimensions (the Extension Point)

Declared once, in `src/lib/mortgage-rules/profile-dimensions.ts`:

```ts
PROFILE_DIMENSIONS = [
  { key: "nationality", column: "nationality", label: "Nationality", options: [...] },
  { key: "incomeCountry", column: "income_country", label: "Income Country", options: [...] },
  { key: "employmentType", column: "employment_type", label: "Employment Type", options: [...] },
  { key: "incomeStructure", column: "income_structure", label: "Income Structure", options: [...] },
]
```

`match-rule.ts`, the Borrower Profile form, and the admin Rule form all iterate
over this array — **none of them hardcode the 4 dimensions individually.**

**To add a 5th dimension** (e.g. property type, loan purpose, bank, developer,
first home, loan amount):
1. Add a column to `loan_cases` and `mortgage_rules` (new migration).
2. Add the field to `BorrowerProfile` and `MortgageRule` in
   `src/lib/mortgage-rules/types.ts`.
3. Add one entry to `PROFILE_DIMENSIONS`.

No change to the matcher, the profile form, or the rule form is needed for a
categorical (string-option) dimension. **Known limitation**: this shape
(`options: readonly string[]`) is specific to categorical dimensions. A
genuinely numeric/range dimension (e.g. loan amount) needs its own comparison
mode when it's actually added — flagged in the source file itself.

## Matching Algorithm

Pure function, `src/lib/mortgage-rules/match-rule.ts`, no DB access:

```
matchMortgageRule(profile, rules):
  candidates = rules where every dimension satisfies:
    ruleValue === null (wildcard)  OR  ruleValue === profileValue
  if candidates is empty: return null
  sort candidates by specificity (count of non-null dimensions) descending
  return the first (most specific; ties resolve to whichever rule appears
    first in the input — callers pass rules pre-sorted by updated_at desc,
    so ties resolve to the most recently updated rule)
```

## Checklist Generation & Reconciliation

`generateRequiredDocuments(loanCaseId, profile)` (`src/lib/mortgage-rules/generate-required-documents.ts`),
called after the Borrower Profile form saves:

1. Fetch active `mortgage_rules`, run `matchMortgageRule`.
2. If matched, fetch that rule's `mortgage_rule_documents`.
3. Reconcile against the case's existing `loan_case_required_documents`:
   - New requirement → insert (`state: 'active'`), log `added` event.
   - Previously `not_required`, now required again → flip to `active`, log
     `reactivated` event.
   - Currently `active`, no longer required (or no rule matched at all) →
     flip to `not_required`, log `marked_not_required` event. **Never
     deleted** — an uploaded document's history survives.
4. Every transition is written to `loan_case_required_document_events`.

**Not atomic** — this is multiple sequential Supabase calls, not one DB
transaction (a real trade-off of keeping the logic in TypeScript rather than a
`SECURITY INVOKER` RPC). Every step is idempotent, so re-saving the profile
self-heals any partial failure.

## Completion Calculation

Never stored. Computed live at read time
(`src/lib/database/required-documents.ts`):
```
uploadedCount = count(documents where document_type_id matches, for this case)
status = state === 'not_required' ? 'not_required'
       : uploadedCount >= requiredCount ? 'completed'
       : 'missing'
```

## Validation Rules (Rule Admin)

- `required_count >= 1` (CHECK constraint)
- `required_months >= 1` if supplied (CHECK constraint)
- `effective_to >= effective_from` if both supplied (CHECK constraint)
- No duplicate *active* rule sharing the same exact profile + version (partial
  unique index, NULL-safe via `COALESCE`)
- **No hard delete of a `mortgage_rules` row, ever** — no DELETE RLS policy
  exists at all. Deactivate only.

## What's Done vs. TODO

**Done**: matching algorithm, checklist generation/reconciliation, admin UI
(list/create/edit/duplicate/activate-deactivate, rule-document
add/edit/remove/reorder, category management, live preview).

**TODO**: seed real rule data (zero rules exist); tag real `document_types`
rows with `ocr_kind`; the admin UI is currently **frozen** (built, paused by
explicit instruction, not abandoned — see [ROADMAP.md](ROADMAP.md)).
