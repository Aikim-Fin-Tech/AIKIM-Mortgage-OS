"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { statusBadgeVariant } from "@/lib/loan-cases-data";
import { generateCaseNextAction } from "@/app/(app)/loan-cases/[id]/actions";
import type { CaseSummaryData } from "@/lib/case-summary/types";

/**
 * Customer / Employment / Income / Missing Documents / Current Status are
 * all rendered directly from `data` — real data computed server-side by
 * getCaseSummaryData, zero AI involved. Only "Next Action" is AI-generated,
 * and only when the banker clicks the button — never automatically, and
 * never stored (regenerated fresh each time from current data).
 */
export function CaseSummaryCard({ caseNumber, data }: { caseNumber: string; data: CaseSummaryData }) {
  const [nextAction, setNextAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  async function handleGenerate() {
    setIsGenerating(true);
    setError(null);
    const result = await generateCaseNextAction(caseNumber);
    setIsGenerating(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    setNextAction(result.nextAction);
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <h2 className="text-base font-semibold text-slate-900">Case Summary</h2>

      <dl className="mt-4 space-y-3 text-sm">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Customer</dt>
          <dd className="mt-0.5 text-slate-900">{data.customerName}</dd>
        </div>

        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Employment</dt>
          <dd className="mt-0.5 text-slate-900">
            {data.hasIncomeData ? (data.employerName ?? "Not stated on the salary slip") : "No salary slip processed yet"}
          </dd>
        </div>

        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Income</dt>
          <dd className="mt-0.5 text-slate-900">
            {data.hasIncomeData
              ? `Basic RM ${data.basicSalary?.toLocaleString("en-MY") ?? "—"} · Net RM ${data.netSalary?.toLocaleString("en-MY") ?? "—"}`
              : "Unknown — extract a salary slip on the Documents tab"}
          </dd>
        </div>

        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Missing Documents</dt>
          <dd className="mt-0.5 text-slate-900">
            {data.missingDocuments.length === 0 ? "None outstanding" : data.missingDocuments.join(", ")}
          </dd>
        </div>

        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Current Status</dt>
          <dd className="mt-0.5 flex items-center gap-2 text-slate-900">
            <span>{data.stage}</span>
            <Badge variant={statusBadgeVariant[data.status]}>{data.status}</Badge>
          </dd>
        </div>

        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Next Action</dt>
          {nextAction ? (
            <dd className="mt-0.5 text-slate-900">{nextAction}</dd>
          ) : (
            <dd className="mt-1.5">
              <Button type="button" variant="outline" size="sm" onClick={handleGenerate} disabled={isGenerating}>
                {isGenerating ? "Generating..." : "Generate Suggestion"}
              </Button>
            </dd>
          )}
          {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
        </div>
      </dl>
    </div>
  );
}
