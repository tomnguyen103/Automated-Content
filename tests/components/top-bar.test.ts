import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("TopBar", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock("next/navigation");
    vi.resetModules();
  });

  it("renders real navigation targets instead of inert search and notification controls", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "");
    vi.stubEnv("CLERK_SECRET_KEY", "");
    vi.doMock("next/navigation", () => ({
      usePathname: () => "/dashboard"
    }));
    const { TopBar } = await import("@/components/layout/top-bar");
    const html = renderToStaticMarkup(React.createElement(TopBar, { user: null }));

    expect(html).toContain('aria-label="Current workspace"');
    expect(html).toContain('href="/approvals"');
    expect(html).toContain('aria-label="Open approvals"');
    expect(html).toContain('href="/analytics"');
    expect(html).not.toContain("Search posts, media, jobs");
    expect(html).not.toContain('aria-label="Notifications"');
  });
});
