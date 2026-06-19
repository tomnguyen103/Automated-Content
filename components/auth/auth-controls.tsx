"use client";

import { SignOutButton, UserButton, useUser } from "@clerk/nextjs";
import { LayoutDashboard, LogIn, LogOut, UserPlus } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type AuthControlsProps = {
  surface?: "marketing" | "topbar";
};

const baseButtonClasses =
  "inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-md)] border px-4 text-sm font-medium transition active:translate-y-px";

const buttonStyles = {
  dark: "border-transparent bg-[var(--color-text)] text-white hover:bg-black",
  outline:
    "border-[var(--color-border)] bg-white text-[var(--color-text)] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface)]"
};

const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
const appHref = (path: string) => (appUrl ? `${appUrl}${path}` : path);

function MarketingSignedOutControls() {
  return (
    <div className="flex items-center gap-2">
      <Link href={appHref("/sign-in")} className={cn(baseButtonClasses, buttonStyles.outline)}>
        <LogIn size={16} aria-hidden="true" />
        Sign in
      </Link>
      <Link href={appHref("/sign-up")} className={cn(baseButtonClasses, buttonStyles.dark)}>
        <UserPlus size={16} aria-hidden="true" />
        Get started
      </Link>
    </div>
  );
}

function TopbarSignedOutControls() {
  return (
    <Link href={appHref("/sign-in")} className={cn(baseButtonClasses, buttonStyles.outline, "px-3")}>
      <LogIn size={16} aria-hidden="true" />
      Sign in
    </Link>
  );
}

export function AuthControls({ surface = "marketing" }: AuthControlsProps) {
  const { isLoaded, isSignedIn } = useUser();

  if (!isLoaded) {
    return surface === "topbar" ? <TopbarSignedOutControls /> : <MarketingSignedOutControls />;
  }

  if (surface === "topbar") {
    return (
      <div className="flex items-center gap-2">
        {isSignedIn ? (
          <>
            <UserButton />
            <SignOutButton>
              <button type="button" className={cn(baseButtonClasses, buttonStyles.outline, "px-3")}>
                <LogOut size={16} aria-hidden="true" />
                Sign out
              </button>
            </SignOutButton>
          </>
        ) : (
          <TopbarSignedOutControls />
        )}
      </div>
    );
  }

  if (isSignedIn) {
    return (
      <div className="flex items-center gap-2">
        <Link href={appHref("/dashboard")} prefetch={false} className={cn(baseButtonClasses, buttonStyles.dark)}>
          <LayoutDashboard size={16} aria-hidden="true" />
          Dashboard
        </Link>
        <SignOutButton>
          <button type="button" className={cn(baseButtonClasses, buttonStyles.outline)}>
            <LogOut size={16} aria-hidden="true" />
            Sign out
          </button>
        </SignOutButton>
      </div>
    );
  }

  return <MarketingSignedOutControls />;
}
