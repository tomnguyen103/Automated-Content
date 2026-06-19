import Link from "next/link";
import { Bell, ChevronDown, Menu, Plus, Search } from "lucide-react";
import { AuthControls } from "@/components/auth/auth-controls";
import { Button } from "@/components/ui/button";
import { brand, navItems } from "@/lib/design/tokens";
import type { CurrentAppUser } from "@/lib/auth/current-user";
import { isClerkClientConfigured } from "@/lib/env";

export function TopBar({ user }: { user: CurrentAppUser | null }) {
  const userLabel = user?.isLocalPreview ? "Local preview" : user?.name ?? "User menu";

  return (
    <header className="sticky top-0 z-20 border-b border-[var(--color-border)] bg-white/90 backdrop-blur">
      <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <details className="group relative lg:hidden">
            <summary
              aria-label="Open navigation"
              className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white text-[var(--color-text)] transition hover:bg-[var(--color-surface)] [&::-webkit-details-marker]:hidden"
            >
              <Menu size={18} aria-hidden="true" />
            </summary>
            <div className="absolute left-0 top-12 z-30 w-72 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-white p-2 shadow-lg">
              <div className="px-3 py-2">
                <p className="text-sm font-semibold">{brand.shortName}</p>
                <p className="text-xs text-[var(--color-text-muted)]">Growth workspace</p>
              </div>
              <nav className="mt-1 space-y-1" aria-label="Mobile navigation">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2 text-sm font-medium text-[var(--color-text-muted)] transition hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
                    >
                      <Icon size={17} aria-hidden="true" />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </div>
          </details>
          <button
            type="button"
            className="hidden rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2 text-sm font-medium lg:inline-flex"
          >
            Growth workspace
            <ChevronDown className="ml-2" size={15} aria-hidden="true" />
          </button>
          <label className="relative hidden min-w-72 md:block">
            <span className="sr-only">Search workspace</span>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-subtle)]"
              size={16}
              aria-hidden="true"
            />
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
            <Plus size={16} aria-hidden="true" />
            Create
          </Link>
          <Button variant="ghost" size="md" aria-label="Notifications">
            <Bell size={17} aria-hidden="true" />
          </Button>
          {isClerkClientConfigured ? (
            <AuthControls surface="topbar" />
          ) : (
            <button
              type="button"
              className="h-9 w-9 rounded-full bg-[var(--color-text)] text-sm font-semibold text-white"
              aria-label={userLabel}
            >
              {user?.initials ?? "US"}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
