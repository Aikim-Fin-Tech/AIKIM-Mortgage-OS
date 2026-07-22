import { forwardRef, type SelectHTMLAttributes } from "react";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className = "", children, ...props }, ref) => {
    return (
      <select
        ref={ref}
        className={`h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700
          focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 ${className}`}
        {...props}
      >
        {children}
      </select>
    );
  },
);
Select.displayName = "Select";
