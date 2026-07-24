# 0015. AIKIM Standard Baseline Seeding

Status: Accepted
Date: 2026-07-24

## Context

`docs/product/mortgage-knowledge-database-prd.md` Section 8 established, and
the four seed templates already shipped for Sprint 6.3B-1 through 6.3B-4
(`supabase/seeds/20260726010000_income_knowledge_seed.sql`,
`supabase/seeds/20260727010000_commitment_knowledge_seed.sql`,
`supabase/seeds/20260728010000_dsr_knowledge_seed.sql`,
`supabase/seeds/20260729010000_property_rules_knowledge_seed.sql`) enforce, a
strict rule: no migration ever inserts fabricated bank/product/rule rows,
because plausible-looking invented bank policy data is indistinguishable
from real, confirmed policy to a future reader — a compliance risk, not a
convenience. Every value in those four templates is a `REPLACE_WITH_*`
placeholder scoped to a single, deliberately-unnamed real bank, meant to be
filled in only by a human who has confirmed that bank's actual policy, and
none of them is auto-run by any tooling or agent in this repo.

That rule leaves the Income Recognition, Commitment Recognition, Property
Rules, and DSR Rules Knowledge domains built in Sprints 6.3B-1 through 6.3B-4
([0010](0010-income-knowledge-implementation.md)–
[0013](0013-property-rules-knowledge-implementation.md), matched against a
per-case verdict by 0014's Eligibility Engine) with zero exercisable rows:
every case today shows "no rule matched" for all four domains, because no
real bank's policy has yet been confirmed and entered. For Sprint 6.3's
Phase 2 stabilization, the CTO/user decided this should be addressed not by
inventing plausible numbers for a real bank — which Section 8 already
forbids and this ADR does not weaken — but by seeding a single canonical
baseline instead, representing AIKIM's own curated mortgage underwriting
house view rather than any specific real bank's confirmed policy.

## Decision

**A new canonical bank/product pair is the seedable baseline for all four
Knowledge domains: `banks.name = 'AIKIM Standard'`,
`bank_products.product_name = 'Standard Mortgage'`.** This is explicitly not
a real bank — it is a labeled house view, seeded specifically so the four
Knowledge domains have a sane, exercisable default without requiring real
bank data nobody has yet confirmed. It sits alongside, and does not replace,
the existing `REPLACE_WITH_REAL_BANK_NAME` template convention: the four
existing seed templates remain the correct mechanism for onboarding a
specific real bank once its policy is confirmed.

**Two categories of data are distinguished, and only one may be seeded under
this label:**

1. **Well-supported mortgage knowledge** — an industry-wide convention, a
   verifiable regulatory fact (e.g. BNM's 70% margin-of-finance cap on a
   3rd+ housing loan, BNM's 35-year maximum tenure guideline, the
   ~5%-of-limit credit card DSR convention), or AIKIM's own defensible
   underwriting judgment — **may be seeded** under the AIKIM Standard
   baseline.
2. **Bank-specific underwriting policy** — a number that would only be true
   because some particular real bank happened to set it that way — **must
   never be invented**, even under the AIKIM Standard label. This
   explicitly includes `dsr_rules.max_dsr_percentage` and
   `dsr_rules.stress_test_rate_buffer_percentage` (see the DSR carve-out,
   rule 3 below).

This is a narrow, precisely-scoped exception to Section 8, not a general
license to populate plausible-looking numbers: it does not cover "any figure
that merely looks reasonable," and every row seeded under it must be
independently defensible as either regulatory/industry fact or AIKIM's own
stated judgment call, not a guess dressed up as one.

**Four durable rules govern every row seeded under the AIKIM Standard
label, binding on `supabase-architect` and any future agent or human
touching these tables:**

1. **Self-identification.** Every row's `description` must explicitly
   identify it as AIKIM's own curated house-view default — language that
   makes clear this is not, and must never be read or presented as, a
   specific real bank's confirmed policy (e.g. "AIKIM Standard house view:
   ..."), never phrased as if reporting a real bank's rule.
2. **Confidence basis.** Every such row's `description` (or an equivalent
   adjacent convention applied consistently, e.g. a `confidence_basis` note
   held within the same field) must state which of the two categories above
   it falls into: "verified regulatory/industry convention" — with a
   one-line source, e.g. "BNM margin-of-finance guideline" — or "AIKIM house
   judgment call," with no invented external source attached to it. A row
   that cannot honestly be labeled with one of these two bases must not be
   seeded.
3. **The DSR carve-out is a harder rule than 1–2, not an instance of
   them.** Under AIKIM Standard, `dsr_rules` rows may define the tier
   *framework* — `income_tier_lower_bound`/`income_tier_upper_bound` — since
   income-tier segmentation is a structural convention, not a bank-specific
   number. But `max_dsr_percentage` and `stress_test_rate_buffer_percentage`
   must stay `NULL` on every AIKIM Standard row, exactly as they already
   must on every real-bank row, until a human supplies a real, confirmed
   figure. This mirrors, and does not loosen, the existing DSR seed
   template's own explicit carve-out
   (`supabase/seeds/20260728010000_dsr_knowledge_seed.sql`: no populated
   value exists that would be safe here, unlike Income/Commitment
   Recognition, which each have a percentage-free method —
   `full_value`/`full_instalment` — available as a genuinely safe
   illustrative choice). The same discipline applies to
   `property_rules.margin_of_finance_percentage`/`max_tenure_years` when the
   specific figure would only be true of one bank's own policy (category 2
   above); BNM's own published ceilings (e.g. 70% margin of finance on a
   3rd+ property, 35-year maximum tenure) are the one case where a
   `property_rules` figure is defensible under category 1, precisely
   because it is a cited regulatory fact, not an invented bank preference —
   and any such row must still carry the rule-2 source citation.
4. **AIKIM Standard is the canonical baseline layer; real banks are
   overrides, not replacements.** `bank_products.bank_id` pointing at the
   "AIKIM Standard" `banks` row is the intended long-term default layer for
   all four rule domains. When a real bank's confirmed policy differs from
   this baseline, the correct model is to add a new rule row scoped to that
   bank's own `bank_id` (and, if it varies per product, `bank_product_id`),
   sitting *alongside* the AIKIM Standard row — never by editing or deleting
   the baseline row to fit that one bank's figure. This reuses the existing
   nullable `bank_product_id` matching/specificity mechanism already
   implemented in each domain's matcher
   (`src/lib/income-knowledge/match-income-rule.ts`,
   `src/lib/commitment-knowledge/match-commitment-rule.ts`,
   `src/lib/dsr-knowledge/match-dsr-rule.ts`,
   `src/lib/property-rules-knowledge/match-property-rule.ts`) — no new
   matching mechanism is invented by this decision, and no schema change to
   any of the four rule tables is required to support it. Making AIKIM
   Standard behave as a true fallback-of-last-resort across banks (as
   opposed to simply being one more `bank_id` value a case can be scoped
   to) is a future, separately-scoped matcher change if ever needed — this
   ADR documents the intended data model, not new matching logic.

**This ADR supersedes PRD Section 8 only for this specific case.** It does
not weaken Section 8's rule against inventing real-bank-attributed data
anywhere else in the system, and it does not change the four existing seed
templates' own posture (`REPLACE_WITH_*` placeholders, human-filled, never
auto-run) — those remain the correct mechanism the first time a real bank
(Maybank, CIMB, Public Bank, etc.) is onboarded as an override on top of
this baseline.

## Consequences

- The four Knowledge domains (Income Recognition, Commitment Recognition,
  Property Rules, DSR Rules) gain a real, exercisable default row set for
  the first time, without any real bank's confirmed policy having been
  entered — a case can now match at least the AIKIM Standard baseline
  instead of uniformly showing "no rule matched."
- `dsr_rules` remains, deliberately, the one domain where AIKIM Standard
  seeding cannot produce a fully exercisable rule on its own:
  `max_dsr_percentage`/`stress_test_rate_buffer_percentage` stay `NULL`, so
  `computeDsrForCase`'s `passed` boolean continues to resolve to `null`
  ("not configured," per 0012 and 0014's Eligibility Engine
  `not_configured` category) until a human supplies a real, bank-confirmed
  figure — by design, not a gap to close later under this baseline.
- `supabase-architect` is responsible for authoring the actual seed
  migration(s)/seed file(s) that create the "AIKIM Standard"
  `banks`/`bank_products` rows and populate rule rows under the four
  durable rules above — this ADR records the decision and its constraints,
  it does not itself seed anything.
- Every future rule row authored for a real bank must be reviewed against
  rule 4: added as a `bank_id`/`bank_product_id`-scoped override alongside
  the AIKIM Standard baseline, never as an edit to a baseline row to fit
  one bank's figure.
- A future reader of the `banks`/rule tables who is unaware of this ADR
  could otherwise mistake an "AIKIM Standard" row for a real bank's — rule
  1 (mandatory self-identifying `description` language) is the durable
  guard against that misreading, and any seed migration that omits it
  should be treated as non-compliant with this ADR.
- This does not change `docs/architecture/overview.md` — the system's
  request-boundary, client-factory, and data-flow shape are unaffected;
  only the seeding *policy* for four already-existing tables changes.

## Evidence

`docs/product/mortgage-knowledge-database-prd.md` Section 8,
`supabase/seeds/20260726010000_income_knowledge_seed.sql`,
`supabase/seeds/20260727010000_commitment_knowledge_seed.sql`,
`supabase/seeds/20260728010000_dsr_knowledge_seed.sql`,
`supabase/seeds/20260729010000_property_rules_knowledge_seed.sql`,
`supabase/migrations/20260726010000_income_knowledge_schema.sql`,
`supabase/migrations/20260727010000_commitment_knowledge_schema.sql`,
`supabase/migrations/20260728010000_dsr_knowledge_schema.sql`,
`supabase/migrations/20260729010000_property_rules_knowledge_schema.sql`,
`docs/decisions/0010-income-knowledge-implementation.md`,
`docs/decisions/0011-commitment-knowledge-implementation.md`,
`docs/decisions/0012-dsr-knowledge-implementation.md`,
`docs/decisions/0013-property-rules-knowledge-implementation.md`,
`docs/decisions/0014-eligibility-engine-implementation.md`.
