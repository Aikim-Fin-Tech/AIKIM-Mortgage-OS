import type { ReactNode } from "react";

export type BadgeVariant = "default" | "success" | "warning" | "danger" | "info" | "neutral";

const variantClasses: Record<BadgeVariant, string> = {
  default: "bg-slate-100 text-slate-700",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  danger: "bg-rose-50 text-rose-600",
  info: "bg-sky-50 text-sky-700",
  neutral: "bg-violet-50 text-violet-700",
};

export function Badge({
  variant = "default",
  className = "",
  children,
}: {
  variant?: BadgeVariant;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium
        ${variantClasses[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
