import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import SettingsPage from "@/app/(dashboard)/settings/page";

describe("SettingsPage", () => {
  it("renders linked settings surfaces without placeholder tabs", () => {
    const html = renderToStaticMarkup(React.createElement(SettingsPage));

    expect(html).toContain("Production readiness");
    expect(html).toContain('href="/billing"');
    expect(html).toContain('href="/connections"');
    expect(html).toContain('href="/brand-memory"');
    expect(html).toContain('href="/auto-replies"');
    expect(html).not.toContain("Implementation surface reserved");
    expect(html).not.toContain('aria-disabled="true"');
  });
});
