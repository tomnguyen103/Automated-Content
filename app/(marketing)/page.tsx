import Link from "next/link";
import {
  ArrowRight,
  Bot,
  CalendarDays,
  CheckCircle2,
  MessageSquareReply,
  Play,
  Sparkles,
  Workflow
} from "lucide-react";
import { AuthControls } from "@/components/auth/auth-controls";
import { Badge } from "@/components/ui/badge";
import { platformLabels } from "@/lib/design/tokens";
import { appUrl, isClerkClientConfigured } from "@/lib/env";

const workflowSteps = [
  { label: "Research topic", icon: Sparkles, detail: "Sources, angle, audience" },
  { label: "Agent drafts", icon: Bot, detail: "Captions, variants, ideas" },
  { label: "Schedule", icon: CalendarDays, detail: "Seven posts per day" },
  { label: "Publish", icon: Workflow, detail: "Queue, retry, report" }
];

const appHref = (path: string) => {
  try {
    return new URL(path, appUrl).toString();
  } catch {
    return path;
  }
};

export default function MarketingPage() {
  return (
    <main id="main-content" className="min-h-dvh bg-white">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-4 py-5 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-primary)] text-white">
            <Sparkles size={18} />
          </span>
          <span className="text-sm font-semibold">Social Media Whisperer</span>
        </Link>
        <nav className="hidden items-center gap-6 text-sm font-medium text-[var(--color-text-muted)] md:flex">
          <a href="#workflow">Workflow</a>
          <a href="#platforms">Platforms</a>
          <a href="#pricing">Premium</a>
        </nav>
        {isClerkClientConfigured ? (
          <AuthControls />
        ) : (
          <Link
            href={appHref("/dashboard")}
            prefetch={false}
            className="inline-flex h-10 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-text)] px-4 text-sm font-medium text-white"
          >
            Open app
          </Link>
        )}
      </header>

      <section className="mx-auto grid max-w-7xl gap-10 px-4 pb-16 pt-10 sm:px-6 lg:grid-cols-[0.92fr_1.08fr] lg:px-8 lg:pb-24 lg:pt-16">
        <div className="flex flex-col justify-center">
          <Badge tone="primary">AI content research and scheduling agent</Badge>
          <h1 className="mt-5 max-w-3xl text-5xl font-semibold tracking-tight text-[var(--color-text)] sm:text-6xl">
            Turn one topic into a week of polished content.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-[var(--color-text-muted)]">
            Research ideas, generate platform-ready posts, schedule publishing, and handle keyword replies from one
            focused workspace.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href={appHref("/create")}
              prefetch={false}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-5 text-base font-medium text-white transition hover:bg-[var(--color-primary-strong)]"
            >
              Start creating
              <ArrowRight size={17} />
            </Link>
            <Link
              href={appHref("/dashboard")}
              prefetch={false}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white px-5 text-base font-medium text-[var(--color-text)] transition hover:bg-[var(--color-surface)]"
            >
              <Play size={17} />
              View dashboard
            </Link>
          </div>
          <div className="mt-8 grid max-w-xl grid-cols-3 gap-4">
            <div>
              <p className="text-3xl font-semibold">7</p>
              <p className="text-sm text-[var(--color-text-muted)]">posts per day</p>
            </div>
            <div>
              <p className="text-3xl font-semibold">8+</p>
              <p className="text-sm text-[var(--color-text-muted)]">platform targets</p>
            </div>
            <div>
              <p className="text-3xl font-semibold">24h</p>
              <p className="text-sm text-[var(--color-text-muted)]">queue coverage</p>
            </div>
          </div>
        </div>

        <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-sm">
          <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">Today&apos;s agent plan</p>
                <p className="text-xs text-[var(--color-text-muted)]">Creator launch campaign</p>
              </div>
              <Badge tone="community">Healthy queue</Badge>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {workflowSteps.map((step) => {
                const Icon = step.icon;
                return (
                  <div key={step.label} className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-4">
                    <Icon className="text-[var(--color-primary)]" size={19} />
                    <p className="mt-3 text-sm font-semibold">{step.label}</p>
                    <p className="mt-1 text-xs text-[var(--color-text-muted)]">{step.detail}</p>
                  </div>
                );
              })}
            </div>

            <div className="mt-5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Platform variants</p>
                <span className="text-xs text-[var(--color-text-muted)]">Review required</span>
              </div>
              <div className="mt-4 space-y-3">
                {["LinkedIn thought post", "Instagram caption", "Slack community note"].map((item, index) => (
                  <div key={item} className="flex items-center gap-3 rounded-[var(--radius-md)] bg-white p-3">
                    <CheckCircle2
                      size={17}
                      className={index === 0 ? "text-[var(--color-community)]" : "text-[var(--color-text-subtle)]"}
                    />
                    <span className="text-sm">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="workflow" className="border-y border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-14 sm:px-6 lg:grid-cols-4 lg:px-8">
          {workflowSteps.map((step) => {
            const Icon = step.icon;
            return (
              <div key={step.label} className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-white p-5">
                <Icon className="text-[var(--color-primary)]" />
                <h2 className="mt-4 text-base font-semibold">{step.label}</h2>
                <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">{step.detail}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section id="platforms" className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Plan once, adapt everywhere</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-text-muted)]">
              Platform-specific tabs keep long content workflows organized without hiding publishing constraints.
            </p>
          </div>
          <Badge tone="premium">Premium scheduling</Badge>
        </div>
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          {platformLabels.map((label) => (
            <div key={label} className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white px-3 py-4 text-center text-sm font-medium">
              {label}
            </div>
          ))}
        </div>
      </section>

      <section id="pricing" className="bg-[var(--color-text)] px-4 py-14 text-white sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Badge tone="premium">Premium</Badge>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight">Built for consistent publishing without burnout.</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-300">
              Premium unlocks seven posts per day, multi-platform scheduling, media transforms, keyword replies, and
              deeper analytics.
            </p>
          </div>
          <Link
            href={appHref("/billing")}
            prefetch={false}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-[var(--radius-md)] bg-white px-5 text-base font-medium text-[var(--color-text)]"
          >
            Compare plans
            <MessageSquareReply size={17} />
          </Link>
        </div>
      </section>
    </main>
  );
}
