import Link from "next/link";
import type { RequiredDocumentRow } from "@/lib/mortgage-rules/types";

/**
 * Compact "N / M Completed" glance card for the Overview tab — the full
 * per-document Required Documents table lives on the Documents tab
 * (src/components/loan-cases/documents/RequiredDocumentsSection.tsx). Both
 * read from the same getRequiredDocuments data, so they can never disagree.
 */
export function ChecklistProgressCard({ caseNumber, rows }: { caseNumber: string; rows: RequiredDocumentRow[] }) {
  const activeRows = rows.filter((r) => r.status !== "not_required");
  const completedCount = activeRows.filter((r) => r.status === "completed").length;
  const total = activeRows.length;
  const percent = total === 0 ? null : Math.round((completedCount / total) * 100);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">Checklist</h2>
        <Link
          href={`/loan-cases/${caseNumber}/documents`}
          className="text-sm font-medium text-emerald-600 hover:text-emerald-700"
        >
          View Documents
        </Link>
      </div>

      {total === 0 ? (
        <p className="mt-4 text-sm text-slate-400">No required documents yet — set the Borrower Profile below.</p>
      ) : (
        <>
          <p className="mt-3 text-2xl font-semibold text-slate-900">
            {completedCount} / {total} <span className="text-sm font-normal text-slate-400">Completed</span>
          </p>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${percent}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-slate-400">{percent}% complete</p>
        </>
      )}
    </div>
  );
}
