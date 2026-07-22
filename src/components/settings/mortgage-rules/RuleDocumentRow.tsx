"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { RuleDocumentFormFields } from "./RuleDocumentFormFields";
import { updateRuleDocument, removeRuleDocument, type RuleDocumentFormState } from "@/app/(app)/settings/mortgage-rules/actions";
import type { DocumentTypeWithCategory } from "@/lib/database/mortgage-rules-admin";
import type { RuleDocumentItem } from "@/lib/mortgage-rules/types";

const initialState: RuleDocumentFormState = { fieldErrors: {}, formError: null };

export function RuleDocumentRow({
  ruleId,
  item,
  documentTypes,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  isReordering,
}: {
  ruleId: string;
  item: RuleDocumentItem;
  documentTypes: DocumentTypeWithCategory[];
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isReordering: boolean;
}) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const action = updateRuleDocument.bind(null, item.id, ruleId);
  const [state, formAction, isPending] = useActionState(action, initialState);

  async function handleRemove() {
    if (!window.confirm(`Remove "${item.documentTypeName}" from this rule?`)) return;
    setIsRemoving(true);
    const result = await removeRuleDocument(item.id, ruleId);
    setIsRemoving(false);
    if (result.error) {
      window.alert(result.error);
      return;
    }
    router.refresh();
  }

  if (isEditing) {
    return (
      <TableRow>
        <TableCell colSpan={7}>
          <form
            action={(formData) => {
              formAction(formData);
            }}
            className="space-y-2 py-2"
          >
            <RuleDocumentFormFields
              documentTypes={documentTypes}
              defaultValues={{
                documentTypeId: item.documentTypeId,
                requiredCount: item.requiredCount,
                requiredMonths: item.requiredMonths,
                isMandatory: item.isMandatory,
                notes: item.notes,
              }}
              disabled={isPending}
              fieldErrors={state.fieldErrors}
            />
            {state.formError && <p className="text-xs text-rose-600">{state.formError}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setIsEditing(false)} disabled={isPending}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={isPending}>
                {isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          </form>
        </TableCell>
      </TableRow>
    );
  }

  return (
    <TableRow>
      <TableCell>{item.categoryName ?? "Uncategorized"}</TableCell>
      <TableCell className="font-medium text-slate-900">{item.documentTypeName}</TableCell>
      <TableCell>{item.requiredCount}</TableCell>
      <TableCell>{item.requiredMonths ?? "-"}</TableCell>
      <TableCell>
        <Badge variant={item.isMandatory ? "default" : "neutral"}>{item.isMandatory ? "Mandatory" : "Optional"}</Badge>
      </TableCell>
      <TableCell className="max-w-[200px] truncate text-slate-500">{item.notes ?? "-"}</TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          <Button type="button" variant="ghost" size="sm" onClick={onMoveUp} disabled={isFirst || isReordering} title="Move up">
            ↑
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onMoveDown} disabled={isLast || isReordering} title="Move down">
            ↓
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setIsEditing(true)}>
            Edit
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-rose-600 hover:bg-rose-50"
            onClick={handleRemove}
            disabled={isRemoving}
          >
            Remove
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
