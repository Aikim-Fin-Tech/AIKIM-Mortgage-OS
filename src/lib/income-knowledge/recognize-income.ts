import type { IncomeRecognitionRule } from "./types";

/**
 * Pure computation function — no DB access, easy to unit test. Given a
 * matched IncomeRecognitionRule and one or more raw income figures (already
 * extracted from Evidence.value by the caller), returns the recognized
 * amount per `recognitionMethod`.
 *
 * `rawFigures` is ordered most-recent-first (index 0 = the latest captured
 * figure) — `full_value` and `percentage_haircut` use only `rawFigures[0]`;
 * `rolling_average` averages the first `averagingWindowMonths` entries.
 * Callers (e.g. computeIncomeRecognition in actions.ts) are responsible for
 * sorting Evidence rows by `capturedAt` descending before calling this.
 *
 * `haircutPercentage` means "% of the raw figure recognized" (e.g. 90 means
 * 90% is kept), not "% cut away" — the formula below is
 * `rawFigures[0] * (haircutPercentage / 100)`.
 *
 * Never throws for a data-shape problem (missing haircut percentage,
 * insufficient history, no figures supplied) — those are data-integrity
 * expectations returned as `{ error }`, not exceptions. An exception here
 * would only mean a genuine programmer error (e.g. an unhandled
 * `recognitionMethod` value that the type system should have prevented).
 */
export type RecognizeIncomeResult = { recognizedAmount: number } | { error: string };

export function recognizeIncome(rule: IncomeRecognitionRule, rawFigures: number[]): RecognizeIncomeResult {
  if (rawFigures.length === 0) {
    return { error: `No income figures were supplied to recognize against rule "${rule.ruleName}".` };
  }

  switch (rule.recognitionMethod) {
    case "full_value":
      return { recognizedAmount: rawFigures[0] };

    case "percentage_haircut": {
      if (rule.haircutPercentage === null) {
        return {
          error: `Rule "${rule.ruleName}" uses recognition_method = percentage_haircut but has no haircutPercentage configured.`,
        };
      }
      return { recognizedAmount: rawFigures[0] * (rule.haircutPercentage / 100) };
    }

    case "rolling_average": {
      if (rule.averagingWindowMonths === null) {
        return {
          error: `Rule "${rule.ruleName}" uses recognition_method = rolling_average but has no averagingWindowMonths configured.`,
        };
      }
      if (rawFigures.length < rule.averagingWindowMonths) {
        return {
          error: `Rule "${rule.ruleName}" requires ${rule.averagingWindowMonths} month(s) of history but only ${rawFigures.length} figure(s) were supplied.`,
        };
      }
      const window = rawFigures.slice(0, rule.averagingWindowMonths);
      const sum = window.reduce((total, figure) => total + figure, 0);
      return { recognizedAmount: sum / rule.averagingWindowMonths };
    }

    default: {
      // Exhaustiveness guard: unreachable given IncomeRecognitionRule's
      // recognitionMethod union type. If a new method value is ever added
      // without updating this switch, that's a genuine programmer error —
      // the one case this function is allowed to throw for.
      const exhaustiveCheck: never = rule.recognitionMethod;
      throw new Error(`Unhandled income recognition method: ${String(exhaustiveCheck)}`);
    }
  }
}
