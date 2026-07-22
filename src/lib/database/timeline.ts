import { createClient } from "@/lib/supabase/server";
import type { TimelineEntry } from "@/lib/timeline/types";

/**
 * Read-only, merged case timeline (MVP Sprint Day 2). Combines three
 * sources into one chronological list:
 *  - "Customer Created" / "Loan Created" — synthesized from
 *    customers.created_at / loan_cases.created_at, not stored separately.
 *  - "Document Uploaded" / "OCR Completed" / "Status Changed" — explicit
 *    rows in loan_case_timeline_events, recorded at the moment each happens.
 *  - "Checklist Updated" — synthesized from the existing
 *    loan_case_required_document_events table (Sprint 6.2 Phase 1), so
 *    checklist changes aren't recorded twice.
 *
 * Deliberately not sourced from public.audit_logs — that table is
 * super_admin-only by RLS, and this timeline must be visible to the banker
 * working the case. Never throws; returns an empty list plus an `error`
 * string on failure, same contract as every other file in this directory.
 */

type RequiredDocEventRow = {
  id: string;
  event_type: string;
  occurred_at: string;
  actor_user_id: string | null;
  document_types: { name: string } | { name: string }[] | null;
};

function normalizeEmbed<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

const CHECKLIST_EVENT_DESCRIPTIONS: Record<string, (docName: string) => string> = {
  added: (docName) => `${docName} added to required documents`,
  marked_not_required: (docName) => `${docName} is no longer required`,
  reactivated: (docName) => `${docName} required again`,
};

export async function getCaseTimeline(caseNumber: string): Promise<{ entries: TimelineEntry[]; error: string | null }> {
  try {
    const supabase = await createClient();

    const { data: caseRow, error: caseError } = await supabase
      .from("loan_cases")
      .select("id, created_at, customers ( created_at )")
      .eq("case_number", caseNumber)
      .maybeSingle();

    if (caseError) {
      console.error(`[getCaseTimeline] loan_cases lookup failed for ${caseNumber}. code=${caseError.code ?? "unknown"}`);
      return { entries: [], error: caseError.message };
    }

    if (!caseRow) {
      return { entries: [], error: null };
    }

    const customerRow = normalizeEmbed(caseRow.customers as { created_at: string } | { created_at: string }[] | null);

    const entries: TimelineEntry[] = [];

    entries.push({
      id: "synthesized-loan-created",
      type: "loan_created",
      description: "Loan case created",
      occurredAt: caseRow.created_at,
      actorName: null,
    });

    if (customerRow) {
      entries.push({
        id: "synthesized-customer-created",
        type: "customer_created",
        description: "Customer record created",
        occurredAt: customerRow.created_at,
        actorName: null,
      });
    }

    const [timelineResult, checklistEventsResult] = await Promise.all([
      supabase
        .from("loan_case_timeline_events")
        .select("id, event_type, description, occurred_at, actor_user_id")
        .eq("loan_case_id", caseRow.id),
      supabase
        .from("loan_case_required_document_events")
        .select("id, event_type, occurred_at, actor_user_id, document_types ( name )")
        .eq("loan_case_id", caseRow.id),
    ]);

    if (timelineResult.error) {
      console.error(`[getCaseTimeline] loan_case_timeline_events query failed. code=${timelineResult.error.code ?? "unknown"}`);
    } else {
      for (const row of timelineResult.data ?? []) {
        entries.push({
          id: row.id,
          type: row.event_type as TimelineEntry["type"],
          description: row.description,
          occurredAt: row.occurred_at,
          actorName: null, // resolved below
        });
      }
    }

    if (checklistEventsResult.error) {
      console.error(
        `[getCaseTimeline] loan_case_required_document_events query failed. code=${checklistEventsResult.error.code ?? "unknown"}`,
      );
    } else {
      for (const row of (checklistEventsResult.data ?? []) as RequiredDocEventRow[]) {
        const docType = normalizeEmbed(row.document_types);
        const describe = CHECKLIST_EVENT_DESCRIPTIONS[row.event_type] ?? ((name: string) => `Checklist updated: ${name}`);
        entries.push({
          id: row.id,
          type: "checklist_updated",
          description: describe(docType?.name ?? "a document"),
          occurredAt: row.occurred_at,
          actorName: null,
        });
      }
    }

    // Resolve actor names in one batch lookup across both event sources.
    const actorIds = new Set<string>();
    for (const row of timelineResult.data ?? []) {
      if (row.actor_user_id) actorIds.add(row.actor_user_id);
    }
    for (const row of (checklistEventsResult.data ?? []) as RequiredDocEventRow[]) {
      if (row.actor_user_id) actorIds.add(row.actor_user_id);
    }

    if (actorIds.size > 0) {
      const { data: actorRows } = await supabase.from("user_profiles").select("id, full_name").in("id", Array.from(actorIds));
      const actorNames = new Map((actorRows ?? []).map((a) => [a.id, a.full_name]));

      for (const entry of entries) {
        const sourceRow =
          (timelineResult.data ?? []).find((r) => r.id === entry.id) ??
          ((checklistEventsResult.data ?? []) as RequiredDocEventRow[]).find((r) => r.id === entry.id);
        if (sourceRow?.actor_user_id) {
          entry.actorName = actorNames.get(sourceRow.actor_user_id) ?? null;
        }
      }
    }

    entries.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

    return { entries, error: null };
  } catch (unexpectedError) {
    const message = unexpectedError instanceof Error ? unexpectedError.message : "Unknown error";
    console.error(`[getCaseTimeline] Unexpected error for ${caseNumber}: ${message}`);
    return { entries: [], error: message };
  }
}
