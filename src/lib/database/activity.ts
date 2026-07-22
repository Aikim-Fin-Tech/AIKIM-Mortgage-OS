import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * Notification-centre data source, used by the Header's bell icon.
 *
 * There is no `activity_logs` table in this project's schema — only
 * `public.audit_logs` (see Sprint 4), populated by a trigger on loan_cases
 * inserts/updates/deletes. This is used as the real activity source instead.
 *
 * audit_logs has no read/unread column, so this never claims items are
 * "unread" — callers should show the item count instead (see NotificationCenter).
 *
 * RLS note: audit_logs is currently readable by super_admin only. For any
 * other role this legitimately returns zero rows — that's correct, not a bug.
 */

const RECENT_ACTIVITY_LIMIT = 8;

type AuditLogRow = {
  id: string;
  action: string;
  entity_type: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  created_at: string;
};

export type ActivityItem = {
  id: string;
  description: string;
  caseNumber: string | null;
  createdAt: string;
};

export type GetRecentActivityResult = {
  items: ActivityItem[];
  error: string | null;
};

function extractCaseNumber(row: AuditLogRow): string | null {
  const snapshot = row.new_data ?? row.old_data;
  return snapshot && typeof snapshot.case_number === "string" ? snapshot.case_number : null;
}

function describe(row: AuditLogRow): string {
  const caseNumber = extractCaseNumber(row);
  const subject = caseNumber ? `Loan case ${caseNumber}` : `A ${row.entity_type} record`;

  switch (row.action) {
    case "insert":
      return caseNumber ? `New loan case ${caseNumber} created` : `${subject} created`;
    case "update":
      return `${subject} was updated`;
    case "delete":
      return `${subject} was deleted`;
    default:
      return `${subject}: ${row.action}`;
  }
}

export const getRecentActivity = cache(async (): Promise<GetRecentActivityResult> => {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("audit_logs")
      .select("id, action, entity_type, old_data, new_data, created_at")
      .order("created_at", { ascending: false })
      .limit(RECENT_ACTIVITY_LIMIT)
      .returns<AuditLogRow[]>();

    if (error) {
      console.error(
        `[getRecentActivity] audit_logs query failed. code=${error.code ?? "unknown"} message=${error.message}`,
      );
      return { items: [], error: error.message };
    }

    const items: ActivityItem[] = (data ?? []).map((row) => ({
      id: row.id,
      description: describe(row),
      caseNumber: extractCaseNumber(row),
      createdAt: row.created_at,
    }));

    return { items, error: null };
  } catch (unexpectedError) {
    const message = unexpectedError instanceof Error ? unexpectedError.message : "Unknown error";
    console.error(`[getRecentActivity] Unexpected error: ${message}`);
    return { items: [], error: message };
  }
});
