import type { CommitmentRecognitionRule } from "./types";

/**
 * Pure, dependency-free matching algorithm — no DB access, easy to unit
 * test. Deliberately simpler than src/lib/income-knowledge/match-income-rule.ts:
 * Commitment Recognition has no BorrowerProfile involved in matching at all
 * (per the schema migration's design note — this table has no
 * borrower-profile wildcard columns). Matching dimensions are:
 *
 *   - `bankId` — required exact match, never a wildcard.
 *   - `bankProductId` — nullable-is-wildcard, most-specific-wins, same
 *     convention as every other rule table.
 *   - `commitmentType` — required exact match, never a wildcard (per DB PRD
 *     Section 3.5: "Required, exact match (never a wildcard)").
 *
 * Among matches, most-specific-wins on the single wildcard dimension that
 * exists (a rule with a non-null bankProductId beats one with null). Ties
 * (including the trivial case of a single non-wildcarded match) are broken
 * by a stable sort that preserves caller-supplied order — callers should
 * pass rules pre-sorted by `updated_at desc`, matching match-income-rule.ts's
 * own convention, so a tie resolves to the most recently updated rule.
 */

function bankProductMatches(ruleBankProductId: string | null, bankProductId: string | null): boolean {
  return ruleBankProductId === null || ruleBankProductId === bankProductId;
}

function specificity(rule: CommitmentRecognitionRule): number {
  return rule.bankProductId !== null ? 1 : 0;
}

export function matchCommitmentRecognitionRule(
  bankId: string,
  bankProductId: string | null,
  commitmentType: string,
  rules: CommitmentRecognitionRule[],
): CommitmentRecognitionRule | null {
  const candidates = rules.filter(
    (rule) => rule.bankId === bankId && rule.commitmentType === commitmentType && bankProductMatches(rule.bankProductId, bankProductId),
  );

  if (candidates.length === 0) return null;

  // Stable sort: candidates with equal specificity keep their relative
  // (caller-supplied) order.
  const sorted = [...candidates].sort((a, b) => specificity(b) - specificity(a));
  return sorted[0];
}
