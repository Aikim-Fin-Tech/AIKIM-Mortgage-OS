"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { UploadIcon } from "@/components/dashboard/icons";
import { DocumentsTable } from "./DocumentsTable";
import { DocumentUploadDialog } from "./DocumentUploadDialog";
import { DocumentPreviewModal } from "./DocumentPreviewModal";
import {
  deleteDocumentAction,
  getDocumentSignedUrlAction,
  extractDocumentData,
} from "@/app/(app)/loan-cases/[id]/documents/actions";
import type { DocumentTypeOption, LoanCaseDocument } from "@/lib/database/documents";

type PreviewState = {
  doc: LoanCaseDocument;
  url: string | null;
  isLoading: boolean;
  error: string | null;
};

export function DocumentsPanel({
  caseNumber,
  loanCaseId,
  documents,
  documentTypes,
}: {
  caseNumber: string;
  loanCaseId: string;
  documents: LoanCaseDocument[];
  documentTypes: DocumentTypeOption[];
}) {
  const router = useRouter();
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [pendingDocumentId, setPendingDocumentId] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  function handleUploaded() {
    setIsUploadOpen(false);
    router.refresh();
  }

  async function handlePreview(doc: LoanCaseDocument) {
    setListError(null);
    setPreview({ doc, url: null, isLoading: true, error: null });
    const result = await getDocumentSignedUrlAction(caseNumber, doc.id);
    setPreview({ doc, url: result.url, isLoading: false, error: result.error });
  }

  async function handleDownload(doc: LoanCaseDocument) {
    setListError(null);
    setPendingDocumentId(doc.id);
    const result = await getDocumentSignedUrlAction(caseNumber, doc.id, { download: true });
    setPendingDocumentId(null);
    if (result.error || !result.url) {
      setListError(result.error ?? "Could not download this file.");
      return;
    }
    window.location.href = result.url;
  }

  async function handleExtract(doc: LoanCaseDocument) {
    setListError(null);
    setPendingDocumentId(doc.id);
    const result = await extractDocumentData(caseNumber, doc.id);
    setPendingDocumentId(null);

    if (result.error) {
      setListError(result.error);
    }
    router.refresh();
  }

  async function handleDelete(doc: LoanCaseDocument) {
    const confirmed = window.confirm(`Delete "${doc.fileName ?? "this document"}"? This cannot be undone.`);
    if (!confirmed) return;

    setListError(null);
    setPendingDocumentId(doc.id);
    const result = await deleteDocumentAction(caseNumber, doc.id);
    setPendingDocumentId(null);

    if (result.error) {
      setListError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {documents.length} document{documents.length === 1 ? "" : "s"} on this case
        </p>
        <Button type="button" onClick={() => setIsUploadOpen(true)}>
          <UploadIcon className="h-4 w-4" />
          Upload Document
        </Button>
      </div>

      {listError && (
        <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {listError}
        </div>
      )}

      <div className="mt-4">
        <DocumentsTable
          documents={documents}
          pendingDocumentId={pendingDocumentId}
          onPreview={handlePreview}
          onDownload={handleDownload}
          onDelete={handleDelete}
          onExtract={handleExtract}
        />
      </div>

      {isUploadOpen && (
        <DocumentUploadDialog
          caseNumber={caseNumber}
          loanCaseId={loanCaseId}
          documentTypes={documentTypes}
          onClose={() => setIsUploadOpen(false)}
          onUploaded={handleUploaded}
        />
      )}

      {preview && (
        <DocumentPreviewModal
          fileName={preview.doc.fileName ?? "Untitled document"}
          mimeType={preview.doc.mimeType}
          url={preview.url}
          isLoading={preview.isLoading}
          error={preview.error}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}
