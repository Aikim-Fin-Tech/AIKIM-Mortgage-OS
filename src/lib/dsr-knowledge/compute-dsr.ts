import type { DsrRule } from "./types";

/**
 * Pure computation function — no DB access, easy to unit test. Given a
 * matched DsrRule, a total recognized income figure, a total recognized
 * commitments figure, and an already-computed proposed instalment amount,
 * computes the DSR ratio.
 *
 * `proposedInstalmentAmount` is treated as an opaque number supplied by the
 * caller — this function does NOT compute an amortization/stress-tested
 * instalment itself (loan_cases has no tenure/rate columns today; see the
 * DB PRD's framing of DSR's numerator as consuming "external inputs it
 * consumes," not its own data). `stressTestRateBufferPercentage` on the
 * matched rule is surfaced in the result purely as informational
 * pass-through — this function deliberately does NOT apply it to the
 * arithmetic, since a correct application requires redoing the
 * amortization calculation, not a linear scale of the instalment number.
 *
 * `totalRecognizedIncome <= 0` is a real, expected error case (division by
 * zero / a meaningless ratio), not a programmer error — returned as
 * `{ error }`, never thrown, same "expected, not exceptional" posture as
 * recognize-income.ts / recognize-commitment.ts.
 *
 * `passed` is `null` (not `false`) when `rule.maxDsrPercentage` is
 * unconfigured — the ratio is still computable and returned, just not
 * judged against a threshold that doesn't exist yet.
 */
export type ComputeDsrResult =
  | {
      dsrRatio: number;
      maxDsrPercentage: number | null;
      passed: boolean | null;
      stressTestRateBufferPercentage: number | null;
    }
  | { error: string };

export function computeDsr(
  rule: DsrRule,
  totalRecognizedIncome: number,
  totalRecognizedCommitments: number,
  proposedInstalmentAmount: number,
): ComputeDsrResult {
  if (totalRecognizedIncome <= 0) {
    return { error: "Cannot compute a DSR ratio against zero or negative recognized income." };
  }

  const numerator = totalRecognizedCommitments + proposedInstalmentAmount;
  const dsrRatio = (numerator / totalRecognizedIncome) * 100;
  const passed = rule.maxDsrPercentage === null ? null : dsrRatio <= rule.maxDsrPercentage;

  return {
    dsrRatio,
    maxDsrPercentage: rule.maxDsrPercentage,
    passed,
    stressTestRateBufferPercentage: rule.stressTestRateBufferPercentage,
  };
}
