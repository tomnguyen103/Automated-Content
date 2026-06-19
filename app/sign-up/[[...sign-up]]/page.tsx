import { SignUp } from "@clerk/nextjs";
import { UserPlus } from "lucide-react";
import { isClerkClientConfigured } from "@/lib/env";

export default function SignUpPage() {
  return (
    <main id="main-content" className="flex min-h-dvh items-center justify-center bg-[var(--color-surface)] px-4 py-12">
      {isClerkClientConfigured ? (
        <SignUp
          path="/sign-up"
          routing="path"
          signInUrl="/sign-in"
          fallbackRedirectUrl="/dashboard"
        />
      ) : (
        <section className="w-full max-w-md rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-white p-6 shadow-sm">
          <div className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] bg-teal-50 text-[var(--color-community)]">
            <UserPlus size={20} aria-hidden="true" />
          </div>
          <h1 className="mt-5 text-xl font-semibold">Clerk sign-up is not configured</h1>
          <p className="mt-3 text-sm leading-6 text-[var(--color-text-muted)]">
            Add the Clerk publishable and secret keys from `.env.example` to enable account creation.
          </p>
        </section>
      )}
    </main>
  );
}
