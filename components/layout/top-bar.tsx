import Link from "next/link";
import { Bell, Menu, Plus } from "lucide-react";
import { AuthControls } from "@/components/auth/auth-controls";
import { NavLinks } from "@/components/layout/nav-links";
import { brand } from "@/lib/design/tokens";
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
                <NavLinks />
              </nav>
            </div>
          </details>
          <div
            className="hidden rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2 lg:block"
            aria-label="Current workspace"
          >
            <p className="text-sm font-medium leading-4 text-[var(--color-text)]">Growth workspace</p>
            <p className="mt-0.5 text-xs leading-4 text-[var(--color-text-muted)]">{brand.shortName}</p>
          </div>
          <nav className="hidden items-center gap-1 md:flex" aria-label="Quick links">
            <Link
              href="/approvals"
              className="rounded-[var(--radius-md)] px-3 py-2 text-sm font-medium text-[var(--color-text-muted)] transition hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
            >
              Approvals
            </Link>
            <Link
              href="/analytics"
              className="rounded-[var(--radius-md)] px-3 py-2 text-sm font-medium text-[var(--color-text-muted)] transition hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
            >
              Analytics
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/create"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 text-sm font-medium text-white transition hover:bg-[var(--color-primary-strong)] active:translate-y-px"
          >
            <Plus size={16} aria-hidden="true" />
            Create
          </Link>
          <Link
            href="/approvals"
            className="inline-flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-text-muted)] transition hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
            aria-label="Open approvals"
          >
            <Bell size={17} aria-hidden="true" />
          </Link>
          {isClerkClientConfigured ? (
            <AuthControls surface="topbar" />
          ) : (
            <span
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-text)] text-sm font-semibold text-white"
              aria-label={userLabel}
              title={userLabel}
            >
              {user?.initials ?? "US"}
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
