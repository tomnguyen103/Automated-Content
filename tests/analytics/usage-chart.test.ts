import { describe, expect, it } from "vitest";
import { getBarWidth } from "@/components/analytics/usage-chart";

describe("getBarWidth", () => {
  it("does not render a visible bar for zero usage", () => {
    expect(getBarWidth(0, 10)).toBe("0%");
  });

  it("keeps a minimum visible width for nonzero usage", () => {
    expect(getBarWidth(1, 100)).toBe("6%");
  });
});
