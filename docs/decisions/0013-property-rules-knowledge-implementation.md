# 0013. Property Rules Knowledge Implementation — Sprint 6.3B-4

Status: Proposed (migrations authored, not confirmed run against the live database)
Date: 2026-07-24

## Context

Sprint 6.3B-1 ([0010](0010-income-knowledge-implementation.md)) implemented
Income Knowledge and built the domain-agnostic Evidence Layer (`evidence`,
`derivation_results`). Sprint 6.3B-2
([0011](0011-commitment-knowledge-implementation.md)) and Sprint 6.3B-3
([0012](0012-dsr-knowledge-implementation.md)) each confirmed that bet again,
reusing both tables unmodified. Sprint 6.3B-4 implements the fourth slice,
Property Rules Knowledge, per DB PRD Section 3.7. Unlike 0012's first
version, this ADR is written only after the full sprint — schema, RLS,
seeder, and the complete TypeScript service layer, including one
security-review fix — actually landed, specifically to avoid repeating
0012's premature-ADR mistake (see 0012's "Correction note"). This ADR
records the technical decisions made while building this slice end-to-end,
in particular where its matching shape deliberately combines both patterns
seen in the three prior domains rather than repeating either one, and the
one security-review finding that changed the implementation.

## Decisions

**Scope: exactly ONE new table**, `property_rules`. `banks`, `bank_products`,
`evidence`, and `derivation_results` (all built in Sprint 6.3B-1) are reused
unmodified — the fourth confirmation of the domain-agnostic Evidence Layer
bet from 0010. `derivation_results.domain`'s `CHECK` constraint already
accepted `property_rules` as of that migration, so this domain needed zero
changes to the shared Evidence Layer tables to start writing into it.

**The matcher combines both patterns seen in prior sprints, rather than
matching either exactly.** `property_rules` has three required exact-match
text dimensions — `property_type`, `construction_status`, `occupancy_intent`
— given the same open-vocabulary-no-`CHECK` treatment as Commitment
Knowledge's `commitment_type` (0011): open text maintained by
application-layer convention, not a database enum, so a new property type,
construction-status value, or occupancy classification never requires a
migration. It also has a numeric range matching dimension —
`existing_property_count_min`/`existing_property_count_max` — the same
*shape* as DSR's income-tier bounds (0012), but a genuinely different
comparison convention: **inclusive-inclusive, not half-open.** DSR's
income-tier bounds are half-open (`lower IS NULL OR income >= lower` AND
`upper IS NULL OR income < upper`) because a continuous decimal value needs
a way to tile non-overlapping tiers without a boundary value belonging to
two tiers at once. `existing_property_count_min`/`max` instead describe a
discrete integer count, which has no such boundary-sharing problem — a rule
for "0 to 1 existing properties" and a rule for "2 to 3 existing properties"
tile the integer line exactly with both bounds inclusive, with no
fractional count that could fall ambiguously between them. Using a
half-open convention here would force an off-by-one authoring habit (writing
`max=4` to mean "up to and including 3") with no counterpart in how DB PRD
Section 3.7 describes the column. `src/lib/property-rules-knowledge/match-property-rule.ts`
implements this explicitly (`existingPropertyCountMatches`) and deliberately
does not adapt `match-dsr-rule.ts`'s half-open range-matching helper. This
is worth being explicit about so a future domain author does not assume
"range column" always means half-open — the two range-typed tables in this
Knowledge Base use different bound semantics because they model genuinely
different kinds of quantities (continuous vs. discrete), not because of an
inconsistency to be reconciled. Specificity/most-specific-wins extends to
`bankProductId !== null` plus both range bounds being non-null (each 1
point); the three exact-match text dimensions are always required, so they
never vary in "wildcardness" and don't contribute — the same reasoning
`commitmentType` didn't contribute to Commitment Knowledge's specificity.

**This domain is a lookup, not a recognition with a transformation
formula.** Unlike Income, Commitment, and DSR — each of which computes a
new number from inputs (a haircut/averaging figure, a settlement-excluded
instalment sum, a DSR ratio) — Property Rules' "computed" result is just the
matched rule's `marginOfFinancePercentage`/`maxTenureYears`, read straight
off the row and passed through as-is (both may be `null` if not yet
configured, not an error). There is no `compute-*.ts` file in
`src/lib/property-rules-knowledge/` — a deliberate absence, not an
oversight; `computePropertyRulesForCase` in `actions.ts` has no separate
computation step to delegate to one.

**This domain reads `evidence` directly, like Income and Commitment — not
`derivation_results`, like DSR.** It is the second domain (after the first
two) to consume raw Evidence rather than another domain's derived output,
and required 4 distinct, non-interchangeable evidence facts — property type,
construction status, occupancy intent, existing property count — rather
than an array of same-typed values. `computePropertyRulesForCase` therefore
takes 4 separately-named parameters (`propertyTypeEvidenceId`,
`constructionStatusEvidenceId`, `occupancyIntentEvidenceId`,
`existingPropertyCountEvidenceId`), unlike Income Recognition's
`evidenceIds: string[]`.

**A security-review finding and its fix — the central lesson of this
sprint.** The initial implementation matched each fetched `evidence` row to
its parameter by id only, with no check that the row was actually the
*kind* of fact it was being used as. Because 3 of the 4 fields
(`propertyType`, `constructionStatus`, `occupancyIntent`) are all
unconstrained open-text strings, a caller transposing, e.g., the
construction-status evidence id into the occupancy-intent slot would pass
every other check (distinct id, belongs to the case, right JS primitive
type) silently — either producing a misleading "no rule matched" error or,
worse, coincidentally matching a real-but-wrong rule if a bank's
vocabularies happened to overlap as strings. This was fixed by adding an
`evidence_type` discriminator check, verified per slot before the
value-shape (`typeof`) checks: `src/lib/property-rules-knowledge/actions.ts`
now selects `evidence_type` alongside `id`/`value` and compares each bound
row against a module-level `EXPECTED_EVIDENCE_TYPE` map
(`"property_type"`, `"construction_status"`, `"occupancy_intent"`,
`"existing_property_count"`), returning a specific error naming the id and
the mismatched type if it fails. This is a real, generalizable lesson, not
specific to Property Rules: binding by id alone is not sufficient when
multiple input fields share a value type and play different roles — a
discriminator check is required whenever a Server Action takes multiple
same-shaped evidence inputs. This is likely relevant to any future domain
with a similar multi-field-same-type evidence shape.

**A second, lower-severity finding was recorded but not code-fixed.** No
casing/whitespace canonicalization exists between how `evidence` values get
recorded and how `property_rules` rows get authored (e.g. `"Residential"`
vs `"residential"`). This fails closed — a clear "no property rule matched"
error, not a wrong silent result — but could spuriously block a legitimate
case with a misleading apparent cause (looking like a missing rule rather
than a casing mismatch). This is recorded here as an accepted, named gap
requiring a future deliberate decision (e.g. a shared canonical-vocabulary
constants file enforced at both the evidence-recording and rule-authoring
paths), not resolved this sprint.

**No RPC, no UI — same reasoning as every prior sprint.**
`computePropertyRulesForCase` is a single-table insert into
`derivation_results` (it reads `bank_products`, `evidence`, and
`property_rules`, but writes exactly one row), so a plain Server Action is
the correct, minimal pattern — no RPC applies, same reasoning as
`computeIncomeRecognition` / `computeCommitmentRecognition` /
`computeDsrForCase` in 0010/0011/0012. There is still no admin UI this
sprint (same explicit CTO scope limit as the prior three), but the full
TypeScript service layer (`src/lib/property-rules-knowledge/*.ts`,
`src/lib/database/property-rules-knowledge.ts`) was built,
security-reviewed (including the fix above), and QA-verified in the same
unit of work as the schema/RLS/seed step — unlike 0012's first version,
this ADR is only being written now that all of that is true.

**The integrity guard (`property_rules_active_profile_version_idx`) covers
`bank_id`/`bank_product_id`/`property_type`/`construction_status`/
`occupancy_intent`/`version`, deliberately NOT the existing-property-count
range — and that gap is named explicitly, not left implicit.** A partial
unique btree index cannot express "reject two active rows whose numeric
ranges overlap"; that requires a materially different mechanism (`EXCLUDE
USING gist`), which this migration's brief does not authorize building. The
migration documents this inline, extending the same accepted-gap precedent
`mortgage_rules` established in Sprint 6.2 Phase 1 and `dsr_rules` repeated
in 0012 ("rule data is human-curated and low-volume, so this is an accepted
gap for now, not a blocking issue") to property rule count-range overlap. A
conscious, named Phase 1 gap, not an oversight.

**No `margin_of_finance_percentage` or `max_tenure_years` seeded, even
illustratively.** Same reasoning as DSR's unseeded `max_dsr_percentage`/
`stress_test_rate_buffer_percentage` in 0012: any populated figure, even a
"round, commonly-cited" one, would be indistinguishable from real, confirmed
bank policy to a future reader. The seed leaves both columns `NULL` and says
so explicitly in its own comments.

## Consequences

- `property_rules` has no admin UI and no insert/update/delete RLS policy
  this sprint — human-managed via the Supabase SQL Editor only, the same
  Phase-1-before-Phase-2 posture `income_recognition_rules`,
  `commitment_recognition_rules`, and `dsr_rules` shipped with.
- Two active `property_rules` rows sharing an identical
  bank/product/property_type/construction_status/occupancy_intent/version
  but with overlapping existing-property-count ranges are not rejected by
  the database — an accepted Phase 1 gap, consistent with `dsr_rules`' and
  `mortgage_rules`' own gaps. If rule volume grows materially, revisiting
  this with a `numrange` `EXCLUDE` constraint is a future, separately-scoped
  option, not attempted here.
- A future domain author reading this Knowledge Base's two range-typed rule
  tables side by side must not assume a shared bound convention:
  `dsr_rules`' income-tier bounds are half-open, `property_rules`' count
  bounds are inclusive-inclusive, and each is correct for the kind of
  quantity it models (continuous vs. discrete). This asymmetry is now
  documented at the schema level (both column comments in
  `20260729010000_property_rules_knowledge_schema.sql`), in
  `match-property-rule.ts`, and here.
- The `evidence_type` discriminator check added in
  `computePropertyRulesForCase` is a pattern, not a one-off — any future
  domain whose Server Action takes multiple same-shaped (e.g. all-string)
  evidence inputs playing different roles should apply the same check from
  the start, rather than relying on id/case/`typeof` checks alone.
- Property Rules' correctness still depends on the unenforced convention
  that Evidence-recording and rule-authoring use the same string casing for
  `property_type`/`construction_status`/`occupancy_intent`. This gap fails
  closed today (a legitimate case can be blocked by a misleading "no rule
  matched" error caused by a casing mismatch, not silently mismatched), but
  remains unresolved — a future canonical-vocabulary decision, not attempted
  this sprint.
- Only 2 of the DB PRD's remaining tables now do not exist:
  `eligibility_verdicts`, `eligibility_verdict_derivation_results`, and
  `ai_recommendations` (3, counting all three named). `derivation_results.domain`
  already accepts `property_rules`, so all four Derivation Knowledge domains
  (Income, Commitment, DSR, Property Rules) now write into the same shared
  Evidence Layer with zero schema changes to it — a fourth and strongest
  confirmation of the 0010 bet.

## Evidence

`supabase/migrations/20260729010000_property_rules_knowledge_schema.sql`,
`supabase/migrations/20260729020000_property_rules_knowledge_rls.sql`,
`supabase/seeds/20260729010000_property_rules_knowledge_seed.sql`,
`src/lib/property-rules-knowledge/types.ts`,
`src/lib/property-rules-knowledge/match-property-rule.ts`,
`src/lib/property-rules-knowledge/actions.ts`,
`src/lib/database/property-rules-knowledge.ts`,
`docs/product/mortgage-knowledge-database-prd.md` Section 3.7.
