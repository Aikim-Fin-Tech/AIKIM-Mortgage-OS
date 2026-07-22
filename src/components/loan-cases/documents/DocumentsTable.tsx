"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DownloadIcon, EyeIcon, TrashIcon } from "@/components/dashboard/icons";
import { DOCUMENT_STATUS_VARIANT, formatFileSize } from "@/lib/documents/document-status";
import type { DocumentExtractionSummary, LoanCaseDocument } from "@/lib/database/documents";
import type { NricFields, SalarySlipFields } from "@/lib/ocr/types";

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-MY", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kuala_Lumpur",
  }).format(new Date(iso));
}

function ExtractedFieldsSummary({ extraction }: { extraction: DocumentExtractionSummary }) {
  if (extraction.error) {
    return <span className="text-xs text-rose-600">Extraction failed</span>;
  }
  if (!extraction.fields) {
    return <span className="text-xs text-slate-400">No data found</span>;
  }
  if (extraction.kind === "nric") {
    const fields = extraction.fields as NricFields;
    return (
      <span className="text-xs text-slate-600">
        {fields.fullName ?? "—"}
        <br />
        {fields.nricNumber ?? "—"}
      </span>
    );
  }
  const fields = extraction.fields as SalarySlipFields;
  return (
    <span className="text-xs text-slate-600">
      {fields.employerName ?? "—"}
      <br />
      Net: {fields.netSalary != null ? `RM ${fields.netSalary.toLocaleString("en-MY")}` : "—"}
    </span>
  );
}

export function DocumentsTable({
  documents,
  pendingDocumentId,
  onPreview,
  onDownload,
  onDelete,
  onExtract,
}: {
  documents: LoanCaseDocument[];
  pendingDocumentId: string | null;
  onPreview: (doc: LoanCaseDocument) => void;
  onDownload: (doc: LoanCaseDocument) => void;
  onDelete: (doc: LoanCaseDocument) => void;
  onExtract: (doc: LoanCaseDocument) => void;
}) {
  if (documents.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-400 shadow-sm">
        No documents have been uploaded to this case yet.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <Table>
        <TableHeader>
          <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
            <TableHead>File Name</TableHead>
            <TableHead>Document Type</TableHead>
            <TableHead>Uploaded By</TableHead>
            <TableHead>Uploaded Time</TableHead>
            <TableHead>File Size</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Extracted Data</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </tr>
        </TableHeader>
        <TableBody>
          {documents.map((doc) => {
            const isPending = pendingDocumentId === doc.id;
            return (
              <TableRow key={doc.id}>
                <TableCell className="max-w-[220px] truncate font-medium text-slate-900">
                  {doc.fileName ?? "Untitled document"}
                </TableCell>
                <TableCell>{doc.documentType ?? "General Document"}</TableCell>
                <TableCell>{doc.uploadedByName ?? "Unknown"}</TableCell>
                <TableCell>{formatDateTime(doc.uploadedAt)}</TableCell>
                <TableCell>{formatFileSize(doc.fileSize)}</TableCell>
                <TableCell>
                  <Badge variant={DOCUMENT_STATUS_VARIANT[doc.status] ?? "default"}>{doc.statusLabel}</Badge>
                </TableCell>
                <TableCell>
                  {!doc.ocrKind ? (
                    <span className="text-xs text-slate-300">-</span>
                  ) : doc.latestExtraction ? (
                    <div className="flex items-center gap-2">
                      <ExtractedFieldsSummary extraction={doc.latestExtraction} />
                      <Button type="button" variant="ghost" size="sm" disabled={isPending} onClick={() => onExtract(doc)}>
                        Re-extract
                      </Button>
                    </div>
                  ) : (
                    <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={() => onExtract(doc)}>
                      {isPending ? "Extracting..." : "Extract Data"}
                    </Button>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      title="Preview"
                      disabled={isPending}
                      onClick={() => onPreview(doc)}
                    >
                      <EyeIcon className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      title="Download"
                      disabled={isPending}
                      onClick={() => onDownload(doc)}
                    >
                      <DownloadIcon className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      title="Delete"
                      disabled={isPending}
                      className="text-rose-600 hover:bg-rose-50"
                      onClick={() => onDelete(doc)}
                    >
                      <TrashIcon className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
