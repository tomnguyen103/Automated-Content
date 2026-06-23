"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navItems } from "@/lib/design/tokens";
import { cn } from "@/lib/utils";

type NavItem = (typeof navItems)[number];

export function isActiveNavItem(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function NavLinks({ items = navItems }: { items?: NavItem[] }) {
  const pathname = usePathname();

  return (
    <>
      {items.map((item) => {
        const Icon = item.icon;
        const active = isActiveNavItem(pathname, item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2 text-sm font-medium transition hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]",
              active
                ? "bg-rose-50 text-[var(--color-primary)]"
                : "text-[var(--color-text-muted)]"
            )}
            aria-current={active ? "page" : undefined}
          >
            <Icon size={17} aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </>
  );
}
