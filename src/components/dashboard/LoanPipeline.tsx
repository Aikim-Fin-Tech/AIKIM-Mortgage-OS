import type { PipelineStageCount } from "@/lib/database/dashboard";
import type { LoanStage } from "@/lib/loan-cases-data";

const STAGE_COLORS: Record<LoanStage, string> = {
  "New Enquiry": "bg-sky-500",
  "Document Collection": "bg-amber-500",
  "Credit Review": "bg-violet-500",
  "Bank Submission": "bg-orange-500",
  Approved: "bg-emerald-500",
};

export function LoanPipeline({ pipeline }: { pipeline: PipelineStageCount[] }) {
  const max = Math.max(1, ...pipeline.map((stage) => stage.count));

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">Loan Pipeline</h2>
        <span className="text-xs text-slate-400">All time</span>
      </div>

      <div className="mt-5 space-y-4">
        {pipeline.map((stage) => (
          <div key={stage.stage}>
            <div className="mb-1.5 flex items-center justify-between text-sm">
              <span className="font-medium text-slate-700">{stage.stage}</span>
              <span className="font-semibold text-slate-900">{stage.count}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full ${STAGE_COLORS[stage.stage]}`}
                style={{ width: `${(stage.count / max) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
