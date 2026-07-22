import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ArrowLeftIcon } from "@/components/dashboard/icons";
import { statusBadgeVariant } from "@/lib/loan-cases-data";
import { StatusChanger } from "./StatusChanger";
import type { CaseDetail } from "@/lib/database/loan-case-details";

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-MY", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kuala_Lumpur",
  }).format(new Date(iso));
}

export function LoanCaseHeader({ caseDetail, customerName, bankerName }: {
  caseDetail: CaseDetail;
  customerName: string;
  bankerName: string;
}) {
  return (
    <div>
      <Link
        href="/loan-cases"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        Back to Loan Cases
      </Link>

      <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">{caseDetail.caseNumber}</h1>
            <Badge variant={statusBadgeVariant[caseDetail.status]}>{caseDetail.status}</Badge>
            <StatusChanger caseNumber={caseDetail.caseNumber} currentStatus={caseDetail.status} />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {caseDetail.propertyProject} &middot; {customerName}
          </p>

          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Loan Amount</dt>
              <dd className="mt-0.5 font-semibold text-slate-900">
                RM {caseDetail.loanAmount.toLocaleString("en-MY")}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Current Stage</dt>
              <dd className="mt-0.5 text-slate-900">{caseDetail.stage}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Assigned Banker</dt>
              <dd className="mt-0.5 text-slate-900">{bankerName}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Created</dt>
              <dd className="mt-0.5 text-slate-900">{formatDate(caseDetail.createdAt)}</dd>
            </div>
          </dl>
          <p className="mt-2 text-xs text-slate-400">Last updated {formatDate(caseDetail.updatedAt)}</p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            disabled
            title="Coming in next sprint"
            className="cursor-not-allowed rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-400"
          >
            Edit Case
          </button>
          <button
            type="button"
            disabled
            title="Coming in next sprint"
            className="cursor-not-allowed rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-400"
          >
            Add Note
          </button>
          <button
            type="button"
            disabled
            title="Coming in next sprint"
            className="cursor-not-allowed rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-400"
          >
            Update Stage
          </button>
        </div>
      </div>
    </div>
  );
}
