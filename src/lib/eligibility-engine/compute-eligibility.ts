import type { EligibilityReason, EligibilityVerdict } from "./types";

/**
 * Pure evaluation logic for the Eligibility Engine (Sprint 6.3C) — no DB
 * access, mirrors `src/lib/dsr-knowledge/compute-dsr.ts`'s "pure function
 * over already-verified inputs" shape. Never throws: this function assumes
 * `dsrResult`/`propertyResult` were already extracted from real, verified
 * `derivation_results` rows by the caller (`actions.ts`) — it only evaluates
 * already-validated numbers against already-validated caller-supplied
 * figures.
 *
 * `propertyValue` and `requestedTenureYears` are caller-supplied external
 * inputs, same "external input" boundary DSR drew around
 * `proposedInstalmentAmount` (docs/decisions/0012) — `loan_cases` has no
 * property-value or requested-tenure columns, and this function does not
 * infer them from anything else.
 */
export function computeEligibility(
  dsrResult: { passed: boolean | null; dsrRatio: number },
  propertyResult: { marginOfFinancePercentage: number | null; maxTenureYears: number | null },
  requestedLoanAmount: number,
  propertyValue: number,
  requestedTenureYears: number,
): { verdict: EligibilityVerdict["verdict"]; reasons: EligibilityReason[] } {
  const reasons: EligibilityReason[] = [];

  // --- DSR check -----------------------------------------------------------
  // dsrResult.passed is null when the matched DSR rule has no
  // maxDsrPercentage configured yet (see compute-dsr.ts) — inconclusive, not
  // a failure.
  if (dsrResult.passed === true) {
    reasons.push({
      check: "dsr",
      result: "pass",
      detail: `DSR ratio of ${dsrResult.dsrRatio.toFixed(2)}% is within the configured maximum.`,
      value: dsrResult.dsrRatio,
    });
  } else if (dsrResult.passed === false) {
    reasons.push({
      check: "dsr",
      result: "fail",
      detail: `DSR ratio of ${dsrResult.dsrRatio.toFixed(2)}% exceeds the configured maximum.`,
      value: dsrResult.dsrRatio,
    });
  } else {
    reasons.push({
      check: "dsr",
      result: "not_configured",
      detail: `DSR ratio of ${dsrResult.dsrRatio.toFixed(2)}% could not be evaluated against a maximum because no maxDsrPercentage is configured on the matched DSR rule yet.`,
      value: dsrResult.dsrRatio,
    });
  }

  // --- Margin-of-finance check -----------------------------------------
  // `actualMarginPercentage` is fully computable from the two raw inputs
  // (requestedLoanAmount, propertyValue) independent of whether a threshold
  // is configured to compare it against — so it's computed unconditionally
  // once propertyValue is usable, and included as `value` on every one of
  // the pass/fail/not_configured outcomes below, not just pass/fail. Only
  // `propertyValue <= 0` (genuinely uncomputable — division by a
  // non-positive number) skips computing it entirely. `EligibilityReason`
  // has no dedicated field for two separate raw inputs, so
  // requestedLoanAmount/propertyValue are appended to `detail` in every
  // branch below (not just the propertyValue <= 0 one) so a persisted
  // verdict's `reasons` alone are always sufficient to reconstruct "what
  // numbers were actually used here" — the Frozen Decision Principle this
  // table exists for.
  if (propertyValue <= 0) {
    reasons.push({
      check: "margin_of_finance",
      result: "not_configured",
      detail: `Margin-of-finance could not be evaluated because the supplied property value (${propertyValue}) is not a positive number — this is a data problem, not a missing bank policy. (requested RM${requestedLoanAmount} against a property value of RM${propertyValue})`,
      threshold: propertyResult.marginOfFinancePercentage ?? undefined,
    });
  } else {
    const actualMarginPercentage = (requestedLoanAmount / propertyValue) * 100;
    const rawInputsSuffix = ` (requested RM${requestedLoanAmount} against a property value of RM${propertyValue})`;

    if (propertyResult.marginOfFinancePercentage === null) {
      reasons.push({
        check: "margin_of_finance",
        result: "not_configured",
        detail: `Margin-of-finance of ${actualMarginPercentage.toFixed(2)}% could not be evaluated against a maximum because no marginOfFinancePercentage is configured on the matched property rule yet.${rawInputsSuffix}`,
        value: actualMarginPercentage,
      });
    } else {
      const passed = actualMarginPercentage <= propertyResult.marginOfFinancePercentage;
      reasons.push({
        check: "margin_of_finance",
        result: passed ? "pass" : "fail",
        detail:
          (passed
            ? `Requested margin of finance of ${actualMarginPercentage.toFixed(2)}% is within the maximum of ${propertyResult.marginOfFinancePercentage}%.`
            : `Requested margin of finance of ${actualMarginPercentage.toFixed(2)}% exceeds the maximum of ${propertyResult.marginOfFinancePercentage}%.`) + rawInputsSuffix,
        value: actualMarginPercentage,
        threshold: propertyResult.marginOfFinancePercentage,
      });
    }
  }

  // --- Tenure check ------------------------------------------------------
  // requestedTenureYears is always known regardless of outcome, so `value`
  // is included on the not_configured branch too, not just pass/fail.
  if (propertyResult.maxTenureYears === null) {
    reasons.push({
      check: "tenure",
      result: "not_configured",
      detail: `Requested tenure of ${requestedTenureYears} years could not be evaluated against a maximum because no maxTenureYears is configured on the matched property rule yet.`,
      value: requestedTenureYears,
    });
  } else {
    const passed = requestedTenureYears <= propertyResult.maxTenureYears;
    reasons.push({
      check: "tenure",
      result: passed ? "pass" : "fail",
      detail: passed
        ? `Requested tenure of ${requestedTenureYears} years is within the maximum of ${propertyResult.maxTenureYears} years.`
        : `Requested tenure of ${requestedTenureYears} years exceeds the maximum of ${propertyResult.maxTenureYears} years.`,
      value: requestedTenureYears,
      threshold: propertyResult.maxTenureYears,
    });
  }

  // --- Verdict -------------------------------------------------------------
  // Any fail -> not_eligible. No fails, all pass -> eligible. No fails, but
  // at least one not_configured -> eligible_with_conditions (nothing
  // outright failed, but the verdict can't be fully confirmed against
  // unconfigured bank policy).
  const hasFail = reasons.some((reason) => reason.result === "fail");
  const hasNotConfigured = reasons.some((reason) => reason.result === "not_configured");

  let verdict: EligibilityVerdict["verdict"];
  if (hasFail) {
    verdict = "not_eligible";
  } else if (hasNotConfigured) {
    verdict = "eligible_with_conditions";
  } else {
    verdict = "eligible";
  }

  return { verdict, reasons };
}
