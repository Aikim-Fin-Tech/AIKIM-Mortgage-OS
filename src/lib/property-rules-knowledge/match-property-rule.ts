import type { PropertyRule } from "./types";

/**
 * Pure, dependency-free matching algorithm — no DB access, easy to unit
 * test. Combines both matching shapes seen in prior domains, rather than
 * matching either one exactly:
 *
 *   - `bankId` — required exact match, never a wildcard.
 *   - `bankProductId` — nullable-is-wildcard, most-specific-wins, same
 *     convention as every other rule table.
 *   - `propertyType` / `constructionStatus` / `occupancyIntent` — THREE
 *     required exact-match text dimensions, never wildcards, same treatment
 *     as src/lib/commitment-knowledge/match-commitment-rule.ts's
 *     `commitmentType`.
 *   - `existingPropertyCountMin` / `existingPropertyCountMax` — a numeric
 *     RANGE test, like src/lib/dsr-knowledge/match-dsr-rule.ts's income-tier
 *     bounds, but with DELIBERATELY DIFFERENT (inclusive-inclusive, not
 *     half-open) comparison semantics, per the design note in
 *     supabase/migrations/20260729010000_property_rules_knowledge_schema.sql:
 *
 *       (existingPropertyCountMin === null || existingPropertyCount >= existingPropertyCountMin)
 *       AND (existingPropertyCountMax === null || existingPropertyCount <= existingPropertyCountMax)
 *
 *     Written explicitly here — does NOT adapt match-dsr-rule.ts's
 *     half-open comparison operators.
 *
 * Specificity/most-specific-wins: only `bankProductId !== null` (1 point)
 * plus `existingPropertyCountMin !== null` (1 point) plus
 * `existingPropertyCountMax !== null` (1 point) count toward specificity —
 * the three exact-match text dimensions are always required (never
 * wildcards), so they don't vary in "wildcardness" and don't contribute,
 * same reasoning `commitmentType` didn't contribute to Commitment
 * Knowledge's specificity. Ties (including the trivial case of a single
 * unambiguous match) are broken by a stable sort that preserves
 * caller-supplied order — callers should pass rules pre-sorted by
 * `updated_at desc`, matching every prior matcher's own convention, so a tie
 * resolves to the most recently updated rule.
 */

function bankProductMatches(ruleBankProductId: string | null, bankProductId: string | null): boolean {
  return ruleBankProductId === null || ruleBankProductId === bankProductId;
}

function existingPropertyCountMatches(rule: PropertyRule, existingPropertyCount: number): boolean {
  const lowerOk = rule.existingPropertyCountMin === null || existingPropertyCount >= rule.existingPropertyCountMin;
  const upperOk = rule.existingPropertyCountMax === null || existingPropertyCount <= rule.existingPropertyCountMax;
  return lowerOk && upperOk;
}

function specificity(rule: PropertyRule): number {
  const bankProductSpecificity = rule.bankProductId !== null ? 1 : 0;
  const lowerBoundSpecificity = rule.existingPropertyCountMin !== null ? 1 : 0;
  const upperBoundSpecificity = rule.existingPropertyCountMax !== null ? 1 : 0;
  return bankProductSpecificity + lowerBoundSpecificity + upperBoundSpecificity;
}

export function matchPropertyRule(
  bankId: string,
  bankProductId: string | null,
  propertyType: string,
  constructionStatus: string,
  occupancyIntent: string,
  existingPropertyCount: number,
  rules: PropertyRule[],
): PropertyRule | null {
  const candidates = rules.filter(
    (rule) =>
      rule.bankId === bankId &&
      bankProductMatches(rule.bankProductId, bankProductId) &&
      rule.propertyType === propertyType &&
      rule.constructionStatus === constructionStatus &&
      rule.occupancyIntent === occupancyIntent &&
      existingPropertyCountMatches(rule, existingPropertyCount),
  );

  if (candidates.length === 0) return null;

  // Stable sort: candidates with equal specificity keep their relative
  // (caller-supplied) order.
  const sorted = [...candidates].sort((a, b) => specificity(b) - specificity(a));
  return sorted[0];
}
