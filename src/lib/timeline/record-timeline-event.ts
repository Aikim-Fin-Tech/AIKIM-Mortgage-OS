import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { TimelineEntryType } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Called from the 3 action points that explicitly generate a timeline entry
 * (document upload, OCR completion, status change) — see
 * src/lib/database/timeline.ts for how these merge with the two synthesized
 * entries (Customer Created, Loan Created) and the existing
 * loan_case_required_document_events table (Checklist Updated) at read time.
 *
 * Never throws and never blocks the caller's primary action — a timeline
 * write failure is logged, not surfaced as an error to the user, since the
 * document/OCR/status change itself already succeeded by the time this runs.
 */
export async function recordTimelineEvent(
  supabase: SupabaseServerClient,
  loanCaseId: string,
  eventType: Extract<TimelineEntryType, "document_uploaded" | "ocr_completed" | "status_changed">,
  description: string,
  actorUserId: string | null,
): Promise<void> {
  const { error } = await supabase.from("loan_case_timeline_events").insert({
    loan_case_id: loanCaseId,
    event_type: eventType,
    description,
    actor_user_id: actorUserId,
  });

  if (error) {
    console.error(`[recordTimelineEvent] insert failed for case ${loanCaseId}. code=${error.code ?? "unknown"} message=${error.message}`);
  }
}
