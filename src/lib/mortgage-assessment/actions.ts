"use server";

import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { STAFF_ROLES } from "@/lib/auth/staff-roles";
import { getBanks, getBankProducts } from "@/lib/database/income-knowledge";
import { recordEvidence, computeIncomeRecognition } from "@/lib/income-knowledge/actions";
import { computeCommitmentRecognition } from "@/lib/commitment-knowledge/actions";
import { computeDsrForCase } from "@/lib/dsr-knowledge/actions";
import { computePropertyRulesForCase } from "@/lib/property-rules-knowledge/actions";
import { computeEligibilityForCase } from "@/lib/eligibility-engine/actions";
import type { EligibilityReason, EligibilityVerdictOutcome } from "@/lib/eligibility-engine/types";

/**
 * Orchestrating Server Action for Alpha-001 / "Mortgage Assessment". Wiring
 * only — every computation, rule match, and business decision already lives
 * in the 6 domain modules this calls (Income Knowledge, Commitment
 * Knowledge, DSR Knowledge, Property Rules Knowledge, Eligibility Engine).
 * This file adds zero new business logic: it resolves the "AIKIM Standard" /
 * "Standard Mortgage" bank/product pair, then calls each already-implemented
 * function in the CTO-approved sequence below, passing one step's output
 * into the next step's input, and passes through exactly what each step
 * returned. It does not compute, summarize, or interpret anything itself —
 * in particular it does not "explain" `computeEligibilityForCase`'s verdict,
 * only relays it.
 *
 * Sequence (bail out on first failure — no retry, no partial recovery, no
 * fallback):
 *   0. resolve bankId ("AIKIM Standard") and bankProductId ("Standard
 *      Mortgage") by name lookup via getBanks()/getBankProducts()
 *   1. recordEvidence("recognized_raw_income")
 *   2. computeIncomeRecognition(...)
 *   3. recordEvidence("existing_commitment_instalment")
 *   4. computeCommitmentRecognition(...)
 *   5. computeDsrForCase(...) — AIKIM Standard's DSR thresholds are
 *      deliberately NULL (ADR 0015), so `passed === null` ("not configured")
 *      here is expected and is not treated as a failure.
 *   6. recordEvidence("property_type" / "construction_status" /
 *      "occupancy_intent" / "existing_property_count") — 4 separate calls
 *   7. computePropertyRulesForCase(...)
 *   8. computeEligibilityForCase(...)
 *
 * Follows src/lib/income-knowledge/actions.ts's Server Action shape exactly:
 * resolve the actor server-side, check STAFF_ROLES for a friendlier error
 * only. This app-level role check is a UX nicety, not a security boundary —
 * real enforcement is RLS on every underlying table this orchestrator's
 * 6 domain modules touch (see docs/architecture/security.md and
 * docs/decisions/0002-rls-as-sole-authorization-boundary.md). No new RLS,
 * schema, or RPC is introduced or required here.
 *
 * Zod-validates the whole input object at the boundary before any domain
 * call is made, matching src/lib/income-knowledge/actions.ts's
 * `computeIncomeRecognitionSchema` — a typed-argument boundary (this module
 * has no FormData-submitting page of its own; the frontend-engineer's page
 * calls this function directly with a typed object).
 */

const commitmentTypeSchema = z.enum(["credit_card", "personal_loan", "hire_purchase", "existing_mortgage"]);

export type RunMortgageAssessmentCommitmentType = z.infer<typeof commitmentTypeSchema>;

const runMortgageAssessmentSchema = z.object({
  loanCaseId: z.string().trim().uuid("Invalid loan case id."),
  incomeFigure: z.number().positive("incomeFigure must be greater than zero."),
  commitmentType: commitmentTypeSchema,
  commitmentFigure: z.number().nonnegative("commitmentFigure must not be negative."),
  isToBeSettled: z.boolean(),
  propertyType: z.string().trim().min(1, "propertyType is required."),
  constructionStatus: z.string().trim().min(1, "constructionStatus is required."),
  occupancyIntent: z.string().trim().min(1, "occupancyIntent is required."),
  existingPropertyCount: z
    .number()
    .int("existingPropertyCount must be a whole number.")
    .nonnegative("existingPropertyCount must not be negative."),
  proposedInstalmentAmount: z.number().nonnegative("proposedInstalmentAmount must not be negative."),
  propertyValue: z.number().positive("propertyValue must be greater than zero."),
  requestedTenureYears: z.number().positive("requestedTenureYears must be greater than zero."),
});

export type RunMortgageAssessmentInput = z.infer<typeof runMortgageAssessmentSchema>;

/** Names the exact step that failed, per the CTO-approved sequence above — never swallowed. */
export type RunMortgageAssessmentStep =
  | "resolve_bank"
  | "resolve_bank_product"
  | "record_income_evidence"
  | "compute_income_recognition"
  | "record_commitment_evidence"
  | "compute_commitment_recognition"
  | "compute_dsr"
  | "record_property_type_evidence"
  | "record_construction_status_evidence"
  | "record_occupancy_intent_evidence"
  | "record_existing_property_count_evidence"
  | "compute_property_rules"
  | "compute_eligibility";

export type RunMortgageAssessmentResult =
  | {
      success: true;
      error: null;
      bankId: string;
      bankProductId: string;
      incomeEvidenceId: string;
      incomeDerivationResultId: string;
      recognizedIncomeAmount: number;
      commitmentEvidenceId: string;
      commitmentDerivationResultId: string;
      recognizedCommitmentAmount: number;
      dsrDerivationResultId: string;
      dsrRatio: number;
      /**
       * By design `null` under the seeded AIKIM Standard baseline (ADR
       * 0015) — its DSR thresholds are deliberately unconfigured. Not an
       * error condition.
       */
      dsrPassed: boolean | null;
      propertyTypeEvidenceId: string;
      constructionStatusEvidenceId: string;
      occupancyIntentEvidenceId: string;
      existingPropertyCountEvidenceId: string;
      propertyRulesDerivationResultId: string;
      marginOfFinancePercentage: number | null;
      maxTenureYears: number | null;
      eligibilityVerdictId: string;
      verdict: EligibilityVerdictOutcome;
      reasons: EligibilityReason[];
    }
  | {
      success: false;
      error: string;
      failedStep: RunMortgageAssessmentStep;
    };

function stepFailure(failedStep: RunMortgageAssessmentStep, error: string): RunMortgageAssessmentResult {
  return { success: false, error, failedStep };
}

/**
 * Runs the full Mortgage Assessment chain for one loan case against the
 * "AIKIM Standard" / "Standard Mortgage" baseline, by calling each
 * already-implemented domain function in sequence and passing through its
 * raw output. See the module doc comment above for the exact sequence.
 */
export async function runMortgageAssessment(input: RunMortgageAssessmentInput): Promise<RunMortgageAssessmentResult> {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return stepFailure("resolve_bank", "Your session has expired. Please sign in again.");
  }
  if (!STAFF_ROLES.has(currentUser.role)) {
    return stepFailure("resolve_bank", "You do not have permission to run a mortgage assessment.");
  }

  const parsed = runMortgageAssessmentSchema.safeParse(input);
  if (!parsed.success) {
    return stepFailure("resolve_bank", parsed.error.issues[0]?.message ?? "Invalid input.");
  }
  const validInput = parsed.data;

  // Step 0a: resolve bankId by name — fail loud, no fallback to another bank.
  const { banks, error: banksError } = await getBanks();
  if (banksError) {
    return stepFailure("resolve_bank", banksError);
  }
  const aikimStandardBank = banks.find((bank) => bank.name === "AIKIM Standard");
  if (!aikimStandardBank) {
    return stepFailure("resolve_bank", 'Bank "AIKIM Standard" was not found.');
  }
  const bankId = aikimStandardBank.id;

  // Step 0b: resolve bankProductId by name, scoped to the resolved bank —
  // fail loud, no fallback to another product.
  const { bankProducts, error: bankProductsError } = await getBankProducts(bankId);
  if (bankProductsError) {
    return stepFailure("resolve_bank_product", bankProductsError);
  }
  const standardMortgageProduct = bankProducts.find((bankProduct) => bankProduct.productName === "Standard Mortgage");
  if (!standardMortgageProduct) {
    return stepFailure("resolve_bank_product", 'Bank product "Standard Mortgage" was not found for "AIKIM Standard".');
  }
  const bankProductId = standardMortgageProduct.id;

  // Step 1: record raw income evidence.
  const incomeEvidenceResult = await recordEvidence(validInput.loanCaseId, "recognized_raw_income", validInput.incomeFigure, "manual_entry");
  if (incomeEvidenceResult.error || !incomeEvidenceResult.evidenceId) {
    return stepFailure("record_income_evidence", incomeEvidenceResult.error ?? "Failed to record income evidence.");
  }
  const incomeEvidenceId = incomeEvidenceResult.evidenceId;

  // Step 2: compute income recognition.
  const incomeRecognitionResult = await computeIncomeRecognition(validInput.loanCaseId, bankId, bankProductId, [incomeEvidenceId]);
  if (incomeRecognitionResult.error || !incomeRecognitionResult.derivationResultId || incomeRecognitionResult.recognizedAmount === null) {
    return stepFailure("compute_income_recognition", incomeRecognitionResult.error ?? "Failed to compute income recognition.");
  }
  const incomeDerivationResultId = incomeRecognitionResult.derivationResultId;
  const recognizedIncomeAmount = incomeRecognitionResult.recognizedAmount;

  // Step 3: record raw commitment evidence.
  const commitmentEvidenceResult = await recordEvidence(
    validInput.loanCaseId,
    "existing_commitment_instalment",
    validInput.commitmentFigure,
    "manual_entry",
  );
  if (commitmentEvidenceResult.error || !commitmentEvidenceResult.evidenceId) {
    return stepFailure("record_commitment_evidence", commitmentEvidenceResult.error ?? "Failed to record commitment evidence.");
  }
  const commitmentEvidenceId = commitmentEvidenceResult.evidenceId;

  // Step 4: compute commitment recognition.
  const commitmentRecognitionResult = await computeCommitmentRecognition(
    validInput.loanCaseId,
    bankId,
    bankProductId,
    validInput.commitmentType,
    commitmentEvidenceId,
    validInput.isToBeSettled,
  );
  if (
    commitmentRecognitionResult.error ||
    !commitmentRecognitionResult.derivationResultId ||
    commitmentRecognitionResult.recognizedAmount === null
  ) {
    return stepFailure("compute_commitment_recognition", commitmentRecognitionResult.error ?? "Failed to compute commitment recognition.");
  }
  const commitmentDerivationResultId = commitmentRecognitionResult.derivationResultId;
  const recognizedCommitmentAmount = commitmentRecognitionResult.recognizedAmount;

  // Step 5: compute DSR. `passed === null` is expected under the AIKIM
  // Standard baseline (its DSR thresholds are deliberately unconfigured —
  // ADR 0015) and is not treated as an error here.
  const dsrResult = await computeDsrForCase(
    validInput.loanCaseId,
    bankId,
    bankProductId,
    [incomeDerivationResultId],
    [commitmentDerivationResultId],
    validInput.proposedInstalmentAmount,
  );
  if (dsrResult.error || !dsrResult.derivationResultId || dsrResult.dsrRatio === null) {
    return stepFailure("compute_dsr", dsrResult.error ?? "Failed to compute DSR.");
  }
  const dsrDerivationResultId = dsrResult.derivationResultId;
  const dsrRatio = dsrResult.dsrRatio;
  const dsrPassed = dsrResult.passed;

  // Step 6: record the 4 property-related evidence facts, one call each.
  const propertyTypeEvidenceResult = await recordEvidence(validInput.loanCaseId, "property_type", validInput.propertyType, "manual_entry");
  if (propertyTypeEvidenceResult.error || !propertyTypeEvidenceResult.evidenceId) {
    return stepFailure("record_property_type_evidence", propertyTypeEvidenceResult.error ?? "Failed to record property type evidence.");
  }
  const propertyTypeEvidenceId = propertyTypeEvidenceResult.evidenceId;

  const constructionStatusEvidenceResult = await recordEvidence(
    validInput.loanCaseId,
    "construction_status",
    validInput.constructionStatus,
    "manual_entry",
  );
  if (constructionStatusEvidenceResult.error || !constructionStatusEvidenceResult.evidenceId) {
    return stepFailure(
      "record_construction_status_evidence",
      constructionStatusEvidenceResult.error ?? "Failed to record construction status evidence.",
    );
  }
  const constructionStatusEvidenceId = constructionStatusEvidenceResult.evidenceId;

  const occupancyIntentEvidenceResult = await recordEvidence(
    validInput.loanCaseId,
    "occupancy_intent",
    validInput.occupancyIntent,
    "manual_entry",
  );
  if (occupancyIntentEvidenceResult.error || !occupancyIntentEvidenceResult.evidenceId) {
    return stepFailure("record_occupancy_intent_evidence", occupancyIntentEvidenceResult.error ?? "Failed to record occupancy intent evidence.");
  }
  const occupancyIntentEvidenceId = occupancyIntentEvidenceResult.evidenceId;

  const existingPropertyCountEvidenceResult = await recordEvidence(
    validInput.loanCaseId,
    "existing_property_count",
    validInput.existingPropertyCount,
    "manual_entry",
  );
  if (existingPropertyCountEvidenceResult.error || !existingPropertyCountEvidenceResult.evidenceId) {
    return stepFailure(
      "record_existing_property_count_evidence",
      existingPropertyCountEvidenceResult.error ?? "Failed to record existing property count evidence.",
    );
  }
  const existingPropertyCountEvidenceId = existingPropertyCountEvidenceResult.evidenceId;

  // Step 7: compute property rules.
  const propertyRulesResult = await computePropertyRulesForCase(
    validInput.loanCaseId,
    bankId,
    bankProductId,
    propertyTypeEvidenceId,
    constructionStatusEvidenceId,
    occupancyIntentEvidenceId,
    existingPropertyCountEvidenceId,
  );
  if (propertyRulesResult.error || !propertyRulesResult.derivationResultId) {
    return stepFailure("compute_property_rules", propertyRulesResult.error ?? "Failed to compute property rules.");
  }
  const propertyRulesDerivationResultId = propertyRulesResult.derivationResultId;
  const marginOfFinancePercentage = propertyRulesResult.marginOfFinancePercentage;
  const maxTenureYears = propertyRulesResult.maxTenureYears;

  // Step 8: compute the eligibility verdict.
  const eligibilityResult = await computeEligibilityForCase(
    validInput.loanCaseId,
    bankId,
    bankProductId,
    dsrDerivationResultId,
    propertyRulesDerivationResultId,
    validInput.propertyValue,
    validInput.requestedTenureYears,
  );
  if (eligibilityResult.error || !eligibilityResult.eligibilityVerdictId || !eligibilityResult.verdict || !eligibilityResult.reasons) {
    return stepFailure("compute_eligibility", eligibilityResult.error ?? "Failed to compute the eligibility verdict.");
  }

  return {
    success: true,
    error: null,
    bankId,
    bankProductId,
    incomeEvidenceId,
    incomeDerivationResultId,
    recognizedIncomeAmount,
    commitmentEvidenceId,
    commitmentDerivationResultId,
    recognizedCommitmentAmount,
    dsrDerivationResultId,
    dsrRatio,
    dsrPassed,
    propertyTypeEvidenceId,
    constructionStatusEvidenceId,
    occupancyIntentEvidenceId,
    existingPropertyCountEvidenceId,
    propertyRulesDerivationResultId,
    marginOfFinancePercentage,
    maxTenureYears,
    eligibilityVerdictId: eligibilityResult.eligibilityVerdictId,
    verdict: eligibilityResult.verdict,
    reasons: eligibilityResult.reasons,
  };
}
