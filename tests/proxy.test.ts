import { describe, expect, it } from "vitest";
import { protectedRoutePatterns } from "@/proxy";

describe("proxy route protection", () => {
  it("protects the autonomous agents control center with the dashboard routes", () => {
    expect(protectedRoutePatterns).toContain("/agents(.*)");
  });
});
