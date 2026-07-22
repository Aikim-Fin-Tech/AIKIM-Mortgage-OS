"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableHead, TableHeader } from "@/components/ui/table";
import { RuleDocumentFormFields } from "./RuleDocumentFormFields";
import { RuleDocumentRow } from "./RuleDocumentRow";
import { addRuleDocument, reorderRuleDocuments, type RuleDocumentFormState } from "@/app/(app)/settings/mortgage-rules/actions";
import type { DocumentTypeWithCategory } from "@/lib/database/mortgage-rules-admin";
import type { RuleDocumentItem } from "@/lib/mortgage-rules/types";

const initialState: RuleDocumentFormState = { fieldErrors: {}, formError: null };

export function RuleDocumentsManager({
  ruleId,
  ruleDocuments,
  documentTypes,
}: {
  ruleId: string;
  ruleDocuments: RuleDocumentItem[];
  documentTypes: DocumentTypeWithCategory[];
}) {
  const router = useRouter();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isReordering, setIsReordering] = useState(false);
  const action = addRuleDocument.bind(null, ruleId);
  const [state, formAction, isPending] = useActionState(action, initialState);

  async function handleMove(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= ruleDocuments.length) return;

    const reordered = [...ruleDocuments];
    [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];

    setIsReordering(true);
    const result = await reorderRuleDocuments(
      ruleId,
      reordered.map((item) => item.id),
    );
    setIsReordering(false);

    if (result.error) {
      window.alert(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 p-4 sm:p-5">
        <h2 className="text-base font-semibold text-slate-900">Required Documents</h2>
        <Button type="button" variant="outline" size="sm" onClick={() => setIsAddOpen((v) => !v)}>
          {isAddOpen ? "Cancel" : "Add Document"}
        </Button>
      </div>

      {isAddOpen && (
        <form
          action={(formData) => {
            formAction(formData);
          }}
          className="space-y-2 border-b border-slate-100 p-4 sm:p-5"
        >
          <RuleDocumentFormFields documentTypes={documentTypes} disabled={isPending} fieldErrors={state.fieldErrors} />
          {state.formError && <p className="text-xs text-rose-600">{state.formError}</p>}
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? "Adding..." : "Add"}
            </Button>
          </div>
        </form>
      )}

      {ruleDocuments.length === 0 ? (
        <p className="p-6 text-sm text-slate-400">No required documents added yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
              <TableHead>Category</TableHead>
              <TableHead>Document Name</TableHead>
              <TableHead>Required Count</TableHead>
              <TableHead>Required Months</TableHead>
              <TableHead>Mandatory</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {ruleDocuments.map((item, index) => (
              <RuleDocumentRow
                // Remounts (closing any open edit form) whenever this row's
                // saved content actually changes — same pattern as
                // BorrowerProfileCard, avoids an effect/ref-during-render.
                key={`${item.id}:${item.requiredCount}:${item.requiredMonths}:${item.isMandatory}:${item.notes}:${item.documentTypeId}`}
                ruleId={ruleId}
                item={item}
                documentTypes={documentTypes}
                isFirst={index === 0}
                isLast={index === ruleDocuments.length - 1}
                onMoveUp={() => handleMove(index, -1)}
                onMoveDown={() => handleMove(index, 1)}
                isReordering={isReordering}
              />
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
