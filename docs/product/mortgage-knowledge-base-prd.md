# Mortgage Knowledge Base — Product Requirements Document

Status: **Draft — scoping/design only. Awaiting CTO approval before any
implementation begins.**
Date: 2026-07-22
Author: product-manager (Sprint 6.3 scoping exercise)

Related: [Mortgage Knowledge Base — Technical & Architectural Design](mortgage-knowledge-architecture.md)
(Sprint 6.3 Day 2 — goes one level deeper into taxonomy, the Bank/Product
Knowledge layers, and an Explainable AI architecture for the models below).

> This document is a conceptual/data-model design, one level above
> implementation. It contains **no SQL, no migration files, no code, no UI
> mockups or wireframes**. It defines what 9 models mean, what they contain
> conceptually, how they relate to each other, and where they sit in a
> pipeline — nothing here is an instruction to build anything.

## Why this document exists

"Mortgage Knowledge Base" has been named but never designed — it sits in
[roadmap.md](roadmap.md)'s Frozen section alongside Rule Version UI, further
admin enhancements, Advanced Rule Engine work, and Event History UI, none of
which have started beyond what Sprint 6.2 Phase 2 already shipped.

It also overlaps heavily with what [../ROADMAP.md](../ROADMAP.md) calls
**Phase 4 — Advanced AI & Screening**: DSR calculation, eligibility
screening, bank-product matching, and a recommendation engine — all
explicitly gated on "a fresh, explicit scoping decision before any of this is
started." This document **is** that scoping decision being initiated, at the
CTO's request. It does not lift the Phase 4 gate; it is the artifact the gate
requires before the gate can even be considered for lifting.

Nothing in this document authorizes writing a migration, a line of
TypeScript, or a UI screen. See "Status" at the end.

## Grounding: what exists today

This PRD does not invent a system from nothing. Three of the nine models
already have a real, partial existence in the live product; the other six do
not exist in any form.

| Model | Today | This PRD |
|---|---|---|
| Borrower Profile | 4 free-text columns on `loan_cases` (`nationality`, `income_country`, `employment_type`, `income_structure`), app-layer-validated vocabulary, no DB enum/lookup table. Drives only the Required Documents match. | Describes how this narrow, qualitative profile would need to evolve to also serve as an input to Income Recognition, DSR, and Eligibility — without assuming that evolution is approved. |
| Required Documents | **Live, production schema, migrations executed.** `mortgage_rules` → `mortgage_rule_documents` → `loan_case_required_documents`, matched by the TypeScript matcher in `src/lib/mortgage-rules/` (wildcard/most-specific-wins). See [0006](../decisions/0006-mortgage-rules-engine.md). | Describes its place in the wider pipeline and where it would need to change (e.g. becoming bank-scoped) if the other 8 models are ever built. |
| Bank Policy | No `banks` table. `bank_name` is unconstrained free text on `loan_cases` and `bankers`, with a hardcoded UI picker list (`src/lib/loan-cases-data.ts`) that enforces nothing. Already flagged as a known gap in [../business/bank-rules.md](../business/bank-rules.md) and as unscoped Future Vision in [../business/product-vision.md](../business/product-vision.md). | Treats a structured Bank Policy model as a **precondition**, not new scope invented by this PRD — every bank-specific model below (Income Recognition, DSR Rules, Property Rules, Bank Matching) is meaningless without it. |
| Income Recognition | Does not exist. OCR extracts raw `basicSalary`/`netSalary` numbers from a salary slip (see `src/lib/ocr/types.ts`); nothing converts that into a "recognized" income figure. | New model, designed from first principles. |
| Commitment Recognition | Does not exist. No commitment/liability data is captured anywhere in the schema today. | New model, designed from first principles. |
| DSR Rules | Does not exist. | New model, designed from first principles. |
| Property Rules | Does not exist. `loan_cases` has `loan_amount` and `bank_name`; no property type, construction status, or occupancy fields exist. | New model, designed from first principles. |
| Eligibility Engine | Does not exist. | New model, designed from first principles. |
| AI Recommendation | Does not exist as a distinct model. The project's only AI feature today is Gemini OCR extraction plus one on-request, never-stored, AI-generated "Next Action" summary field — a deliberate, narrow exception to a "no AI by default" posture (see [0008](../decisions/0008-ocr-and-ai-case-summary.md)). | New model, explicitly designed to extend that precedent rather than replace it. |

None of the six genuinely new models below invent specific numeric
thresholds, percentages, or formulas as if they were confirmed bank policy.
Every place a real number would eventually be needed (DSR caps, income
haircuts, margin-of-finance limits, etc.) is flagged as **requires real bank
policy input** rather than filled in.

## The pipeline this Knowledge Base is designed around

```
OCR  →  Rule Engine  →  DSR  →  Eligibility  →  Bank Matching  →  AI Recommendation
```

- **OCR** (live today, narrow scope: NRIC + salary slip) extracts raw fields
  from uploaded documents.
- **Rule Engine** is not one model — it's the matching/derivation layer that
  turns raw facts (Borrower Profile, OCR output) into structured, usable
  figures: Required Documents (live), Income Recognition (new), Commitment
  Recognition (new), Property Rules (new) all belong here, each using the
  same "rule data in the database, matching logic in code" pattern already
  established by `mortgage_rules` (see [0006](../decisions/0006-mortgage-rules-engine.md)).
- **DSR** is the DSR Rules model: combining Income Recognition and
  Commitment Recognition outputs (plus the proposed new instalment) into a
  ratio and a pass/fail against a bank's threshold.
- **Eligibility** is the Eligibility Engine model: combining the DSR result
  with Property Rules and any other Bank Policy gates into a per-bank
  eligible/not-eligible verdict with reasons.
- **Bank Matching** is not a tenth model — it is the Eligibility Engine
  evaluated across every candidate Bank Policy record for a case, producing
  a ranked/filtered list of viable banks and products.
- **AI Recommendation** is the last stage: composing a natural-language
  explanation of the Bank Matching output for a banker — never generating
  the underlying facts itself.

The remainder of this document defines each of the 9 models required to
support that pipeline. See "Data flow across the pipeline" below for how
they connect end to end.

## The 9 models

### 1. Borrower Profile

**What it represents**: the borrower-side facts the rest of the pipeline
reasons about — who the applicant(s) are, structurally, for the purpose of
matching document requirements, income rules, and eligibility criteria.

**Today**: 4 qualitative dimensions only (`nationality`, `income_country`,
`employment_type`, `income_structure`), free text on `loan_cases`, validated
against a fixed vocabulary at the application layer
(`src/lib/mortgage-rules/borrower-profile-options.ts`), explicitly flagged in
that file as an unconfirmed starting vocabulary, not a product-manager-signed
set. Used today for exactly one purpose: matching Required Documents.

**What would need to change conceptually** (not decided here): the
downstream models below need quantitative facts this profile doesn't
currently carry — e.g. actual monthly income figures (as opposed to the
qualitative "Fixed/Variable/Mixed" income_structure), employment tenure,
date of birth/age (relevant to tenure caps), and whether the case has one
borrower or multiple joint borrowers. The current shape (4 flat columns on
`loan_cases`) implicitly assumes exactly one borrower per case; joint
applications are not represented anywhere in the schema today. Whether
Borrower Profile should become a distinct entity (potentially one-to-many
against a case, to support co-borrowers) or remain flat columns is an open
design question for `system-architect`, not resolved by this PRD.

**Relationships**: feeds Required Documents (today, live); would feed Income
Recognition and Commitment Recognition (which borrower a given income/debt
belongs to) and Property Rules (borrower's existing property count); is the
foundational input to the Eligibility Engine.

**Pipeline stage(s)**: input, consumed at every stage from Rule Engine
onward.

### 2. Required Documents

**What it represents**: the live production system generating a per-case
checklist of documents a borrower must supply, given their Borrower Profile.
Fully described in [0006](../decisions/0006-mortgage-rules-engine.md); not
re-specified here.

**Key attributes** (as they exist today): `mortgage_rules` (matching
dimensions mirroring Borrower Profile, each nullable/wildcard), matched via
wildcard/most-specific-wins in `src/lib/mortgage-rules/match-rule.ts`;
`mortgage_rule_documents` (which document types, `required_count`,
`required_months`); `loan_case_required_documents` (per-case generated
checklist, `state` of `active`/`not_required`, completion always computed
live against `documents`, never stored); an append-only event log
(`loan_case_required_document_events`).

**Relationships**: consumes Borrower Profile as its sole matching input
today. Downstream, OCR extracts fields from documents that satisfy specific
required document types (e.g. a salary slip satisfying the "Salary Slip"
requirement feeds Income Recognition). **Open question this PRD surfaces**:
today's rules are not bank-scoped — once a real Bank Policy model exists,
should Required Documents also vary by bank (some banks require different
proof of income)? Not decided here; flagged for a future, separate scoping
pass if this PRD is approved.

**Pipeline stage(s)**: front of the pipeline — upstream of/parallel to OCR
(a document must be required and uploaded before it can be OCR'd), and
Rule Engine.

### 3. Income Recognition

**What it represents**: a genuinely new model. The rules by which raw
income facts — largely sourced from OCR-extracted salary slip data
(`basicSalary`, `netSalary` today) and/or manually entered figures for
income types OCR doesn't cover — are converted into a single "recognized
income" figure usable by DSR. Malaysian bank underwriting does not typically
count all declared income at face value: commission and bonus income are
often averaged over a period or partially discounted, rental income is
commonly recognized at a reduced percentage, and different banks apply
different treatments to the same income type.

**Key attributes** (conceptual):
- Income source type (basic salary, fixed allowance, commission, bonus,
  overtime, rental income, business/self-employed income, EPF/dividend
  income, other).
- Recognition method: full value, a percentage haircut, or an average over
  a rolling number of months.
- Which Borrower Profile dimensions the rule applies to (an
  `employment_type`/`income_structure` combination — the same wildcard
  pattern Required Documents already uses).
- Minimum documentation/history required for an income source to be
  recognized at all (this ties back to Required Documents — e.g. "3 months
  of salary slips" as a prerequisite, not just a document to collect).
- Which Bank Policy the rule belongs to (income recognition varies by bank —
  see model 7).
- Versioning: `is_active`, `effective_from`/`effective_to`, matching the
  pattern already established for `mortgage_rules` in Sprint 6.2 Phase 2.

**Explicitly not specified here**: any actual haircut percentage, averaging
window, or minimum-history figure. These require real bank policy input and
must not be invented or assumed as confirmed policy.

**Relationships**: consumes OCR output (`SalarySlipFields` today, and any
future OCR templates) and Borrower Profile (`employment_type`,
`income_structure`); is scoped per Bank Policy; its output (a recognized
monthly income figure per borrower, per bank) is a direct input to DSR
Rules and the Eligibility Engine.

**Pipeline stage(s)**: Rule Engine (income side) → feeds DSR.

### 4. Commitment Recognition

**What it represents**: another genuinely new model. The borrower's
existing debt obligations, recognized for DSR purposes — other home loans,
car loans, personal loans, credit cards, and any other recurring commitment
a bank would count against the borrower's repayment capacity.

**Key attributes** (conceptual):
- Commitment type (housing loan, hire purchase/car loan, personal loan,
  credit card, other).
- Source of the data: self-declared by the borrower/agent, or (out of scope
  for this PRD — see "Explicitly out of scope") a future CCRIS/CTOS
  integration. This PRD assumes self-declared/manually-entered commitment
  data only.
- Outstanding balance and monthly instalment (or, for credit cards, a
  minimum-payment convention — the exact treatment, e.g. a percentage of
  credit limit, is a real Malaysian underwriting convention that varies by
  bank and must come from confirmed bank policy, not be assumed here).
- "To be settled" flag — a commitment the borrower states will be paid off
  before/at loan drawdown, which banks may or may not allow to be excluded.
- Which borrower (in a joint application) the commitment belongs to, and
  any joint-liability apportionment.
- Which Bank Policy's recognition treatment applies (a commitment's
  *existence* is a fact; how much of it a specific bank counts against DSR
  is policy).

**Relationships**: consumes Borrower Profile (which borrower a commitment
belongs to); is scoped per Bank Policy; feeds DSR Rules as the deduction
side of the ratio.

**Pipeline stage(s)**: Rule Engine (commitment side) → feeds DSR.

### 5. DSR Rules

**What it represents**: the formula and threshold for Debt Service Ratio
(DSR) — the standard Malaysian bank underwriting measure of
`total monthly commitments (including the proposed new mortgage
instalment) ÷ total recognized monthly income` — and the maximum ratio a
given bank/product will approve. In real Malaysian practice this threshold
and the underlying formula (e.g. whether a stress-test interest rate buffer
is applied to the proposed instalment) vary by bank, and sometimes by income
band or product.

**Key attributes** (conceptual):
- Numerator inputs: Commitment Recognition outputs for the borrower(s) plus
  an estimated instalment for the loan being applied for (itself derived
  from `loan_amount`, an assumed tenure, and an assumed interest rate — none
  of which are DSR Rules' own data, but external inputs it consumes).
- Denominator inputs: Income Recognition outputs for the borrower(s).
- Maximum DSR percentage allowed (bank-specific — **not specified in this
  PRD**, requires real bank policy input).
- Any stress-test rate buffer applied to the proposed instalment before
  computing the numerator (a real practice at some banks — **not specified
  here**, requires confirmation).
- Income-tier-based threshold variation, if any (some banks apply looser
  DSR caps above a certain income level — **not specified here**).
- Which Bank Policy the rule belongs to; versioning (`is_active`,
  `effective_from`/`effective_to`), same pattern as above.

**Relationships**: consumes Income Recognition and Commitment Recognition
outputs, plus loan terms (amount/tenure/rate) that live on or near the case
itself; is scoped per Bank Policy; its output (a computed ratio and a
pass/fail against the threshold) is a direct input to the Eligibility
Engine.

**Pipeline stage(s)**: DSR — the stage explicitly named in the pipeline,
sitting between Rule Engine outputs and Eligibility.

### 6. Property Rules

**What it represents**: another genuinely new model. Policy constraints
that vary by the property being financed — margin of finance (loan-to-value)
caps, maximum tenure, eligible property types, treatment of
under-construction vs. completed property, and owner-occupied vs.
investment-property treatment. Malaysian bank lending also commonly varies
margin of finance by how many properties the borrower already has financed
(a Bank Negara Malaysia macroprudential dimension with bank-specific
overlays on top).

**Key attributes** (conceptual):
- Property type (residential, commercial, land, other).
- Construction status (completed vs. under construction/progressive
  drawdown — which affects disbursement mechanics, not just eligibility).
- Occupancy intent (owner-occupied vs. investment).
- Borrower's existing financed-property count (this creates a real
  cross-model dependency: Property Rules needs to know how many *other*
  properties the borrower already has a home loan against, which is a fact
  that would live in Commitment Recognition, not duplicated here).
- Resulting margin of finance cap and tenure cap.
- Which Bank Policy the rule belongs to; versioning, same pattern as above.

**Known gap this model depends on**: `loan_cases` today has `loan_amount`
and `bank_name` but no property_type, construction_status, or occupancy
fields. Capturing these is a prerequisite this PRD surfaces but does not
design — it would need the same kind of scoping `system-architect` and
`supabase-architect` gave the original Borrower Profile fields in Sprint
6.2, not assumed to already exist.

**Relationships**: consumes Borrower Profile and Commitment Recognition
(existing property count); is scoped per Bank Policy; feeds the Eligibility
Engine (a hard ceiling on loan amount/tenure independent of DSR) and Bank
Matching (which banks even offer terms for this property type at all).

**Pipeline stage(s)**: Rule Engine / DSR-adjacent → feeds Eligibility and
Bank Matching.

### 7. Bank Policy

**What it represents**: today, "bank" is not a real entity in this system —
`bank_name` is unconstrained free text on both `loan_cases` and `bankers`,
with a hardcoded UI suggestion list (`src/lib/loan-cases-data.ts`) that
enforces nothing, already documented as a known gap in
[../business/bank-rules.md](../business/bank-rules.md). This PRD treats a
structured Bank Policy model as a **precondition** for the four models
above it, not new scope this PRD is inventing — Income Recognition, DSR
Rules, and Property Rules are all explicitly bank-scoped by design, and
none of that scoping is meaningful against a free-text string with no
referential integrity.

**Key attributes** (conceptual):
- Bank identity (name, and whatever code/reference a real bank entity
  needs — not specified here, that's a schema decision).
- Product(s) a bank offers, if products need to be distinguished separately
  from the bank itself (e.g. a bank may have multiple mortgage products
  with different terms) — flagged as an open question, not resolved here.
- The set of bank-specific overlays it anchors: Income Recognition rules,
  DSR Rules, Property Rules, and (per the open question under model 2)
  potentially Required Documents.
- Active/versioning fields, consistent with the `is_active`/
  `effective_from`/`effective_to` pattern already shipped for
  `mortgage_rules` in Sprint 6.2 Phase 2.

**Relationships**: the scoping dimension threaded through Income
Recognition, Commitment Recognition, DSR Rules, and Property Rules; directly
drives Bank Matching (the pipeline stage, not a separate model — see
"Data flow" below).

**Pipeline stage(s)**: foundational reference data, consumed at Rule
Engine, DSR, Eligibility, and centrally at Bank Matching.

**Explicit note**: replacing free-text `bank_name` with a structured table
is already named as a candidate improvement in
[../business/bank-rules.md](../business/bank-rules.md) and as unscoped
Future Vision in [../business/product-vision.md](../business/product-vision.md).
This PRD does not expand that scope — it documents that the Knowledge Base's
other bank-specific models cannot exist without it.

### 8. Eligibility Engine

**What it represents**: another genuinely new model — the orchestration
layer that takes a case's Borrower Profile together with Income
Recognition, Commitment Recognition, DSR Rules, and Property Rules outputs
for one specific Bank Policy, and produces a verdict: eligible, not
eligible, or eligible with conditions, for that bank/product, with
traceable reasons.

**Key attributes** (conceptual):
- The case and the specific Bank Policy being evaluated.
- The DSR Rules result (ratio, pass/fail).
- The Property Rules result (margin of finance / tenure ceiling, pass/fail).
- Any other qualitative gates a bank applies (e.g. nationality or employment
  type restrictions specific to that bank — this PRD does not enumerate
  them, since they are real bank policy, not something to assume).
- Overall verdict and a structured, human-readable list of reasons (so a
  rejection or condition is traceable to a specific rule, not an opaque
  score).
- A record of *which version* of each contributing rule (Income
  Recognition, DSR Rules, Property Rules) produced this result — because
  those rules will change over time, and per `CLAUDE.md`'s auditability
  principle, a result shown to a banker (and potentially, later, a
  customer) needs to be traceable to who/what produced it and when, not
  just recomputed silently and left unexplained if the underlying rules
  change later.

**Relationships**: consumes Income Recognition, Commitment Recognition, DSR
Rules, Property Rules, Bank Policy, and Borrower Profile; its output across
every candidate Bank Policy is what "Bank Matching" (the pipeline stage)
actually is; feeds AI Recommendation.

**Pipeline stage(s)**: Eligibility — the stage explicitly named in the
pipeline, sitting after DSR and before Bank Matching.

### 9. AI Recommendation

**What it represents**: this project's existing AI footprint is narrow and
deliberate — Gemini OCR extraction on two document types, plus a single
on-request, never-stored, AI-generated "Next Action" text field, explicitly
positioned in [0008](../decisions/0008-ocr-and-ai-case-summary.md) as an
exception to a "no AI by default" posture, with every fact a banker acts on
(Customer, Employment, Income, Missing Documents, Current Status) computed
live from real tables — AI never generates the facts, only one field of
judgment on top of them.

An AI Recommendation model, if built, must follow that same precedent: it
would consume the **already-computed, deterministic** output of Eligibility
Engine and Bank Matching (which banks/products a case is eligible for, the
DSR ratio, the reasons) and generate a natural-language explanation or
recommendation for a banker. It must not be the thing that computes
eligibility, DSR, or bank matching itself — those remain rule-based and
auditable (models 3–8). This mirrors 0008's core principle exactly: AI adds
judgment on top of real, computed facts; it is never the source of the
facts.

**Key attributes** (conceptual):
- The source case and the specific Eligibility Engine/Bank Matching
  result(s) it's explaining (a versioned reference, not a live
  recomputation it does itself).
- The generated recommendation text.
- Model/provider used (consistent with the existing `OCRProvider`-style
  interface discipline — application code should depend on an interface,
  not a specific vendor).
- Generated-at timestamp and requesting user — generated on request only,
  like today's Next Action field, not automatically and not silently
  cached as if it were a stored fact.

**Relationships**: strictly downstream of, and dependent on, Eligibility
Engine and Bank Matching. Must not bypass them by generating a
recommendation directly from raw Borrower Profile/Income/Commitment data.

**Pipeline stage(s)**: AI Recommendation — the final, explicitly named
stage.

**Compliance flag**: this is the most sensitive model in this PRD. A wrong
DSR figure, eligibility verdict, or bank match touches real lending
decisions and real customers' money — squarely the kind of feature
`CLAUDE.md` requires treating as compliance-relevant, not a toy. If this
PRD is approved for further work, the AI Recommendation model in particular
should get a `security-reviewer` pass before implementation, on top of
whatever review the deterministic models 3–8 already require.

## Data flow across the pipeline

Walking the full pipeline end to end, referencing the models above:

1. **OCR** (live): a banker/agent uploads documents against Required
   Documents entries (model 2, live); OCR extracts raw fields (e.g. salary
   slip `basicSalary`/`netSalary`) from documents tagged with an
   `ocr_kind`.
2. **Rule Engine**: Borrower Profile (model 1) plus OCR output feed three
   parallel derivations — Income Recognition (model 3) turns raw income
   into a recognized figure; Commitment Recognition (model 4) captures and
   treats existing debts; Property Rules (model 6) determines the
   margin-of-finance/tenure ceiling for the property being financed. All
   three are scoped by Bank Policy (model 7).
3. **DSR**: DSR Rules (model 5) combines Income Recognition and Commitment
   Recognition outputs (plus the proposed instalment) into a ratio and a
   pass/fail against the relevant Bank Policy's threshold.
4. **Eligibility**: the Eligibility Engine (model 8) combines the DSR
   result with the Property Rules result and any other Bank Policy gates
   into a verdict, with reasons, for one specific bank.
5. **Bank Matching**: the Eligibility Engine is evaluated across every
   candidate Bank Policy record for the case, producing a ranked/filtered
   list of viable banks and products. This is a *use* of model 8 across
   model 7's records, not a tenth model.
6. **AI Recommendation**: the AI Recommendation model (model 9) composes a
   natural-language explanation of the Bank Matching output for a banker —
   strictly downstream, never a source of the underlying facts.

## Open questions requiring real bank policy input

None of the following are answered by this PRD, and none should be
invented or assumed if this PRD proceeds to further scoping:

- Actual DSR maximum thresholds, and whether they vary by bank, income
  tier, or product.
- Whether a stress-test interest rate buffer is applied to the proposed
  instalment, and what it is.
- Income recognition treatment per income type (haircut percentages,
  averaging windows) per bank.
- Commitment recognition treatment, especially credit card minimum-payment
  conventions and "to be settled" handling, per bank.
- Margin of finance and tenure caps by property type, construction status,
  and existing-property count, per bank.
- Whether Required Documents should become bank-scoped.
- Whether Borrower Profile should become a distinct, possibly one-to-many
  (joint borrower) entity rather than flat columns on `loan_cases`.
- Whether a bank's products need to be modeled separately from the bank
  itself. **Addressed architecturally** (not resolved for implementation) by
  the Product Knowledge Layer in
  [mortgage-knowledge-architecture.md](mortgage-knowledge-architecture.md#3-product-knowledge-layer) —
  see that document rather than this bullet for the design.

## Explicitly out of scope for this PRD

- Any SQL, migration file, schema DDL, TypeScript, or UI/screen design —
  this is a conceptual document only.
- CCRIS/CTOS or any other external credit bureau integration — Commitment
  Recognition here assumes self-declared/manually-entered data only.
- WhatsApp, the Customers module, the Bankers module, Case Notes/Follow-ups,
  or any other roadmap item not named in this brief.
- Any claim that this design is approved for implementation, scheduled into
  a sprint, or assigned an implementation order across the 9 models.
- Resolving the open questions above — they are flagged, not answered.

## Status

**Awaiting CTO approval before any implementation begins.** This document
does not authorize a migration, a schema proposal, an ADR committing to a
specific technical approach, or any code or UI work. If approved to
proceed, the next steps (per `CLAUDE.md`'s standard workflow) would be:
`system-architect` review and, for anything schema-shaped,
`supabase-architect` involvement — but that sequencing is not initiated by
this document.
