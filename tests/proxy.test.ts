import { describe, expect, it } from "vitest";
import { navItems } from "@/lib/design/tokens";
import { protectedRoutePatterns } from "@/proxy";

describe("proxy route protection", () => {
  it("protects every dashboard navigation route", () => {
    for (const item of navItems) {
      expect(protectedRoutePatterns).toContain(`${item.href}(.*)`);
    }
  });
});
