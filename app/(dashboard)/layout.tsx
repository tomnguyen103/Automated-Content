import type { ReactNode } from "react";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { TopBar } from "@/components/layout/top-bar";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="shell-grid min-h-dvh bg-[var(--color-surface)]">
      <AppSidebar />
      <div className="min-w-0">
        <TopBar />
        {children}
      </div>
    </div>
  );
}
