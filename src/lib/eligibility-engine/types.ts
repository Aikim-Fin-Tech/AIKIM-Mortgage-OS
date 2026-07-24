/**
 * Client-safe types for the Eligibility Engine (Sprint 6.3C). Mirrors the
 * two tables created by
 * supabase/migrations/20260730010000_eligibility_engine_schema.sql
 * (camelCase, same convention as src/lib/dsr-knowledge/types.ts and
 * src/lib/property-rules-knowledge/types.ts).
 *
 * `eligibility_verdict_derivation_results` (the reasoning-chain join table)
 * has no client-facing shape of its own here — it is written exclusively by
 * the `create_eligibility_verdict` RPC and never read directly by name; a
 * verdict's contributing derivation results are reachable via that join, not
 * modeled as a standalone TypeScript type in this Sprint's scope.
 */

/**
 * The 3-value closed set the `eligibility_verdicts.verdict` CHECK constraint
 * enforces at the database layer (20260730010000_eligibility_engine_schema.sql).
 */
export type EligibilityVerdictOutcome = "eligible" | "not_eligible" | "eligible_with_conditions";

/**
 * The 3 checks this Sprint's Eligibility Engine evaluates. Kept as a closed
 * union (not a bare string) so a caller can exhaustively switch over it.
 */
export type EligibilityCheckName = "dsr" | "margin_of_finance" | "tenure";

/**
 * The 3 possible outcomes of a single check. `"not_configured"` is
 * deliberately distinct from `"fail"` — it means the underlying bank policy
 * value (e.g. `maxDsrPercentage`, `marginOfFinancePercentage`,
 * `maxTenureYears`) has not been configured yet, so the check is
 * inconclusive rather than a genuine policy violation. See
 * `compute-eligibility.ts` for exactly which conditions produce each
 * outcome.
 */
export type EligibilityCheckResult = "pass" | "fail" | "not_configured";

/**
 * One structured, machine-inspectable reason contributing to a verdict — the
 * DB PRD's "structured, human-readable list of reasons, so a rejection or
 * condition traces to a specific rule/derivation result, not an opaque
 * score" (Section 3.9), and the architecture doc's Explainable AI
 * requirement (Section 6). `detail` is the human-readable prose; `check`/
 * `result` are what make this genuinely machine-inspectable rather than just
 * a sentence a UI happens to render as-is. `value`/`threshold` are included
 * whenever the check produced comparable numbers (omitted, not `null`, when
 * a check is `not_configured` for a reason that has no comparable numeric
 * value at all, e.g. a missing policy threshold) so a reader can see exactly
 * what was compared without re-parsing `detail`.
 */
export type EligibilityReason = {
  check: EligibilityCheckName;
  result: EligibilityCheckResult;
  detail: string;
  value?: number;
  threshold?: number;
};

/**
 * One `eligibility_verdicts` row (Sprint 6.3C, DB PRD Section 3.9), mapped
 * to camelCase. Append-only, frozen computation-time snapshot — never
 * recomputed live, never updated after insert (see the schema migration's
 * "Frozen Decision Principle" note).
 */
export type EligibilityVerdict = {
  id: string;
  loanCaseId: string;
  bankProductId: string;
  verdict: EligibilityVerdictOutcome;
  reasons: EligibilityReason[];
  computedAt: string;
  /** Nullable — a system recomputation may have no acting user, mirrored from the column's own nullability. */
  requestedByUserId: string | null;
};
