/**
 * Client-safe types for DSR Rules Knowledge (Sprint 6.3B-3). Mirrors the one
 * table created by supabase/migrations/20260728010000_dsr_knowledge_schema.sql
 * exactly (camelCase, same convention as src/lib/income-knowledge/types.ts and
 * src/lib/commitment-knowledge/types.ts).
 *
 * `DerivationResult` is domain-agnostic and already exists (Sprint 6.3B-1) —
 * re-exported rather than redefined here, same discipline
 * src/lib/commitment-knowledge/types.ts already used. DSR reads
 * `derivation_results` rows (income/commitment computation outputs) as its
 * own inputs — unlike the other two domains, it does not read `evidence`
 * directly, so `Evidence` is deliberately not re-exported here.
 */

export type { DerivationResult } from "@/lib/income-knowledge/types";

export type DsrRule = {
  id: string;
  bankId: string;
  /** Null = this bank's default treatment (wildcard); a specific value overrides it for that product only. */
  bankProductId: string | null;
  ruleName: string;
  /** The maximum ratio this bank/product allows. Null = no cap configured yet. */
  maxDsrPercentage: number | null;
  /**
   * An interest-rate buffer applied to the proposed instalment before
   * computing the DSR numerator, if this bank practices it. Surfaced by
   * computeDsr as informational pass-through only — applying it correctly
   * requires redoing the amortization calculation, which is out of scope
   * for this module (see compute-dsr.ts).
   */
  stressTestRateBufferPercentage: number | null;
  /**
   * Half-open numeric range bounds, NOT a wildcard-equality dimension like
   * every other matching column in this Knowledge Base. See the design note
   * in 20260728010000_dsr_knowledge_schema.sql and match-dsr-rule.ts.
   * `null` on either bound means "no restriction on that side."
   */
  incomeTierLowerBound: number | null;
  incomeTierUpperBound: number | null;
  description: string | null;
  version: number;
  isActive: boolean;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  createdAt: string;
  updatedAt: string;
};
