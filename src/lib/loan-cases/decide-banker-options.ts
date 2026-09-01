import type { BankerOption } from "./new-loan-case-types";

/**
 * Pure, no I/O — decides what the New Loan Case form's "Assigned Banker"
 * dropdown is populated with. A Banker must only ever receive their own
 * record: previously getNewLoanCaseFormOptions() queried public.bankers
 * unfiltered, so every Banker's id/full_name/bank_name was serialized to
 * every other Banker's browser (the confirmed exposure this fix closes).
 * Every other staff role (super_admin, etc.) keeps the full platform-wide
 * list, since only Super Admin is expected to assign across Bankers.
 */
export function decideBankerOptionsForRole(
  role: string,
  ownBanker: BankerOption | null,
  platformWideBankers: BankerOption[],
): BankerOption[] {
  if (role === "banker") return ownBanker ? [ownBanker] : [];
  return platformWideBankers;
}
