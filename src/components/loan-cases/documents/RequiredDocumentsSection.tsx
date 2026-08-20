import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { RequiredDocumentRow } from "@/lib/mortgage-rules/types";
import type { BadgeVariant } from "@/components/ui/badge";

const STATUS_LABEL: Record<RequiredDocumentRow["status"], string> = {
  completed: "Completed",
  missing: "Pending",
  not_required: "Not Required",
};

const STATUS_VARIANT: Record<RequiredDocumentRow["status"], BadgeVariant> = {
  completed: "success",
  missing: "warning",
  not_required: "default",
};

export function RequiredDocumentsSection({
  rows,
  completionPercent,
  error = null,
}: {
  rows: RequiredDocumentRow[];
  completionPercent: number | null;
  /** A genuine query/load failure — distinct from "no rule matched yet", which is just an empty rows array. */
  error?: string | null;
}) {
  const activeRows = rows.filter((r) => r.status !== "not_required");
  const completedCount = activeRows.filter((r) => r.status === "completed").length;
  const pendingCount = activeRows.filter((r) => r.status === "missing").length;

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <h2 className="text-base font-semibold text-slate-900">Required Documents</h2>

        <div className="grid grid-cols-3 gap-3 sm:flex sm:items-center sm:gap-6">
          <div className="text-center sm:text-right">
            <p className="text-lg font-semibold text-slate-900">{completedCount}</p>
            <p className="text-xs text-slate-400">Completed</p>
          </div>
          <div className="text-center sm:text-right">
            <p className="text-lg font-semibold text-slate-900">{pendingCount}</p>
            <p className="text-xs text-slate-400">Pending</p>
          </div>
          <div className="text-center sm:text-right">
            <p className="text-lg font-semibold text-emerald-600">
              {completionPercent === null ? "—" : `${completionPercent}%`}
            </p>
            <p className="text-xs text-slate-400">Overall Completion</p>
          </div>
        </div>
      </div>

      {error ? (
        <div className="m-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 sm:m-5">
          Required Documents could not be loaded right now. The list below may be incomplete or stale.
        </div>
      ) : null}

      {!error && activeRows.length === 0 ? (
        <p className="p-6 text-sm text-slate-400">
          No mortgage rule has matched this case&rsquo;s borrower profile yet. Set Nationality, Income Country,
          Employment Type, and Income Structure in the Overview tab to generate a required document checklist.
        </p>
      ) : null}

      {!error && activeRows.length > 0 ? (
        <Table>
          <TableHeader>
            <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
              <TableHead>Category</TableHead>
              <TableHead>Document Name</TableHead>
              <TableHead>Required Months</TableHead>
              <TableHead>Mandatory</TableHead>
              <TableHead>Extraction</TableHead>
              <TableHead>Status</TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {activeRows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.categoryName ?? "Uncategorized"}</TableCell>
                <TableCell className="font-medium text-slate-900">{row.documentName}</TableCell>
                <TableCell>{row.requiredMonths ? `${row.requiredMonths} months` : "-"}</TableCell>
                <TableCell>{row.isMandatory === true ? <Badge variant="default">Mandatory</Badge> : null}</TableCell>
                <TableCell>
                  {row.ocrKind === null ? <Badge variant="info">Manual review</Badge> : null}
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[row.status]}>{STATUS_LABEL[row.status]}</Badge>
                  <span className="ml-2 text-xs text-slate-400">
                    ({row.uploadedCount}/{row.requiredCount})
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
    </div>
  );
}
