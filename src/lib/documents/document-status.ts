import type { BadgeVariant } from "@/components/ui/badge";

/**
 * Shared across every surface that renders a document's status or metadata
 * (DocumentSummaryCard on the Overview tab, the Documents tab table) so the
 * mapping only lives in one place.
 */

export type DocumentStatus = "pending" | "verified" | "rejected";

export const DOCUMENT_STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  verified: "Verified",
  rejected: "Rejected",
};

export const DOCUMENT_STATUS_VARIANT: Record<string, BadgeVariant> = {
  pending: "warning",
  verified: "success",
  rejected: "danger",
};

/** MIME types accepted by both the upload UI and the storage bucket itself. */
export const ALLOWED_DOCUMENT_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;

export const MAX_DOCUMENT_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20MB

export function isAllowedDocumentFile(file: { type: string; size: number }): boolean {
  return (
    ALLOWED_DOCUMENT_MIME_TYPES.includes(file.type as (typeof ALLOWED_DOCUMENT_MIME_TYPES)[number]) &&
    file.size > 0 &&
    file.size <= MAX_DOCUMENT_FILE_SIZE_BYTES
  );
}

export function formatFileSize(bytes: number | null): string {
  if (bytes === null || Number.isNaN(bytes)) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isPreviewableMimeType(mimeType: string | null): "pdf" | "image" | null {
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType === "image/jpeg" || mimeType === "image/png") return "image";
  return null;
}
