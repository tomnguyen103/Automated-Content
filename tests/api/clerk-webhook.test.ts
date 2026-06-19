import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/webhooks/clerk/route";

describe("Clerk webhook route", () => {
  it("rejects unsigned webhook requests", async () => {
    const request = new NextRequest("http://localhost:3000/api/webhooks/clerk", {
      method: "POST",
      body: JSON.stringify({ type: "user.created", data: {} })
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid Clerk webhook signature"
    });
  });
});
