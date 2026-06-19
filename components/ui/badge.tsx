import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type BadgeTone = "primary" | "community" | "premium" | "neutral" | "success";

const toneClasses: Record<BadgeTone, string> = {
  primary: "border-rose-200 bg-rose-50 text-rose-700",
  community: "border-teal-200 bg-teal-50 text-teal-700",
  premium: "border-amber-200 bg-amber-50 text-amber-700",
  neutral: "border-gray-200 bg-gray-50 text-gray-700",
  success: "border-green-200 bg-green-50 text-green-700"
};

export function Badge({
  className,
  tone = "neutral",
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[var(--radius-sm)] border px-2 py-1 text-xs font-medium",
        toneClasses[tone],
        className
      )}
      {...props}
    />
  );
}
