import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SubNav } from "@/components/layout/sub-nav";

describe("SubNav", () => {
  it("marks current, linked, and unavailable items distinctly", () => {
    const html = renderToStaticMarkup(
      React.createElement(SubNav, {
        items: [
          { label: "Overview", active: true },
          { label: "Usage", href: "/billing" },
          { label: "Planned" }
        ]
      })
    );

    expect(html).toContain('aria-current="page"');
    expect(html).toContain('href="/billing"');
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('title="Not available yet"');
  });
});
