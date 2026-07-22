"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { CloseIcon } from "@/components/dashboard/icons";
import { MAX_DOCUMENT_FILE_SIZE_BYTES, isAllowedDocumentFile } from "@/lib/documents/document-status";
import { recordDocumentUpload } from "@/app/(app)/loan-cases/[id]/documents/actions";
import type { DocumentTypeOption } from "@/lib/database/documents";

const ACCEPT_ATTR = ".pdf,.jpg,.jpeg,.png";

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9.\-_]/g, "_").slice(-150);
}

export function DocumentUploadDialog({
  caseNumber,
  loanCaseId,
  documentTypes,
  onClose,
  onUploaded,
}: {
  caseNumber: string;
  loanCaseId: string;
  documentTypes: DocumentTypeOption[];
  onClose: () => void;
  onUploaded: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [documentTypeId, setDocumentTypeId] = useState<string>("");
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(selected: File | null) {
    setError(null);
    if (!selected) {
      setFile(null);
      return;
    }
    if (!isAllowedDocumentFile(selected)) {
      setError("Only PDF, JPG, and PNG files up to 20MB are supported.");
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setFile(selected);
  }

  async function handleSubmit() {
    if (!file) {
      setError("Please choose a file to upload.");
      return;
    }

    setIsUploading(true);
    setError(null);

    const storagePath = `${loanCaseId}/${crypto.randomUUID()}-${sanitizeFileName(file.name)}`;
    const supabase = createClient();

    const { error: uploadError } = await supabase.storage
      .from("loan-documents")
      .upload(storagePath, file, { contentType: file.type, upsert: false });

    if (uploadError) {
      setError(`Upload failed: ${uploadError.message}`);
      setIsUploading(false);
      return;
    }

    const result = await recordDocumentUpload(caseNumber, {
      storagePath,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
      documentTypeId: documentTypeId || null,
    });

    if (result.error) {
      // Best-effort cleanup so a failed metadata write doesn't leave an
      // orphaned file in storage.
      await supabase.storage.from("loan-documents").remove([storagePath]);
      setError(result.error);
      setIsUploading(false);
      return;
    }

    setIsUploading(false);
    onUploaded();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-xl bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <p className="text-sm font-semibold text-slate-900">Upload Document</p>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} title="Close" disabled={isUploading}>
            <CloseIcon className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-4 p-5">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Document Type</label>
            <Select
              value={documentTypeId}
              onChange={(event) => setDocumentTypeId(event.target.value)}
              className="w-full"
              disabled={isUploading}
            >
              <option value="">General Document</option>
              {documentTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">File</label>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT_ATTR}
              disabled={isUploading}
              onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0
                file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700
                hover:file:bg-slate-200"
            />
            <p className="mt-1.5 text-xs text-slate-400">
              PDF, JPG, or PNG. Max {(MAX_DOCUMENT_FILE_SIZE_BYTES / (1024 * 1024)).toFixed(0)}MB.
            </p>
          </div>

          {error && <p className="text-xs text-rose-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose} disabled={isUploading}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={isUploading || !file}>
              {isUploading ? "Uploading..." : "Upload"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
