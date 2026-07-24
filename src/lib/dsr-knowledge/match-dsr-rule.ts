import type { DsrRule } from "./types";

/**
 * Pure, dependency-free matching algorithm — no DB access, easy to unit
 * test. DSR's matching shape is genuinely different from both prior
 * domains' matchers (src/lib/income-knowledge/match-income-rule.ts,
 * src/lib/commitment-knowledge/match-commitment-rule.ts): its third
 * dimension is a numeric RANGE test against a recognized-income figure, not
 * a wildcard-equality test, per the design note in
 * supabase/migrations/20260728010000_dsr_knowledge_schema.sql. Deliberately
 * does NOT reuse the equality-wildcard helper pattern for that dimension —
 * written explicitly here instead:
 *
 *   (incomeTierLowerBound === null || recognizedIncome >= incomeTierLowerBound)
 *   AND (incomeTierUpperBound === null || recognizedIncome < incomeTierUpperBound)
 *
 * Matching dimensions:
 *   - `bankId` — required exact match, never a wildcard.
 *   - `bankProductId` — nullable-is-wildcard, most-specific-wins, same
 *     convention as every other rule table.
 *   - the income-tier range above.
 *
 * Specificity/most-specific-wins is extended to 3 dimensions instead of 1:
 * `bankProductId !== null` (1 point) PLUS `incomeTierLowerBound !== null`
 * (1 point) PLUS `incomeTierUpperBound !== null` (1 point) — a rule with a
 * tighter tier restriction is more specific, same "fewer wildcards wins"
 * spirit as every other matcher. Ties (including a single unambiguous
 * match) are broken by a stable sort that preserves caller-supplied order
 * — callers should pass rules pre-sorted by `updated_at desc`, matching the
 * other two matchers' own convention, so a tie resolves to the most
 * recently updated rule.
 */

function bankProductMatches(ruleBankProductId: string | null, bankProductId: string | null): boolean {
  return ruleBankProductId === null || ruleBankProductId === bankProductId;
}

function incomeTierMatches(rule: DsrRule, recognizedIncome: number): boolean {
  const lowerOk = rule.incomeTierLowerBound === null || recognizedIncome >= rule.incomeTierLowerBound;
  const upperOk = rule.incomeTierUpperBound === null || recognizedIncome < rule.incomeTierUpperBound;
  return lowerOk && upperOk;
}

function specificity(rule: DsrRule): number {
  const bankProductSpecificity = rule.bankProductId !== null ? 1 : 0;
  const lowerBoundSpecificity = rule.incomeTierLowerBound !== null ? 1 : 0;
  const upperBoundSpecificity = rule.incomeTierUpperBound !== null ? 1 : 0;
  return bankProductSpecificity + lowerBoundSpecificity + upperBoundSpecificity;
}

export function matchDsrRule(bankId: string, bankProductId: string | null, recognizedIncome: number, rules: DsrRule[]): DsrRule | null {
  const candidates = rules.filter(
    (rule) => rule.bankId === bankId && bankProductMatches(rule.bankProductId, bankProductId) && incomeTierMatches(rule, recognizedIncome),
  );

  if (candidates.length === 0) return null;

  // Stable sort: candidates with equal specificity keep their relative
  // (caller-supplied) order.
  const sorted = [...candidates].sort((a, b) => specificity(b) - specificity(a));
  return sorted[0];
}
