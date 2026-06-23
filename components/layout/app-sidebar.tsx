import Link from "next/link";
import { Sparkles } from "lucide-react";
import { NavLinks } from "@/components/layout/nav-links";
import { brand } from "@/lib/design/tokens";

export function AppSidebar() {
  return (
    <aside className="hidden min-h-dvh border-r border-[var(--color-border)] bg-white px-3 py-4 lg:block">
      <Link href="/dashboard" className="flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-primary)] text-white">
          <Sparkles size={18} />
        </span>
        <span>
          <span className="block text-sm font-semibold">{brand.shortName}</span>
          <span className="block text-xs text-[var(--color-text-muted)]">AI content ops</span>
        </span>
      </Link>

      <nav className="mt-6 space-y-1" aria-label="Main navigation">
        <NavLinks />
      </nav>

      <div className="mt-8 rounded-[var(--radius-lg)] border border-amber-200 bg-amber-50 p-3">
        <p className="text-sm font-semibold text-amber-800">Premium capacity</p>
        <p className="mt-1 text-xs leading-5 text-amber-700">
          Plan for seven automated posts per day with scheduling, variants, and reply automation.
        </p>
      </div>
    </aside>
  );
}
