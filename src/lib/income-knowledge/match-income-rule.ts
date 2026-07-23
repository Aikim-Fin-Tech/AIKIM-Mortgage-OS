import { PROFILE_DIMENSIONS } from "@/lib/mortgage-rules/profile-dimensions";
import type { BorrowerProfile } from "@/lib/mortgage-rules/types";
import type { IncomeRecognitionRule } from "./types";

/**
 * Pure, dependency-free matching algorithm — no DB access, easy to unit
 * test. Extends src/lib/mortgage-rules/match-rule.ts's wildcard/
 * most-specific-wins algorithm with two more scoping dimensions:
 *
 *   - `bankId` — a required exact match, never a wildcard dimension. A rule
 *     scoped to a different bank is never a candidate, regardless of how
 *     well its other fields match.
 *   - `bankProductId` — nullable-is-wildcard, most-specific-wins, the same
 *     convention PROFILE_DIMENSIONS already uses for the 4 borrower-profile
 *     fields (null on the rule = "this bank's default treatment"; a
 *     specific value overrides that default for that product only).
 *
 * Reuses PROFILE_DIMENSIONS (imported, not copied) for the 4 existing
 * borrower-profile dimensions, so a future 5th profile dimension added to
 * that shared list is picked up here automatically. Among every rule
 * matching a given bank/product/borrower-profile combination, the one with
 * the fewest wildcards across all 6 now-relevant dimensions wins — `bankId`
 * never enters that count since it's never a wildcard.
 */

function fieldMatches(ruleValue: string | null, profileValue: string | null): boolean {
  return ruleValue === null || ruleValue === profileValue;
}

function bankProductMatches(ruleBankProductId: string | null, bankProductId: string | null): boolean {
  return ruleBankProductId === null || ruleBankProductId === bankProductId;
}

function specificity(rule: IncomeRecognitionRule): number {
  const profileSpecificity = PROFILE_DIMENSIONS.filter((dim) => rule[dim.key] !== null).length;
  const bankProductSpecificity = rule.bankProductId !== null ? 1 : 0;
  return profileSpecificity + bankProductSpecificity;
}

export function matchIncomeRecognitionRule(
  bankId: string,
  bankProductId: string | null,
  profile: BorrowerProfile,
  rules: IncomeRecognitionRule[],
): IncomeRecognitionRule | null {
  const candidates = rules.filter(
    (rule) =>
      rule.bankId === bankId &&
      bankProductMatches(rule.bankProductId, bankProductId) &&
      PROFILE_DIMENSIONS.every((dim) => fieldMatches(rule[dim.key], profile[dim.key])),
  );

  if (candidates.length === 0) return null;

  // Stable sort: candidates with equal specificity keep their relative
  // (caller-supplied) order — callers should pass rules pre-sorted by
  // `updated_at desc`, matching match-rule.ts's own convention, so a tie
  // resolves to the most recently updated rule.
  const sorted = [...candidates].sort((a, b) => specificity(b) - specificity(a));
  return sorted[0];
}
