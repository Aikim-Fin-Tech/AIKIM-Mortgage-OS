import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { statusBadgeVariant } from "@/lib/loan-cases-data";
import type { RecentCase } from "@/lib/database/dashboard";

function formatUpdatedAt(iso: string): string {
  return new Intl.DateTimeFormat("en-MY", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kuala_Lumpur",
  }).format(new Date(iso));
}

export function RecentCasesTable({ cases }: { cases: RecentCase[] }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
        <h2 className="text-base font-semibold text-slate-900">Recent Loan Cases</h2>
        <Link href="/loan-cases" className="text-sm font-medium text-emerald-600 hover:text-emerald-700">
          View all
        </Link>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
              <th className="px-5 py-3 font-medium sm:px-6">Case ID</th>
              <th className="px-5 py-3 font-medium sm:px-6">Customer</th>
              <th className="px-5 py-3 font-medium sm:px-6">Property</th>
              <th className="px-5 py-3 font-medium sm:px-6">Loan Amount</th>
              <th className="px-5 py-3 font-medium sm:px-6">Assigned Banker</th>
              <th className="px-5 py-3 font-medium sm:px-6">Stage</th>
              <th className="px-5 py-3 font-medium sm:px-6">Status</th>
              <th className="px-5 py-3 font-medium sm:px-6">Last Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {cases.map((loanCase) => (
              <tr key={loanCase.id} className="transition-colors hover:bg-slate-50">
                <td className="px-5 py-3.5 font-medium text-slate-900 sm:px-6">
                  <Link href={`/loan-cases/${loanCase.id}`} className="hover:text-emerald-700">
                    {loanCase.id}
                  </Link>
                </td>
                <td className="px-5 py-3.5 text-slate-600 sm:px-6">{loanCase.customer}</td>
                <td className="px-5 py-3.5 text-slate-600 sm:px-6">{loanCase.project}</td>
                <td className="px-5 py-3.5 text-slate-600 sm:px-6">
                  RM {loanCase.loanAmount.toLocaleString("en-MY")}
                </td>
                <td className="px-5 py-3.5 text-slate-600 sm:px-6">{loanCase.banker}</td>
                <td className="px-5 py-3.5 text-slate-600 sm:px-6">{loanCase.stage}</td>
                <td className="px-5 py-3.5 sm:px-6">
                  <Badge variant={statusBadgeVariant[loanCase.status]}>{loanCase.status}</Badge>
                </td>
                <td className="whitespace-nowrap px-5 py-3.5 text-slate-500 sm:px-6">
                  {formatUpdatedAt(loanCase.updatedAt)}
                </td>
              </tr>
            ))}

            {cases.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-10 text-center text-sm text-slate-400 sm:px-6">
                  No loan cases yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
