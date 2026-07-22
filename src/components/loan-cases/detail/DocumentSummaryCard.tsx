import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { DocumentSummary } from "@/lib/database/loan-case-details";
import { DOCUMENT_STATUS_VARIANT } from "@/lib/documents/document-status";

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-MY", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kuala_Lumpur",
  }).format(new Date(iso));
}

export function DocumentSummaryCard({
  caseNumber,
  documents,
}: {
  caseNumber: string;
  documents: DocumentSummary;
}) {
  const counters = [
    { label: "Uploaded", value: documents.uploaded },
    { label: "Verified", value: documents.verified },
    { label: "Pending", value: documents.pending },
    { label: "Rejected", value: documents.rejected },
  ];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">Document Summary</h2>
        <Link
          href={`/loan-cases/${caseNumber}/documents`}
          className="text-sm font-medium text-emerald-600 hover:text-emerald-700"
        >
          View All Documents
        </Link>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {counters.map((counter) => (
          <div key={counter.label} className="rounded-lg bg-slate-50 px-3 py-2.5 text-center">
            <p className="text-lg font-semibold text-slate-900">{counter.value}</p>
            <p className="text-xs text-slate-500">{counter.label}</p>
          </div>
        ))}
      </div>

      {documents.recent.length === 0 ? (
        <p className="mt-4 text-sm text-slate-400">No documents have been added to this case.</p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-100">
          {documents.recent.map((doc) => (
            <li key={doc.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-900">{doc.documentType}</p>
                <p className="text-xs text-slate-400">
                  Uploaded {formatDate(doc.uploadedAt)}
                  {doc.verifiedAt ? ` · Verified ${formatDate(doc.verifiedAt)}` : ""}
                </p>
              </div>
              <Badge variant={DOCUMENT_STATUS_VARIANT[doc.status] ?? "default"}>{doc.statusLabel}</Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
