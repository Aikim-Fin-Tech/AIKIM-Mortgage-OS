# 0007. Mortgage Rule Admin — dimension-driven matcher, deactivate-only rules

Status: Proposed (migration authored, not confirmed run against the live database)
Date: 2026-07-23

## Context

Sprint 6.2 Phase 2 gives `super_admin` a UI to manage `mortgage_rules`,
`mortgage_rule_documents`, and `document_categories` — human-managed via the
SQL Editor since Phase 1. The brief also requires the Rule Engine stay
extensible to future matching dimensions (property type, loan purpose, bank,
developer, first home, loan amount, ...) *"without redesigning the
architecture."*

## Decisions

**The 4 profile dimensions are declared once, in one config file.**
`src/lib/mortgage-rules/profile-dimensions.ts` exports `PROFILE_DIMENSIONS`,
an array of `{ key, column, label, options }`. `match-rule.ts`, the Borrower
Profile form (`BorrowerProfileCard`), and the admin `RuleForm` all iterate
over this array — none of them hardcode `nationality`/`incomeCountry`/etc.
individually. Adding a 5th categorical dimension later is: one migration
(new column on `loan_cases` + `mortgage_rules`), one field added to
`BorrowerProfile`/`MortgageRule` in `types.ts`, one new entry in this array.
None of the matching algorithm, the profile form, or the rule form need to
change shape. This is deliberately *not* a fully generic EAV
(entity-attribute-value) schema — that would trade away TypeScript type
safety and simple SQL joins for a flexibility this brief didn't ask for
("without redesigning" a fixed-but-declarative dimension list, not "without
ever migrating"). Flagged explicitly: a genuinely numeric/range dimension
(e.g. loan amount) won't fit this config's `options: readonly string[]`
equality/wildcard shape and will need its own comparison mode when it's
actually added — noted in the file itself for whoever implements it.

**`mortgage_rules` still has no DELETE RLS policy — deactivate only, now
enforced by the database, not just app code.** `setRuleActive` is the only
mutation path that touches `is_active`; there is no delete action anywhere
in the admin UI or Server Actions for a rule itself.

**View and Edit are the same page.** Since only `super_admin` can reach
`/settings/mortgage-rules/[ruleId]` at all (page-level `notFound()` guard for
every other role), a separate read-only view added no real value — the edit
form doubles as the detail view.

**Category is never duplicated onto `mortgage_rule_documents`.** It's always
derived by joining through `document_type_id → document_types.category_id`
(`getMortgageRuleDetail`, `getDocumentTypesWithCategory`) — see Phase 1's
ADR ([0006](0006-mortgage-rules-engine.md)) for why a second, independently-
editable category column was rejected.

**Duplicate-active-rule prevention is enforced by the database, not
pre-checked in application code.** `createRule`/`updateRule`/`setRuleActive`
attempt the write and catch Postgres `23505` (unique violation) from the
partial unique index authored in Phase 2's migration, translating it into a
friendly message — the constraint is the actual source of truth, not a
duplicated application-side check that could drift out of sync with it.

## Consequences

- Reordering (`mortgage_rule_documents.display_order`,
  `document_categories.display_order`) is implemented as up/down buttons
  calling a bulk `Promise.all` of individual row updates, not drag-and-drop —
  no new UI dependency, adequate for admin-scale lists (tens of rows, not
  thousands).
- Every admin mutation is a plain Supabase call re-checking `role ===
  'super_admin'` server-side, not a `SECURITY INVOKER` RPC — consistent with
  Phase 1's decision ([0006](0006-mortgage-rules-engine.md)) to keep rule-
  engine logic in TypeScript, not SQL.
- Activating a rule can be rejected by the database (another active rule
  already occupies that exact profile + version) — this is surfaced as a
  normal form/action error, not a crash; the admin picks a different version
  or deactivates the conflicting rule first.

## Evidence

`supabase/migrations/20260723010000_mortgage_rule_admin.sql`,
`src/lib/mortgage-rules/profile-dimensions.ts`,
`src/app/(app)/settings/**`,
`src/components/settings/**`.
