export type TimelineEntryType =
  | "customer_created"
  | "loan_created"
  | "document_uploaded"
  | "ocr_completed"
  | "checklist_updated"
  | "status_changed";

export type TimelineEntry = {
  id: string;
  type: TimelineEntryType;
  description: string;
  occurredAt: string;
  actorName: string | null;
};
