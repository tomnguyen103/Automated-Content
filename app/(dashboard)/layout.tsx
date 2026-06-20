import type { ReactNode } from "react";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { TopBar } from "@/components/layout/top-bar";
import { getCurrentUser } from "@/lib/auth/current-user";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();

  return (
    <div className="shell-grid min-h-dvh bg-[var(--color-surface)]">
      <AppSidebar />
      <div className="min-w-0">
        <TopBar user={user} />
        {children}
      </div>
    </div>
  );
}
