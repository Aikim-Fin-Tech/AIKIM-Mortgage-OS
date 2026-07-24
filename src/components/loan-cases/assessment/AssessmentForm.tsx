"use client";

import { useState, type FormEvent } from "react";
import {
  runMortgageAssessment,
  type RunMortgageAssessmentCommitmentType,
  type RunMortgageAssessmentResult,
} from "@/lib/mortgage-assessment/actions";
import type { EligibilityCheckName, EligibilityCheckResult } from "@/lib/eligibility-engine/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

/**
 * Alpha-001 / "Mortgage Assessment" tab. Deliberately minimal per CTO scope:
 * one form, one Server Action call, a plain read-out of whatever
 * `runMortgageAssessment` returns. No client-side interpretation of the
 * result beyond mapping already-decided enum values to display labels (see
 * coding-standards.md) — every judgment call (income/commitment recognition,
 * DSR, property rules, eligibility verdict) already happened server-side in
 * the 6 domain modules this Server Action orchestrates.
 *
 * `runMortgageAssessment` takes a typed object, not `FormData`, so this
 * component calls it directly from a client-side submit handler rather than
 * via `<form action={...}>` — the same "use server" function imported and
 * awaited directly from a Client Component pattern already used by
 * src/components/dashboard/GlobalSearch.tsx (`await globalSearch(...)`).
 */

const COMMITMENT_TYPE_OPTIONS: { value: RunMortgageAssessmentCommitmentType; label: string }[] = [
  { value: "credit_card", label: "Credit Card" },
  { value: "personal_loan", label: "Personal Loan" },
  { value: "hire_purchase", label: "Hire Purchase" },
  { value: "existing_mortgage", label: "Existing Mortgage" },
];

const VERDICT_LABELS: Record<string, string> = {
  eligible: "Eligible",
  not_eligible: "Not Eligible",
  eligible_with_conditions: "Eligible with Conditions",
};

const CHECK_LABELS: Record<EligibilityCheckName, string> = {
  dsr: "DSR",
  margin_of_finance: "Margin of Finance",
  tenure: "Tenure",
};

const CHECK_RESULT_LABELS: Record<EligibilityCheckResult, string> = {
  pass: "Pass",
  fail: "Fail",
  not_configured: "Not Configured",
};

export function AssessmentForm({ loanCaseId }: { loanCaseId: string }) {
  const [isPending, setIsPending] = useState(false);
  const [result, setResult] = useState<RunMortgageAssessmentResult | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    setIsPending(true);
    setResult(null);
    try {
      const outcome = await runMortgageAssessment({
        loanCaseId,
        incomeFigure: Number(formData.get("incomeFigure")),
        commitmentType: formData.get("commitmentType") as RunMortgageAssessmentCommitmentType,
        commitmentFigure: Number(formData.get("commitmentFigure")),
        isToBeSettled: formData.get("isToBeSettled") === "on",
        propertyType: String(formData.get("propertyType") ?? ""),
        constructionStatus: String(formData.get("constructionStatus") ?? ""),
        occupancyIntent: String(formData.get("occupancyIntent") ?? ""),
        existingPropertyCount: Number(formData.get("existingPropertyCount")),
        proposedInstalmentAmount: Number(formData.get("proposedInstalmentAmount")),
        propertyValue: Number(formData.get("propertyValue")),
        requestedTenureYears: Number(formData.get("requestedTenureYears")),
      });
      setResult(outcome);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleSubmit}
        className="space-y-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Raw Income Figure (RM)</label>
            <Input name="incomeFigure" type="number" min="0" step="0.01" required />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Commitment Type</label>
            <Select name="commitmentType" defaultValue={COMMITMENT_TYPE_OPTIONS[0].value} className="w-full">
              {COMMITMENT_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Commitment Figure (RM)</label>
            <Input name="commitmentFigure" type="number" min="0" step="0.01" required />
          </div>
          <div className="flex items-center gap-2 pt-6">
            <input
              id="isToBeSettled"
              name="isToBeSettled"
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
            <label htmlFor="isToBeSettled" className="text-sm font-medium text-slate-700">
              To be settled before drawdown
            </label>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Property Type</label>
            <Input name="propertyType" type="text" placeholder="e.g. residential" required />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Construction Status</label>
            <Input name="constructionStatus" type="text" placeholder="e.g. completed" required />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Occupancy Intent</label>
            <Input name="occupancyIntent" type="text" placeholder="e.g. owner_occupied" required />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Existing Property Count</label>
            <Input name="existingPropertyCount" type="number" min="0" step="1" required />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Proposed Monthly Instalment (RM)</label>
            <Input name="proposedInstalmentAmount" type="number" min="0" step="0.01" required />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Property Value (RM)</label>
            <Input name="propertyValue" type="number" min="0" step="1000" required />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Requested Tenure (Years)</label>
            <Input name="requestedTenureYears" type="number" min="1" step="1" required />
          </div>
        </div>

        <div className="flex items-center justify-end">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Running..." : "Run Mortgage Assessment"}
          </Button>
        </div>
      </form>

      {result && <AssessmentResult result={result} />}
    </div>
  );
}

function AssessmentResult({ result }: { result: RunMortgageAssessmentResult }) {
  if (!result.success) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-5 shadow-sm sm:p-6">
        <h2 className="text-base font-semibold text-rose-800">Assessment Failed</h2>
        <p className="mt-2 text-sm text-rose-700">
          Failed step: <span className="font-medium">{result.failedStep}</span>
        </p>
        <p className="mt-1 text-sm text-rose-700">{result.error}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <h2 className="text-base font-semibold text-slate-900">Assessment Result</h2>

      <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-slate-700">
        <li>Income recognized: RM {result.recognizedIncomeAmount.toLocaleString("en-MY")}</li>
        <li>Commitment recognized: RM {result.recognizedCommitmentAmount.toLocaleString("en-MY")}</li>
        <li>
          DSR ratio: {result.dsrRatio.toFixed(2)}%{" "}
          {result.dsrPassed === null
            ? "(not configured — expected under this baseline, not an error)"
            : result.dsrPassed
              ? "(pass)"
              : "(fail)"}
        </li>
        <li>
          Margin of finance:{" "}
          {result.marginOfFinancePercentage === null ? "not configured" : `${result.marginOfFinancePercentage}%`}
        </li>
        <li>Max tenure: {result.maxTenureYears === null ? "not configured" : `${result.maxTenureYears} years`}</li>
      </ol>

      <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <p className="text-sm font-medium text-slate-500">Verdict</p>
        <p className="mt-1 text-lg font-semibold text-slate-900">{VERDICT_LABELS[result.verdict] ?? result.verdict}</p>
      </div>

      {result.reasons.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-medium text-slate-700">Reasons</p>
          <ul className="mt-2 space-y-2">
            {result.reasons.map((reason, index) => (
              <li key={index} className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
                <span className="font-medium">{CHECK_LABELS[reason.check] ?? reason.check}</span> —{" "}
                {CHECK_RESULT_LABELS[reason.result] ?? reason.result}: {reason.detail}
                {typeof reason.value === "number" && typeof reason.threshold === "number" && (
                  <span className="text-slate-500">
                    {" "}
                    (value: {reason.value}, threshold: {reason.threshold})
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
