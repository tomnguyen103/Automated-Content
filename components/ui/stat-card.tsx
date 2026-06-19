import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type StatCardProps = {
  label: string;
  value: string;
  detail: string;
  tone?: "primary" | "community" | "premium" | "success";
};

const toneAccent = {
  primary: "bg-[var(--color-primary)]",
  community: "bg-[var(--color-community)]",
  premium: "bg-[var(--color-premium)]",
  success: "bg-[var(--color-success)]"
};

export function StatCard({ label, value, detail, tone = "primary" }: StatCardProps) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-[var(--color-text-muted)]">{label}</p>
        <span className={cn("h-2 w-2 rounded-full", toneAccent[tone])} />
      </div>
      <div className="mt-4 flex items-end justify-between gap-4">
        <p className="text-3xl font-semibold tracking-tight">{value}</p>
        <Badge tone={tone === "primary" ? "primary" : tone === "premium" ? "premium" : tone === "community" ? "community" : "success"}>
          {detail}
        </Badge>
      </div>
    </div>
  );
}
