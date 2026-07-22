"use client";

import { Button } from "@/components/ui/button";
import { CloseIcon } from "@/components/dashboard/icons";
import { isPreviewableMimeType } from "@/lib/documents/document-status";

export function DocumentPreviewModal({
  fileName,
  mimeType,
  url,
  isLoading,
  error,
  onClose,
}: {
  fileName: string;
  mimeType: string | null;
  url: string | null;
  isLoading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  const kind = isPreviewableMimeType(mimeType);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="flex h-full max-h-[85vh] w-full max-w-3xl flex-col rounded-xl bg-white shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <p className="truncate text-sm font-medium text-slate-900">{fileName}</p>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} title="Close">
            <CloseIcon className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex flex-1 items-center justify-center overflow-auto bg-slate-50 p-4">
          {isLoading && <p className="text-sm text-slate-400">Loading preview...</p>}

          {!isLoading && error && <p className="text-sm text-rose-600">{error}</p>}

          {!isLoading && !error && url && kind === "pdf" && (
            <iframe src={url} title={fileName} className="h-full w-full rounded-lg border border-slate-200 bg-white" />
          )}

          {!isLoading && !error && url && kind === "image" && (
            // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from Supabase Storage; next/image's remote-pattern config isn't worth adding for this.
            <img src={url} alt={fileName} className="max-h-full max-w-full rounded-lg object-contain" />
          )}

          {!isLoading && !error && url && !kind && <p className="text-sm text-slate-400">Preview not available for this file type.</p>}
        </div>
      </div>
    </div>
  );
}
