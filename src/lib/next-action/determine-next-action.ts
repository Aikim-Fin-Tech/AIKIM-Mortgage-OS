import { STATUS_PIPELINE_ORDER, type LoanStatus } from "@/lib/loan-cases-data";

/**
 * Rule-based (no AI) "what should the banker do next" for the Next Action
 * Card — deliberately separate from the AI-generated Case Summary card's
 * next-action suggestion (src/lib/case-summary/generate-next-action.ts).
 * Pure function, easy to unit test.
 */
export function determineNextAction(params: {
  status: LoanStatus;
  hasAnyRequirements: boolean;
  missingDocuments: string[];
}): string {
  const { status, hasAnyRequirements, missingDocuments } = params;

  if (status === "Rejected") {
    return "Case closed — rejected. No further action required.";
  }
  if (status === "Approved") {
    return "Case approved. Proceed with the bank's disbursement process.";
  }
  if (!hasAnyRequirements) {
    return "Complete the Borrower Profile to generate the required document checklist.";
  }
  if (missingDocuments.length > 0) {
    return `Collect missing document${missingDocuments.length === 1 ? "" : "s"}: ${missingDocuments.join(", ")}.`;
  }
  if (status === "Submitted") {
    return "Awaiting the bank's decision.";
  }
  if (status === "Ready to Submit") {
    return "Submit this case to the bank.";
  }
  return "All required documents are in — move this case to Ready to Submit.";
}

/** Days added per remaining pipeline step — a simple, disclosed estimate, not a promise. */
const DAYS_PER_REMAINING_STEP = 3;

export function estimateCompletion(status: LoanStatus): string {
  if (status === "Approved") return "Completed";
  if (status === "Rejected") return "N/A";

  const index = STATUS_PIPELINE_ORDER.indexOf(status);
  const remainingSteps = index === -1 ? STATUS_PIPELINE_ORDER.length - 1 : STATUS_PIPELINE_ORDER.length - 1 - index;

  const estimate = new Date();
  estimate.setDate(estimate.getDate() + remainingSteps * DAYS_PER_REMAINING_STEP);

  return new Intl.DateTimeFormat("en-MY", { day: "numeric", month: "short", year: "numeric" }).format(estimate);
}
