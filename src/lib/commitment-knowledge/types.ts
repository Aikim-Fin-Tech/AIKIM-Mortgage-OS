/**
 * Client-safe types for Commitment Knowledge (Sprint 6.3B-2). Mirrors the
 * one table created by
 * supabase/migrations/20260727010000_commitment_knowledge_schema.sql exactly
 * (camelCase, same convention as src/lib/income-knowledge/types.ts).
 *
 * `evidence` and `derivation_results` are domain-agnostic and were already
 * built in Sprint 6.3B-1 — reused as-is here, not redefined. Re-exported
 * rather than duplicated, same discipline this module's precedent used for
 * `BorrowerProfile`.
 */

export type { Evidence, DerivationResult } from "@/lib/income-knowledge/types";

export type CommitmentRecognitionRule = {
  id: string;
  bankId: string;
  /** Null = this bank's default treatment (wildcard); a specific value overrides it for that product only. */
  bankProductId: string | null;
  ruleName: string;
  /**
   * Required, exact match — never a wildcard. Open vocabulary maintained by
   * application-layer convention, not a database enum (e.g. housing loan,
   * hire purchase/car loan, personal loan, credit card, other) — same
   * posture as IncomeRecognitionRule.incomeSourceType.
   */
  commitmentType: string;
  /**
   * Open text, not a closed union (unlike IncomeRecognitionRule.recognitionMethod).
   * E.g. "full_instalment", "percentage_of_limit" — illustrative, not
   * exhaustive, per the DB PRD and the schema migration's design note.
   */
  recognitionMethod: string | null;
  /** Only meaningful when recognitionMethod requires one (e.g. a percentage-based method). */
  recognitionPercentage: number | null;
  /** Whether this bank allows excluding a commitment the borrower states will be settled before/at drawdown. */
  allowsToBeSettledExclusion: boolean;
  description: string | null;
  version: number;
  isActive: boolean;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  createdAt: string;
  updatedAt: string;
};
