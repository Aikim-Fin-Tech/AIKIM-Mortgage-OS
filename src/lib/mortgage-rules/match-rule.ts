import { PROFILE_DIMENSIONS } from "./profile-dimensions";
import type { BorrowerProfile, MortgageRule } from "./types";

/**
 * Pure, dependency-free matching algorithm — no DB access, easy to unit test.
 * A rule field of `null` means "matches any" for that dimension. Among every
 * rule that matches, the one with the fewest wildcards (most non-null
 * fields) wins. Ties are broken by the order `rules` was passed in — callers
 * fetch rules pre-sorted by `updated_at desc`, so a tie resolves to the most
 * recently updated rule.
 *
 * Iterates over PROFILE_DIMENSIONS rather than hardcoding each field, so
 * adding a new matching dimension (see profile-dimensions.ts) never requires
 * touching this function.
 */

function fieldMatches(ruleValue: string | null, profileValue: string | null): boolean {
  return ruleValue === null || ruleValue === profileValue;
}

function specificity(rule: MortgageRule): number {
  return PROFILE_DIMENSIONS.filter((dim) => rule[dim.key] !== null).length;
}

export function matchMortgageRule(profile: BorrowerProfile, rules: MortgageRule[]): MortgageRule | null {
  const candidates = rules.filter((rule) =>
    PROFILE_DIMENSIONS.every((dim) => fieldMatches(rule[dim.key], profile[dim.key])),
  );

  if (candidates.length === 0) return null;

  // Stable sort: candidates with equal specificity keep their relative
  // (updated_at desc) order from the input.
  const sorted = [...candidates].sort((a, b) => specificity(b) - specificity(a));
  return sorted[0];
}
