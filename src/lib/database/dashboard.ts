import { createClient } from "@/lib/supabase/server";
import { STATUS_LABELS, type LoanStage, type LoanStatus } from "@/lib/loan-cases-data";

/**
 * Read-only data access for the Dashboard.
 *
 * Enum values below are the actual raw values stored in the database — not
 * guessed. They match the schema as of MVP Sprint Day 2:
 *   public.loan_stage:     new_enquiry | document_collection | credit_review |
 *                          bank_submission | approved
 *   public.loan_status:    new | waiting_document | under_review |
 *                          ready_to_submit | submitted | approved | rejected
 *                          (on_hold retired but still a valid legacy value —
 *                          see STATUS_LABELS in loan-cases-data.ts)
 *   public.document_status: pending | verified | rejected
 *
 * There is no `ai_sessions`, `activity_logs`, `loan_assessments`, or
 * `whatsapp_conversations` table in this project — only `public.audit_logs`
 * (populated by a trigger on loan_cases inserts/updates/deletes). Anything here
 * that needs a real activity trail uses audit_logs instead.
 *
 * Everything goes through the authenticated server-side Supabase client, so
 * every number returned is already scoped by RLS to whatever the signed-in user
 * is allowed to see.
 */

const STAGE_LABELS: Record<string, LoanStage> = {
  new_enquiry: "New Enquiry",
  document_collection: "Document Collection",
  credit_review: "Credit Review",
  bank_submission: "Bank Submission",
  approved: "Approved",
};

// loan_status values that represent a case that has reached a final decision.
// Everything else counts as still "active" — there is no separate
// "cancelled" status in the current schema.
const DECIDED_STATUSES = new Set(["approved", "rejected"]);

// document_status values that mean a document still needs attention.
const DOCUMENT_ACTION_NEEDED = new Set(["pending", "rejected"]);

type LoanCaseRow = {
  case_number: string;
  property_project: string;
  loan_amount: number;
  stage: string;
  status: string;
  created_at: string;
  updated_at: string;
  customers: { full_name: string } | null;
  bankers: { full_name: string } | null;
};

type DocumentRow = {
  status: string;
  created_at: string;
  verified_at: string | null;
};

type AuditSnapshot = Record<string, unknown> | null;

type AuditTransitionRow = {
  action: string;
  old_data: AuditSnapshot;
  new_data: AuditSnapshot;
};

export type PipelineStageCount = {
  stage: LoanStage;
  count: number;
};

export type RecentCase = {
  id: string;
  customer: string;
  project: string;
  loanAmount: number;
  banker: string;
  stage: LoanStage;
  status: LoanStatus;
  updatedAt: string;
};

export type TodaysSummaryRow = {
  label: string;
  value: number;
};

export type DashboardData = {
  totalCases: number;
  activeCases: number;
  pendingDocuments: number;
  approvedCases: number;
  approvalRate: number;
  documentsProcessed: number;
  pipeline: PipelineStageCount[];
  recentCases: RecentCase[];
  todaysSummary: TodaysSummaryRow[];
  /** Activity events (loan_cases inserts/updates/deletes) recorded today, per audit_logs. */
  activityEventsToday: number;
  lastDataUpdatedAt: string;
  errors: string[];
};

function startOfTodayIso(): string {
  const now = new Date();
  return `${now.toISOString().slice(0, 10)}T00:00:00.000Z`;
}

function isToday(isoTimestamp: string, todayDateStr: string): boolean {
  return isoTimestamp.slice(0, 10) === todayDateStr;
}

function statusOf(record: AuditSnapshot): string | null {
  return record && typeof record.status === "string" ? record.status : null;
}

async function fetchLoanCases(): Promise<{ rows: LoanCaseRow[]; error: string | null }> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("loan_cases")
      .select(
        `
          case_number,
          property_project,
          loan_amount,
          stage,
          status,
          created_at,
          updated_at,
          customers ( full_name ),
          bankers ( full_name )
        `,
      )
      .order("created_at", { ascending: false })
      .returns<LoanCaseRow[]>();

    if (error) {
      console.error(
        `[getDashboardData] loan_cases query failed. code=${error.code ?? "unknown"} message=${error.message}`,
      );
      return { rows: [], error: error.message };
    }

    return { rows: data ?? [], error: null };
  } catch (unexpectedError) {
    const message = unexpectedError instanceof Error ? unexpectedError.message : "Unknown error";
    console.error(`[getDashboardData] Unexpected error fetching loan_cases: ${message}`);
    return { rows: [], error: message };
  }
}

async function fetchDocuments(): Promise<{ rows: DocumentRow[]; error: string | null }> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("documents")
      .select("status, created_at, verified_at")
      .returns<DocumentRow[]>();

    if (error) {
      console.error(
        `[getDashboardData] documents query failed. code=${error.code ?? "unknown"} message=${error.message}`,
      );
      return { rows: [], error: error.message };
    }

    return { rows: data ?? [], error: null };
  } catch (unexpectedError) {
    const message = unexpectedError instanceof Error ? unexpectedError.message : "Unknown error";
    console.error(`[getDashboardData] Unexpected error fetching documents: ${message}`);
    return { rows: [], error: message };
  }
}

/**
 * Today's audit_logs entries for loan_cases only. Used to count real status
 * transitions (submitted/approved/rejected today) — old_data/new_data are full
 * row snapshots (to_jsonb of the row), so comparing their `status` field tells
 * us whether a status actually changed, not just that *something* changed.
 *
 * Note: audit_logs is restricted by RLS to super_admin only (see Sprint 4
 * schema). For any other role this legitimately returns zero rows — that is
 * correct behaviour, not a bug, and is treated as a safe empty state below.
 */
async function fetchTodaysLoanCaseAudit(): Promise<{ rows: AuditTransitionRow[]; error: string | null }> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("audit_logs")
      .select("action, old_data, new_data")
      .eq("entity_type", "loan_cases")
      .gte("created_at", startOfTodayIso())
      .returns<AuditTransitionRow[]>();

    if (error) {
      console.error(
        `[getDashboardData] audit_logs (today) query failed. code=${error.code ?? "unknown"} message=${error.message}`,
      );
      return { rows: [], error: error.message };
    }

    return { rows: data ?? [], error: null };
  } catch (unexpectedError) {
    const message = unexpectedError instanceof Error ? unexpectedError.message : "Unknown error";
    console.error(`[getDashboardData] Unexpected error fetching today's audit_logs: ${message}`);
    return { rows: [], error: message };
  }
}

/**
 * Aggregates everything the Dashboard needs from Supabase in three parallel,
 * independent queries (loan_cases, documents, today's audit_logs). If one
 * fails, the others' numbers still come through — the failing section falls
 * back to safe zero values and its message is added to `errors`, never
 * crashing the page and never re-introducing mock data.
 */
export async function getDashboardData(): Promise<DashboardData> {
  const [loanCasesResult, documentsResult, auditTodayResult] = await Promise.all([
    fetchLoanCases(),
    fetchDocuments(),
    fetchTodaysLoanCaseAudit(),
  ]);

  const errors: string[] = [];
  if (loanCasesResult.error) errors.push(`loan_cases: ${loanCasesResult.error}`);
  if (documentsResult.error) errors.push(`documents: ${documentsResult.error}`);
  if (auditTodayResult.error) errors.push(`audit_logs: ${auditTodayResult.error}`);

  const loanCases = loanCasesResult.rows;
  const todayDateStr = new Date().toISOString().slice(0, 10);

  const totalCases = loanCases.length;
  const approvedCases = loanCases.filter((row) => row.status === "approved").length;
  const rejectedCases = loanCases.filter((row) => row.status === "rejected").length;
  const activeCases = loanCases.filter((row) => !DECIDED_STATUSES.has(row.status)).length;

  const decidedCases = approvedCases + rejectedCases;
  const approvalRate = decidedCases === 0 ? 0 : Math.round((approvedCases / decidedCases) * 100);

  const pipelineCounts = new Map<string, number>();
  for (const row of loanCases) {
    pipelineCounts.set(row.stage, (pipelineCounts.get(row.stage) ?? 0) + 1);
  }
  const pipeline: PipelineStageCount[] = Object.entries(STAGE_LABELS).map(([rawKey, label]) => ({
    stage: label,
    count: pipelineCounts.get(rawKey) ?? 0,
  }));

  const recentCases: RecentCase[] = loanCases.slice(0, 5).map((row) => ({
    id: row.case_number,
    customer: row.customers?.full_name ?? "Unknown Customer",
    project: row.property_project,
    loanAmount: Number(row.loan_amount),
    banker: row.bankers?.full_name ?? "Unassigned",
    stage: STAGE_LABELS[row.stage] ?? "New Enquiry",
    status: STATUS_LABELS[row.status] ?? "Under Review",
    updatedAt: row.updated_at,
  }));

  const documentRows = documentsResult.rows;
  const pendingDocuments = documentRows.filter((doc) => DOCUMENT_ACTION_NEEDED.has(doc.status)).length;
  const documentsProcessed = documentRows.filter((doc) => doc.status === "verified").length;

  // New loan cases / documents uploaded / documents verified today: read
  // directly off real timestamp columns (created_at, verified_at) — no
  // heuristic needed, these are exactly what they claim to be.
  const newLoanCasesToday = loanCases.filter((row) => isToday(row.created_at, todayDateStr)).length;
  const documentsUploadedToday = documentRows.filter((doc) => isToday(doc.created_at, todayDateStr)).length;
  const documentsVerifiedToday = documentRows.filter(
    (doc) => doc.status === "verified" && doc.verified_at !== null && isToday(doc.verified_at, todayDateStr),
  ).length;

  // Cases submitted/approved/rejected today: derived from real audit_logs
  // transitions (old status !== new status), not just "any row touched today".
  const auditRows = auditTodayResult.rows;
  const transitionedTo = (target: string) =>
    auditRows.filter(
      (row) => row.action === "update" && statusOf(row.new_data) === target && statusOf(row.old_data) !== target,
    ).length;

  const casesSubmittedToday = transitionedTo("submitted");
  const casesApprovedToday = transitionedTo("approved");
  const casesRejectedToday = transitionedTo("rejected");
  const activityEventsToday = auditRows.length;

  const todaysSummary: TodaysSummaryRow[] = [
    { label: "New Loan Cases", value: newLoanCasesToday },
    { label: "Documents Uploaded", value: documentsUploadedToday },
    { label: "Documents Verified", value: documentsVerifiedToday },
    { label: "Cases Submitted", value: casesSubmittedToday },
    { label: "Cases Approved", value: casesApprovedToday },
    { label: "Cases Rejected", value: casesRejectedToday },
  ];

  if (errors.length > 0) {
    console.error(`[getDashboardData] Completed with partial errors: ${errors.join(" | ")}`);
  } else {
    console.log(
      `[getDashboardData] Supabase data used — ${totalCases} loan case(s), ${documentRows.length} document(s), ` +
        `${auditRows.length} audit event(s) today.`,
    );
  }

  return {
    totalCases,
    activeCases,
    pendingDocuments,
    approvedCases,
    approvalRate,
    documentsProcessed,
    pipeline,
    recentCases,
    todaysSummary,
    activityEventsToday,
    lastDataUpdatedAt: new Date().toISOString(),
    errors,
  };
}
