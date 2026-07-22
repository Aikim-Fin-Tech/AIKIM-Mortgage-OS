"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  createCategory,
  updateCategory,
  setCategoryActive,
  reorderCategories,
  type CategoryFormState,
} from "@/app/(app)/settings/document-categories/actions";
import type { DocumentCategoryItem } from "@/lib/mortgage-rules/types";

const initialState: CategoryFormState = { fieldErrors: {}, formError: null };

function CategoryRow({
  category,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  isReordering,
}: {
  category: DocumentCategoryItem;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isReordering: boolean;
}) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [isTogglingActive, setIsTogglingActive] = useState(false);
  const action = updateCategory.bind(null, category.id);
  const [state, formAction, isPending] = useActionState(action, initialState);

  async function handleToggleActive() {
    setIsTogglingActive(true);
    const result = await setCategoryActive(category.id, !category.isActive);
    setIsTogglingActive(false);
    if (result.error) {
      window.alert(result.error);
      return;
    }
    router.refresh();
  }

  if (isEditing) {
    return (
      <TableRow>
        <TableCell colSpan={4}>
          <form action={formAction} className="flex items-center gap-2 py-1">
            <Input name="name" defaultValue={category.name} disabled={isPending} className="max-w-xs" />
            {state.fieldErrors.name && <p className="text-xs text-rose-600">{state.fieldErrors.name}</p>}
            {state.formError && <p className="text-xs text-rose-600">{state.formError}</p>}
            <Button type="button" variant="outline" size="sm" onClick={() => setIsEditing(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? "Saving..." : "Save"}
            </Button>
          </form>
        </TableCell>
      </TableRow>
    );
  }

  return (
    <TableRow>
      <TableCell className="font-medium text-slate-900">{category.name}</TableCell>
      <TableCell>
        <Badge variant={category.isActive ? "success" : "default"}>{category.isActive ? "Active" : "Inactive"}</Badge>
      </TableCell>
      <TableCell>{category.displayOrder}</TableCell>
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
          <Button type="button" variant="ghost" size="sm" onClick={handleToggleActive} disabled={isTogglingActive}>
            {category.isActive ? "Deactivate" : "Activate"}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function CategoriesManager({ categories }: { categories: DocumentCategoryItem[] }) {
  const router = useRouter();
  const [isReordering, setIsReordering] = useState(false);
  const [state, formAction, isPending] = useActionState(createCategory, initialState);

  async function handleMove(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= categories.length) return;

    const reordered = [...categories];
    [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];

    setIsReordering(true);
    const result = await reorderCategories(reordered.map((c) => c.id));
    setIsReordering(false);

    if (result.error) {
      window.alert(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <form action={formAction} className="flex flex-wrap items-end gap-2 border-b border-slate-100 p-4 sm:p-5">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">New Category</label>
          <Input name="name" placeholder="e.g. Income Proof" disabled={isPending} className="w-64" />
          {state.fieldErrors.name && <p className="mt-1 text-xs text-rose-600">{state.fieldErrors.name}</p>}
        </div>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Adding..." : "Add Category"}
        </Button>
        {state.formError && <p className="text-xs text-rose-600">{state.formError}</p>}
      </form>

      {categories.length === 0 ? (
        <p className="p-6 text-sm text-slate-400">No document categories yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Order</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {categories.map((category, index) => (
              <CategoryRow
                key={`${category.id}:${category.name}:${category.isActive}`}
                category={category}
                isFirst={index === 0}
                isLast={index === categories.length - 1}
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
