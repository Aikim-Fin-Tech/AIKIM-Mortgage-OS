/**
 * Client-safe types for Property Rules Knowledge (Sprint 6.3B-4). Mirrors
 * the one table created by
 * supabase/migrations/20260729010000_property_rules_knowledge_schema.sql
 * exactly (camelCase, same convention as src/lib/income-knowledge/types.ts,
 * src/lib/commitment-knowledge/types.ts, and src/lib/dsr-knowledge/types.ts).
 *
 * Property Rules is a lookup, not a "recognition" with a transformation
 * formula (unlike Income Recognition's haircut/averaging arithmetic or
 * Commitment Recognition's settlement-exclusion logic): given a matched
 * rule, the "computed" result IS that rule's `marginOfFinancePercentage`/
 * `maxTenureYears`, passed through as-is (both may be `null` if not yet
 * configured — not an error, same as `DsrRule.maxDsrPercentage` being
 * nullable). There is no separate compute module in this directory.
 *
 * This domain reads `evidence` directly (like Income and Commitment), not
 * `derivation_results` (like DSR) — `Evidence` is re-exported rather than
 * redefined, same discipline src/lib/commitment-knowledge/types.ts already
 * used.
 */

export type { Evidence, DerivationResult } from "@/lib/income-knowledge/types";

export type PropertyRule = {
  id: string;
  bankId: string;
  /** Null = this bank's default treatment (wildcard); a specific value overrides it for that product only. */
  bankProductId: string | null;
  ruleName: string;
  /**
   * Required, exact match — never a wildcard. Open vocabulary maintained by
   * application-layer convention, not a database enum (e.g. residential,
   * commercial, land, other) — same posture as
   * CommitmentRecognitionRule.commitmentType.
   */
  propertyType: string;
  /**
   * Required, exact match — never a wildcard. Open vocabulary (e.g.
   * completed, under_construction/progressive_drawdown) — same posture as
   * propertyType.
   */
  constructionStatus: string;
  /**
   * Required, exact match — never a wildcard. Open vocabulary (e.g.
   * owner_occupied, investment) — same posture as propertyType/
   * constructionStatus.
   */
  occupancyIntent: string;
  /**
   * INCLUSIVE-INCLUSIVE numeric range bounds on the borrower's existing
   * financed-property count — deliberately different bound semantics from
   * DsrRule's incomeTierLowerBound/incomeTierUpperBound (half-open), because
   * this is a discrete integer count, not a continuous decimal value. See
   * the design note in 20260729010000_property_rules_knowledge_schema.sql
   * and match-property-rule.ts. `null` on either bound means "no
   * restriction on that side."
   */
  existingPropertyCountMin: number | null;
  existingPropertyCountMax: number | null;
  /** The margin-of-finance ceiling this bank/product allows. Null = not yet configured. */
  marginOfFinancePercentage: number | null;
  /** The maximum tenure this bank/product allows. Null = not yet configured. */
  maxTenureYears: number | null;
  description: string | null;
  version: number;
  isActive: boolean;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  createdAt: string;
  updatedAt: string;
};
