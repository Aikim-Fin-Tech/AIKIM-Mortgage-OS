"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { duplicateRuleAction, setRuleActive } from "@/app/(app)/settings/mortgage-rules/actions";
import { PROFILE_DIMENSIONS } from "@/lib/mortgage-rules/profile-dimensions";
import type { MortgageRuleListItem } from "@/lib/mortgage-rules/types";

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-MY", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kuala_Lumpur",
  }).format(new Date(iso));
}

export function RulesListTable({ rules }: { rules: MortgageRuleListItem[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function handleToggleActive(rule: MortgageRuleListItem) {
    setPendingId(rule.id);
    const result = await setRuleActive(rule.id, !rule.isActive);
    setPendingId(null);
    if (result.error) {
      window.alert(result.error);
      return;
    }
    router.refresh();
  }

  async function handleDuplicate(ruleId: string) {
    setPendingId(ruleId);
    const result = await duplicateRuleAction(ruleId);
    setPendingId(null);
    if (result?.error) window.alert(result.error);
    // On success duplicateRuleAction redirects server-side.
  }

  if (rules.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-400 shadow-sm">
        No mortgage rules yet. Create the first one to start generating required-document checklists.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <Table>
        <TableHeader>
          <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
            <TableHead>Rule Name</TableHead>
            {PROFILE_DIMENSIONS.map((dim) => (
              <TableHead key={dim.key}>{dim.label}</TableHead>
            ))}
            <TableHead>Status</TableHead>
            <TableHead>Required Docs</TableHead>
            <TableHead>Updated</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </tr>
        </TableHeader>
        <TableBody>
          {rules.map((rule) => {
            const isPending = pendingId === rule.id;
            return (
              <TableRow key={rule.id}>
                <TableCell className="font-medium text-slate-900">{rule.ruleName}</TableCell>
                {PROFILE_DIMENSIONS.map((dim) => (
                  <TableCell key={dim.key}>{rule[dim.key] ?? "Any"}</TableCell>
                ))}
                <TableCell>
                  <Badge variant={rule.isActive ? "success" : "default"}>{rule.isActive ? "Active" : "Inactive"}</Badge>
                </TableCell>
                <TableCell>{rule.requiredDocumentCount}</TableCell>
                <TableCell>{formatDateTime(rule.updatedAt)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1.5">
                    <Link href={`/settings/mortgage-rules/${rule.id}`}>
                      <Button type="button" variant="outline" size="sm">
                        View / Edit
                      </Button>
                    </Link>
                    <Button type="button" variant="outline" size="sm" onClick={() => handleDuplicate(rule.id)} disabled={isPending}>
                      Duplicate
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => handleToggleActive(rule)} disabled={isPending}>
                      {rule.isActive ? "Deactivate" : "Activate"}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
