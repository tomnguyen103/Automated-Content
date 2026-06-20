import Link from "next/link";
import { cn } from "@/lib/utils";

type SubNavProps = {
  items: Array<{ label: string; href?: string; active?: boolean; disabled?: boolean; title?: string }>;
};

export function SubNav({ items }: SubNavProps) {
  return (
    <div className="overflow-x-auto border-b border-[var(--color-border)] bg-white">
      <nav className="flex min-h-12 items-center gap-1 px-4 sm:px-6" aria-label="Page navigation">
        {items.map((item, index) => {
          const isDisabled = item.disabled ?? (!item.href && !item.active);
          const className = cn(
            "whitespace-nowrap rounded-[var(--radius-md)] px-3 py-2 text-sm font-medium transition",
            item.active && "bg-rose-50 text-[var(--color-primary)]",
            !item.active &&
              !isDisabled &&
              "text-[var(--color-text-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]",
            isDisabled && "cursor-not-allowed text-[var(--color-text-muted)] opacity-60"
          );

          if (item.href) {
            return (
              <Link key={item.label} href={item.href} className={className} aria-current={item.active ? "page" : undefined}>
                {item.label}
              </Link>
            );
          }

          return (
            <span
              key={`${item.label}-${index}`}
              className={className}
              aria-current={item.active ? "page" : undefined}
              aria-disabled={isDisabled ? "true" : undefined}
              title={item.title ?? (isDisabled ? "Not available yet" : undefined)}
            >
              {item.label}
            </span>
          );
        })}
      </nav>
    </div>
  );
}
