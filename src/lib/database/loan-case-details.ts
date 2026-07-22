import { createClient } from "@/lib/supabase/server";
import { STATUS_LABELS, type LoanStage, type LoanStatus } from "@/lib/loan-cases-data";
import { DOCUMENT_STATUS_LABELS } from "@/lib/documents/document-status";

/**
 * Read-only data access for the Loan Case Detail workspace.
 *
 * Verified against this project's actual schema (Sprint 4 schema +
 * supabase/migrations/*.sql already in this repo) before writing any query
 * below. The following tables/columns do NOT exist in this project, so
 * nothing here references them — they're intentionally treated as
 * "not available" rather than guessed at:
 *   - case_notes (no such table)
 *   - follow_ups (no such table)
 *   - customers.customer_type / customers.nationality / any employment fields
 *     (nationality etc. live on loan_cases as of Sprint 6.2, not customers)
 *   - loan_cases.spa_price / property_type / tenure / loan_margin
 * As of Sprint 6.2, loan_case_required_documents is the per-case required
 * documents checklist — see src/lib/database/required-documents.ts, kept
 * separate from this file since it's a distinct read surface for the
 * Documents tab, not the case overview.
 */

const STAGE_LABELS: Record<string, LoanStage> = {
  new_enquiry: "New Enquiry",
  document_collection: "Document Collection",
  credit_review: "Credit Review",
  bank_submission: "Bank Submission",
  approved: "Approved",
};

export type BorrowerProfile = {
  nationality: string | null;
  incomeCountry: string | null;
  employmentType: string | null;
  incomeStructure: string | null;
};

export type CaseDetail = {
  caseNumber: string;
  propertyProject: string;
  propertyAddress: string | null;
  loanAmount: number;
  bankName: string;
  stage: LoanStage;
  status: LoanStatus;
  createdAt: string;
  updatedAt: string;
  borrowerProfile: BorrowerProfile;
};

export type CustomerDetail = {
  fullName: string;
  phone: string | null;
  email: string | null;
  /** Already masked, e.g. "XXXXXX-XX-1234". Never the raw ic_number. */
  icNumberMasked: string | null;
  address: string | null;
};

export type BankerDetail = {
  fullName: string;
  bankName: string;
  branch: string | null;
  phone: string | null;
  email: string | null;
};

export type CreatorDetail = {
  fullName: string;
  roleLabel: string;
};

export type DocumentSummaryItem = {
  id: string;
  documentType: string;
  status: "pending" | "verified" | "rejected";
  statusLabel: string;
  uploadedAt: string;
  verifiedAt: string | null;
};

export type DocumentSummary = {
  uploaded: number;
  verified: number;
  pending: number;
  rejected: number;
  recent: DocumentSummaryItem[];
};

export type ActivityItem = {
  id: string;
  label: string;
  description: string;
  actor: string | null;
  createdAt: string;
};

export type LoanCaseDetails = {
  case: CaseDetail | null;
  customer: CustomerDetail | null;
  banker: BankerDetail | null;
  creator: CreatorDetail | null;
  documents: DocumentSummary;
  activity: ActivityItem[];
  /** Always null — public.case_notes does not exist in this schema. */
  notes: null;
  /** Always null — public.follow_ups does not exist in this schema. */
  followUps: null;
  error: string | null;
};

const EMPTY_DOCUMENT_SUMMARY: DocumentSummary = { uploaded: 0, verified: 0, pending: 0, rejected: 0, recent: [] };

function maskIcNumber(ic: string): string {
  const visibleCount = 4;
  const chars = ic.split("");
  let visible = 0;
  for (let i = chars.length - 1; i >= 0; i--) {
    if (/[0-9a-zA-Z]/.test(chars[i])) {
      if (visible < visibleCount) {
        visible++;
        continue;
      }
      chars[i] = "X";
    }
  }
  return chars.join("");
}

function describeAuditRow(
  action: string,
  oldData: Record<string, unknown> | null,
  newData: Record<string, unknown> | null,
): { label: string; description: string } {
  if (action === "insert") {
    const stage = newData && typeof newData.stage === "string" ? STAGE_LABELS[newData.stage] : undefined;
    const status = newData && typeof newData.status === "string" ? STATUS_LABELS[newData.status] : undefined;
    return {
      label: "Case created",
      description:
        stage && status ? `Created at stage "${stage}" with status "${status}".` : "The case record was created.",
    };
  }

  if (action === "delete") {
    return { label: "Case deleted", description: "This case record was deleted." };
  }

  if (action === "update") {
    const changes: string[] = [];
    const oldStage = oldData && typeof oldData.stage === "string" ? oldData.stage : undefined;
    const newStage = newData && typeof newData.stage === "string" ? newData.stage : undefined;
    const oldStatus = oldData && typeof oldData.status === "string" ? oldData.status : undefined;
    const newStatus = newData && typeof newData.status === "string" ? newData.status : undefined;
    const oldBanker = oldData && "banker_id" in oldData ? oldData.banker_id : undefined;
    const newBanker = newData && "banker_id" in newData ? newData.banker_id : undefined;
    const oldAmount = oldData && typeof oldData.loan_amount !== "undefined" ? Number(oldData.loan_amount) : undefined;
    const newAmount = newData && typeof newData.loan_amount !== "undefined" ? Number(newData.loan_amount) : undefined;

    if (newStage && oldStage !== newStage) {
      changes.push(`Stage changed to "${STAGE_LABELS[newStage] ?? newStage}".`);
    }
    if (newStatus && oldStatus !== newStatus) {
      changes.push(`Status changed to "${STATUS_LABELS[newStatus] ?? newStatus}".`);
    }
    if (typeof newBanker !== "undefined" && oldBanker !== newBanker) {
      changes.push("Banker assignment changed.");
    }
    if (typeof newAmount === "number" && oldAmount !== newAmount) {
      changes.push(`Loan amount changed to RM ${newAmount.toLocaleString("en-MY")}.`);
    }

    if (changes.length === 0) {
      return { label: "Case updated", description: "Case details were updated." };
    }

    const label =
      changes.length === 1 && changes[0].startsWith("Stage")
        ? "Stage updated"
        : changes.length === 1 && changes[0].startsWith("Status")
          ? "Status updated"
          : "Case updated";

    return { label, description: changes.join(" ") };
  }

  return { label: action, description: "An event was recorded for this case." };
}

/**
 * Loads everything the Loan Case Detail workspace needs for one case, scoped
 * to the current user by RLS at every step. Never throws — a missing case,
 * an RLS-blocked relationship, or a failed sub-query all degrade to a safe
 * empty value for that section rather than crashing the whole page.
 */
export async function getLoanCaseDetails(caseNumber: string): Promise<LoanCaseDetails> {
  const empty: LoanCaseDetails = {
    case: null,
    customer: null,
    banker: null,
    creator: null,
    documents: EMPTY_DOCUMENT_SUMMARY,
    activity: [],
    notes: null,
    followUps: null,
    error: null,
  };

  try {
    const supabase = await createClient();

    const { data: row, error: caseError } = await supabase
      .from("loan_cases")
      .select(
        `
          id,
          case_number,
          property_project,
          property_address,
          loan_amount,
          bank_name,
          stage,
          status,
          created_at,
          updated_at,
          created_by,
          nationality,
          income_country,
          employment_type,
          income_structure,
          customers ( full_name, phone, email, ic_number, address ),
          bankers ( full_name, bank_name, branch, phone, email )
        `,
      )
      .eq("case_number", caseNumber)
      .maybeSingle();

    if (caseError) {
      console.error(
        `[getLoanCaseDetails] loan_cases query failed for ${caseNumber}. code=${caseError.code ?? "unknown"} message=${caseError.message}`,
      );
      return { ...empty, error: caseError.message };
    }

    if (!row) {
      // Not found or hidden by RLS — the page treats this as "case not found".
      return empty;
    }

    const caseDetail: CaseDetail = {
      caseNumber: row.case_number,
      propertyProject: row.property_project,
      propertyAddress: row.property_address,
      loanAmount: Number(row.loan_amount),
      bankName: row.bank_name,
      stage: STAGE_LABELS[row.stage] ?? "New Enquiry",
      status: STATUS_LABELS[row.status] ?? "Under Review",
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      borrowerProfile: {
        nationality: row.nationality,
        incomeCountry: row.income_country,
        employmentType: row.employment_type,
        incomeStructure: row.income_structure,
      },
    };

    // Supabase infers a to-one embed as an array when the FK relationship
    // isn't declared unique to PostgREST — normalize to a single row or null.
    const rawCustomer = row.customers as
      | { full_name: string; phone: string | null; email: string | null; ic_number: string | null; address: string | null }
      | { full_name: string; phone: string | null; email: string | null; ic_number: string | null; address: string | null }[]
      | null;
    const customerRow = Array.isArray(rawCustomer) ? (rawCustomer[0] ?? null) : rawCustomer;

    const customer: CustomerDetail | null = customerRow
      ? {
          fullName: customerRow.full_name,
          phone: customerRow.phone,
          email: customerRow.email,
          icNumberMasked: customerRow.ic_number ? maskIcNumber(customerRow.ic_number) : null,
          address: customerRow.address,
        }
      : null;

    const rawBanker = row.bankers as
      | { full_name: string; bank_name: string; branch: string | null; phone: string | null; email: string | null }
      | { full_name: string; bank_name: string; branch: string | null; phone: string | null; email: string | null }[]
      | null;
    const bankerRow = Array.isArray(rawBanker) ? (rawBanker[0] ?? null) : rawBanker;

    const banker: BankerDetail | null = bankerRow
      ? {
          fullName: bankerRow.full_name,
          bankName: bankerRow.bank_name,
          branch: bankerRow.branch,
          phone: bankerRow.phone,
          email: bankerRow.email,
        }
      : null;

    // Separate lookup for the creator profile (avoids ambiguous multi-FK
    // embedding between loan_cases and user_profiles — that table is
    // referenced by both created_by and assigned_agent_id).
    let creator: CreatorDetail | null = null;
    if (row.created_by) {
      const { data: creatorRow, error: creatorError } = await supabase
        .from("user_profiles")
        .select("full_name, role")
        .eq("id", row.created_by)
        .maybeSingle();

      if (creatorError) {
        console.error(
          `[getLoanCaseDetails] creator lookup failed for ${caseNumber}. code=${creatorError.code ?? "unknown"} message=${creatorError.message}`,
        );
      } else if (creatorRow) {
        creator = { fullName: creatorRow.full_name, roleLabel: creatorRow.role };
      }
    }

    // Documents for this case.
    let documents: DocumentSummary = EMPTY_DOCUMENT_SUMMARY;
    const { data: documentRows, error: documentsError } = await supabase
      .from("documents")
      .select("id, status, created_at, verified_at, document_types ( name )")
      .eq("loan_case_id", row.id)
      .order("created_at", { ascending: false });

    if (documentsError) {
      console.error(
        `[getLoanCaseDetails] documents query failed for ${caseNumber}. code=${documentsError.code ?? "unknown"} message=${documentsError.message}`,
      );
    } else if (documentRows) {
      const items: DocumentSummaryItem[] = documentRows.map((doc) => {
        const rawDocType = doc.document_types as { name: string } | { name: string }[] | null;
        const docType = Array.isArray(rawDocType) ? (rawDocType[0] ?? null) : rawDocType;
        const status = (doc.status as "pending" | "verified" | "rejected") ?? "pending";
        return {
          id: doc.id,
          documentType: docType?.name ?? "Document",
          status,
          statusLabel: DOCUMENT_STATUS_LABELS[status] ?? status,
          uploadedAt: doc.created_at,
          verifiedAt: doc.verified_at,
        };
      });

      documents = {
        uploaded: items.length,
        verified: items.filter((d) => d.status === "verified").length,
        pending: items.filter((d) => d.status === "pending").length,
        rejected: items.filter((d) => d.status === "rejected").length,
        recent: items.slice(0, 5),
      };
    }

    // Activity timeline from audit_logs. RLS restricts this to super_admin
    // (see Sprint 4 schema) — for any other role this legitimately comes back
    // empty, which is correct behaviour, not a bug.
    let activity: ActivityItem[] = [];
    const { data: auditRows, error: auditError } = await supabase
      .from("audit_logs")
      .select("id, actor_id, action, old_data, new_data, created_at")
      .eq("entity_type", "loan_cases")
      .eq("entity_id", row.id)
      .order("created_at", { ascending: false })
      .limit(20);

    if (auditError) {
      console.error(
        `[getLoanCaseDetails] audit_logs query failed for ${caseNumber}. code=${auditError.code ?? "unknown"} message=${auditError.message}`,
      );
    } else if (auditRows && auditRows.length > 0) {
      const actorIds = Array.from(
        new Set(auditRows.map((r) => r.actor_id).filter((id): id is string => Boolean(id))),
      );

      let actorNames = new Map<string, string>();
      if (actorIds.length > 0) {
        const { data: actorRows, error: actorError } = await supabase
          .from("user_profiles")
          .select("id, full_name")
          .in("id", actorIds);

        if (actorError) {
          console.error(
            `[getLoanCaseDetails] actor lookup failed for ${caseNumber}. code=${actorError.code ?? "unknown"} message=${actorError.message}`,
          );
        } else if (actorRows) {
          actorNames = new Map(actorRows.map((a) => [a.id, a.full_name]));
        }
      }

      activity = auditRows.map((r) => {
        const { label, description } = describeAuditRow(
          r.action,
          r.old_data as Record<string, unknown> | null,
          r.new_data as Record<string, unknown> | null,
        );
        return {
          id: r.id,
          label,
          description,
          actor: r.actor_id ? (actorNames.get(r.actor_id) ?? null) : null,
          createdAt: r.created_at,
        };
      });
    }

    return {
      case: caseDetail,
      customer,
      banker,
      creator,
      documents,
      activity,
      notes: null,
      followUps: null,
      error: null,
    };
  } catch (unexpectedError) {
    const message = unexpectedError instanceof Error ? unexpectedError.message : "Unknown error";
    console.error(`[getLoanCaseDetails] Unexpected error for ${caseNumber}: ${message}`);
    return { ...empty, error: message };
  }
}
