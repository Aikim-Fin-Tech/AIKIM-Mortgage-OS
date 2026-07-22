import { forwardRef, type InputHTMLAttributes } from "react";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className = "", ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={`h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700
          placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none
          focus:ring-1 focus:ring-emerald-500 ${className}`}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";
