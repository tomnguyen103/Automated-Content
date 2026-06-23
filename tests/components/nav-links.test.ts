import { describe, expect, it } from "vitest";
import { isActiveNavItem } from "@/components/layout/nav-links";

describe("isActiveNavItem", () => {
  it("matches exact routes and nested descendants", () => {
    expect(isActiveNavItem("/calendar", "/calendar")).toBe(true);
    expect(isActiveNavItem("/calendar/settings", "/calendar")).toBe(true);
    expect(isActiveNavItem("/calendar", "/dashboard")).toBe(false);
  });
});
