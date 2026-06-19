import Link from "next/link";
import { Bell, ChevronDown, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

export function TopBar() {
  return (
    <header className="sticky top-0 z-20 border-b border-[var(--color-border)] bg-white/90 backdrop-blur">
      <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button className="hidden rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2 text-sm font-medium lg:inline-flex">
            Growth workspace
            <ChevronDown className="ml-2" size={15} />
          </button>
          <label className="relative hidden min-w-72 md:block">
            <span className="sr-only">Search workspace</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-subtle)]" size={16} />
            <input
              className="h-10 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] pl-9 pr-3 text-sm"
              placeholder="Search posts, media, jobs"
            />
          </label>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/create"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 text-sm font-medium text-white transition hover:bg-[var(--color-primary-strong)] active:translate-y-px"
          >
            <Plus size={16} />
            Create
          </Link>
          <Button variant="ghost" size="md" aria-label="Notifications">
            <Bell size={17} />
          </Button>
          <button className="h-9 w-9 rounded-full bg-[var(--color-text)] text-sm font-semibold text-white" aria-label="User menu">
            H
          </button>
        </div>
      </div>
    </header>
  );
}
