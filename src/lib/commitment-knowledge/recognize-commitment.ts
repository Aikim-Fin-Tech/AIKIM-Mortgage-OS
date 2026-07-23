import type { CommitmentRecognitionRule } from "./types";

/**
 * Pure computation function — no DB access, easy to unit test. Given a
 * matched CommitmentRecognitionRule, one raw commitment figure (e.g. an
 * outstanding instalment amount — there is no rolling-average concept for
 * commitments, unlike income), and whether the borrower has declared this
 * commitment will be settled before/at drawdown, returns the recognized
 * amount.
 *
 * The "to be settled" exclusion is checked first, before even looking at
 * recognitionMethod: if the borrower has declared the commitment will be
 * settled AND the matched rule allows that exclusion, the commitment is
 * fully excluded (recognized amount = 0), regardless of what
 * recognitionMethod would otherwise compute. The success case's
 * `settlementExclusionApplied` flag surfaces exactly this condition back to
 * the caller — `true` only when both `isToBeSettled` and
 * `rule.allowsToBeSettledExclusion` were true — so a caller persisting this
 * result (e.g. computeCommitmentRecognition writing to
 * `derivation_results.result_value`) can record *why* a recognized amount is
 * zero, not just that it is: a `full_instalment` computation on a
 * genuinely zero-balance commitment also recognizes to 0, and without this
 * flag the two cases are indistinguishable after the fact.
 *
 * `recognitionMethod` is open text (no CHECK constraint, no closed set), not
 * a closed union like income's — this function does not attempt an
 * exhaustive switch. It handles the known values it can reason about safely
 * and returns a clear `{ error }` for anything else, rather than throwing or
 * guessing. Never throws for a data-shape or vocabulary problem — same
 * "expected, not exceptional" posture as recognize-income.ts, but here an
 * unrecognized recognitionMethod is itself an expected, normal outcome given
 * the open vocabulary (not a programmer error), so there is no `default:
 * throw` exhaustiveness guard here.
 */
export type RecognizeCommitmentResult = { recognizedAmount: number; settlementExclusionApplied: boolean } | { error: string };

const PERCENTAGE_BASED_METHODS = new Set(["percentage_of_limit"]);

export function recognizeCommitment(rule: CommitmentRecognitionRule, rawFigure: number, isToBeSettled: boolean): RecognizeCommitmentResult {
  if (isToBeSettled && rule.allowsToBeSettledExclusion) {
    return { recognizedAmount: 0, settlementExclusionApplied: true };
  }

  if (rule.recognitionMethod === null || rule.recognitionMethod === "full_instalment") {
    return { recognizedAmount: rawFigure, settlementExclusionApplied: false };
  }

  if (PERCENTAGE_BASED_METHODS.has(rule.recognitionMethod)) {
    if (rule.recognitionPercentage === null) {
      return {
        error: `Rule "${rule.ruleName}" uses recognition_method = ${rule.recognitionMethod} but has no recognitionPercentage configured.`,
      };
    }
    return { recognizedAmount: rawFigure * (rule.recognitionPercentage / 100), settlementExclusionApplied: false };
  }

  return {
    error: `Rule "${rule.ruleName}" uses an unrecognized recognition_method ("${rule.recognitionMethod}") that this function does not know how to compute.`,
  };
}
