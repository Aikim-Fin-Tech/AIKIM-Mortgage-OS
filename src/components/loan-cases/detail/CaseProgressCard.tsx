import { Badge } from "@/components/ui/badge";
import { stages, statusBadgeVariant } from "@/lib/loan-cases-data";
import type { CaseDetail } from "@/lib/database/loan-case-details";
import type { ReactNode } from "react";

export function CaseProgressCard({ caseDetail }: { caseDetail: CaseDetail }) {
  const currentStageIndex = stages.indexOf(caseDetail.stage);
  const isRejected = caseDetail.status === "Rejected";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">Case Progress</h2>
        <Badge variant={statusBadgeVariant[caseDetail.status]}>{caseDetail.status}</Badge>
      </div>

      <ol className="mt-4 space-y-4">
        {stages.map((stage, index) => {
          const isPast = index < currentStageIndex;
          const isCurrent = index === currentStageIndex;

          let circleClasses = "border border-slate-200 text-slate-300";
          let content: ReactNode = index + 1;
          let labelClasses = "text-slate-600";

          if (isPast) {
            circleClasses = "bg-emerald-600 text-white";
            content = "✓";
          }

          if (isCurrent) {
            if (isRejected) {
              circleClasses = "bg-rose-600 text-white";
              content = "✕";
              labelClasses = "font-semibold text-rose-700";
            } else {
              circleClasses = "border-2 border-emerald-600 text-emerald-600";
              labelClasses = "font-semibold text-slate-900";
            }
          }

          return (
            <li key={stage} className="flex items-center gap-3">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${circleClasses}`}
              >
                {content}
              </span>
              <span className={`text-sm ${labelClasses}`}>{stage}</span>
            </li>
          );
        })}
      </ol>

      {isRejected && (
        <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
          This case was rejected and will not proceed further.
        </p>
      )}
    </div>
  );
}
