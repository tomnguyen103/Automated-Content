import Link from "next/link";
import { cn } from "@/lib/utils";

type SubNavProps = {
  items: Array<{ label: string; href?: string; active?: boolean }>;
};

export function SubNav({ items }: SubNavProps) {
  return (
    <div className="overflow-x-auto border-b border-[var(--color-border)] bg-white">
      <nav className="flex min-h-12 items-center gap-1 px-4 sm:px-6" aria-label="Page navigation">
        {items.map((item, index) => {
          const className = cn(
            "whitespace-nowrap rounded-[var(--radius-md)] px-3 py-2 text-sm font-medium transition",
            item.active
              ? "bg-rose-50 text-[var(--color-primary)]"
              : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
          );

          if (item.href) {
            return (
              <Link key={item.label} href={item.href} className={className}>
                {item.label}
              </Link>
            );
          }

          return (
            <span key={`${item.label}-${index}`} className={className}>
              {item.label}
            </span>
          );
        })}
      </nav>
    </div>
  );
}
