"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DownloadIcon, EyeIcon, TrashIcon } from "@/components/dashboard/icons";
import { DOCUMENT_STATUS_VARIANT, formatFileSize } from "@/lib/documents/document-status";
import { STAFF_ROLES } from "@/lib/auth/staff-roles";
import type { DocumentExtractionSummary, DocumentTypeOption, LoanCaseDocument } from "@/lib/database/documents";
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

/**
 * PD-017 Phase A — `doc.documentType === null` now unambiguously means
 * "auto-classification didn't confidently assign one," since the upload
 * dialog no longer offers a manual "General Document" choice. Only staff
 * (STAFF_ROLES, the same set every write path in this app already uses) get
 * the confirmation control; this is UI visibility only, not the security
 * boundary — assign_document_type's own STAFF_ROLES check plus RLS are what
 * actually enforce it. Only a document_types row already in `documentTypes`
 * can be picked (a native <select>), so there is no free-text/UUID entry
 * path here.
 */
function DocumentTypeCell({
  doc,
  documentTypes,
  userRole,
  isPending,
  onAssignType,
}: {
  doc: LoanCaseDocument;
  documentTypes: DocumentTypeOption[];
  userRole: string | null;
  isPending: boolean;
  onAssignType: (doc: LoanCaseDocument, documentTypeId: string) => void;
}) {
  const [selectedTypeId, setSelectedTypeId] = useState("");

  if (doc.documentType !== null) {
    return <>{doc.documentType}</>;
  }

  if (!userRole || !STAFF_ROLES.has(userRole)) {
    return <Badge variant="warning">Needs type confirmation</Badge>;
  }

  return (
    <div className="flex items-center gap-1.5">
      <Badge variant="warning">Needs type confirmation</Badge>
      <Select
        value={selectedTypeId}
        onChange={(event) => setSelectedTypeId(event.target.value)}
        disabled={isPending}
        className="h-8 text-xs"
      >
        <option value="">Select type…</option>
        {documentTypes.map((type) => (
          <option key={type.id} value={type.id}>
            {type.name}
          </option>
        ))}
      </Select>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isPending || !selectedTypeId}
        onClick={() => onAssignType(doc, selectedTypeId)}
      >
        {isPending ? "Saving..." : "Confirm"}
      </Button>
    </div>
  );
}

export function DocumentsTable({
  documents,
  documentTypes,
  userRole,
  pendingDocumentId,
  onPreview,
  onDownload,
  onDelete,
  onExtract,
  onAssignType,
}: {
  documents: LoanCaseDocument[];
  documentTypes: DocumentTypeOption[];
  userRole: string | null;
  pendingDocumentId: string | null;
  onPreview: (doc: LoanCaseDocument) => void;
  onDownload: (doc: LoanCaseDocument) => void;
  onDelete: (doc: LoanCaseDocument) => void;
  onExtract: (doc: LoanCaseDocument) => void;
  onAssignType: (doc: LoanCaseDocument, documentTypeId: string) => void;
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
                <TableCell>
                  <DocumentTypeCell
                    doc={doc}
                    documentTypes={documentTypes}
                    userRole={userRole}
                    isPending={isPending}
                    onAssignType={onAssignType}
                  />
                </TableCell>
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
