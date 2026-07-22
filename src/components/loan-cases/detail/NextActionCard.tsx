import { determineNextAction, estimateCompletion } from "@/lib/next-action/determine-next-action";
import { calculateWorkflowProgress } from "@/lib/loan-health/calculate-health-score";
import type { LoanStatus } from "@/lib/loan-cases-data";

/**
 * Rule-based (no AI) — deliberately distinct from the AI Case Summary
 * card's "Next Action" field. "Current Progress" here means workflow/
 * pipeline progress (New -> Approved), not document checklist completion —
 * see ChecklistProgressCard for that.
 */
export function NextActionCard({
  status,
  hasAnyRequirements,
  missingDocuments,
}: {
  status: LoanStatus;
  hasAnyRequirements: boolean;
  missingDocuments: string[];
}) {
  const nextAction = determineNextAction({ status, hasAnyRequirements, missingDocuments });
  const progress = calculateWorkflowProgress(status);
  const completion = estimateCompletion(status);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <h2 className="text-base font-semibold text-slate-900">Next Action</h2>

      <p className="mt-3 text-sm text-slate-900">{nextAction}</p>

      <div className="mt-4">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>Current Progress</span>
          <span>{progress}%</span>
        </div>
        <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-sky-500 transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="mt-4">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Estimated Completion</p>
        <p className="mt-0.5 text-sm text-slate-900">{completion}</p>
        <p className="mt-0.5 text-xs text-slate-400">A rough estimate based on remaining pipeline steps, not a commitment.</p>
      </div>
    </div>
  );
}
