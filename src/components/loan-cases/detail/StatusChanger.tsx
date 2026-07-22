"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/select";
import { updateLoanCaseStatus } from "@/app/(app)/loan-cases/[id]/actions";
import { STATUS_OPTIONS } from "@/lib/loan-cases/new-loan-case-types";
import type { LoanStatus } from "@/lib/loan-cases-data";

/**
 * First real status-change capability (MVP Sprint Day 2) — everything
 * before this could only set status at case creation. Auto-submits on
 * selection; records a "Status Changed" timeline entry server-side.
 */
export function StatusChanger({ caseNumber, currentStatus }: { caseNumber: string; currentStatus: LoanStatus }) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentValue = STATUS_OPTIONS.find((o) => o.label === currentStatus)?.value ?? "";

  async function handleChange(newValue: string) {
    setError(null);
    setIsPending(true);
    const result = await updateLoanCaseStatus(caseNumber, newValue);
    setIsPending(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <Select
        value={currentValue}
        onChange={(event) => handleChange(event.target.value)}
        disabled={isPending}
        aria-label="Change status"
        className="text-xs"
      >
        {STATUS_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </div>
  );
}
