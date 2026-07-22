import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { DocumentTypeWithCategory } from "@/lib/database/mortgage-rules-admin";

/** Shared by the Add form and each row's inline Edit form — one place for these 5 fields. */
export function RuleDocumentFormFields({
  documentTypes,
  defaultValues,
  disabled,
  fieldErrors,
}: {
  documentTypes: DocumentTypeWithCategory[];
  defaultValues?: {
    documentTypeId: string;
    requiredCount: number;
    requiredMonths: number | null;
    isMandatory: boolean;
    notes: string | null;
  };
  disabled: boolean;
  fieldErrors: Partial<Record<string, string>>;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-5 sm:items-start">
      <div className="sm:col-span-2">
        <Select name="documentTypeId" defaultValue={defaultValues?.documentTypeId ?? ""} className="w-full" disabled={disabled}>
          <option value="" disabled>
            Select document type...
          </option>
          {documentTypes.map((dt) => (
            <option key={dt.id} value={dt.id}>
              {dt.name}
              {dt.categoryName ? ` (${dt.categoryName})` : ""}
            </option>
          ))}
        </Select>
        {fieldErrors.documentTypeId && <p className="mt-1 text-xs text-rose-600">{fieldErrors.documentTypeId}</p>}
      </div>

      <div>
        <Input name="requiredCount" type="number" min={1} placeholder="Count" defaultValue={defaultValues?.requiredCount ?? 1} disabled={disabled} />
        {fieldErrors.requiredCount && <p className="mt-1 text-xs text-rose-600">{fieldErrors.requiredCount}</p>}
      </div>

      <div>
        <Input
          name="requiredMonths"
          type="number"
          min={1}
          placeholder="Months (opt.)"
          defaultValue={defaultValues?.requiredMonths ?? ""}
          disabled={disabled}
        />
        {fieldErrors.requiredMonths && <p className="mt-1 text-xs text-rose-600">{fieldErrors.requiredMonths}</p>}
      </div>

      <div className="flex items-center gap-2 pt-2">
        <input
          type="checkbox"
          name="isMandatory"
          defaultChecked={defaultValues?.isMandatory ?? true}
          disabled={disabled}
          className="h-4 w-4 rounded border-slate-300"
        />
        <label className="text-sm text-slate-600">Mandatory</label>
      </div>

      <div className="sm:col-span-5">
        <Input name="notes" placeholder="Notes (optional)" defaultValue={defaultValues?.notes ?? ""} disabled={disabled} />
      </div>
    </div>
  );
}
