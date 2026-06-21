import { describe, expect, it } from "vitest";
import { providerCapabilities } from "@/lib/providers/types";
import { metaProvider } from "@/lib/providers/meta";
import { mockProvider } from "@/lib/providers/mock";
import { providerAdapters, providerRegistry } from "@/lib/providers/registry";
import { xProvider } from "@/lib/providers/x";

const providerContext = {
  workspaceId: "00000000-0000-0000-0000-000000000001",
  providerAccountId: "acct_1"
};

describe("provider adapter contract", () => {
  it("registers every provider with a complete capability map", async () => {
    expect(Object.keys(providerRegistry)).toEqual(["mock", "meta", "linkedin", "x", "slack", "discord"]);

    for (const provider of providerAdapters) {
      const capabilities = await provider.validateCapabilities(providerContext);
      expect(["mock", "stub", "live"]).toContain(provider.implementationStatus);
      expect(Object.keys(capabilities)).toEqual([...providerCapabilities]);

      for (const capability of providerCapabilities) {
        expect(capabilities[capability].capability).toBe(capability);
        expect(typeof capabilities[capability].supported).toBe("boolean");

        if (!capabilities[capability].supported) {
          expect(capabilities[capability].reason).toBeTruthy();
        }
      }
    }
  });

  it("supports connect, publish, replies, and metrics through the mock provider", async () => {
    const connection = await mockProvider.connect({
      workspaceId: providerContext.workspaceId,
      providerAccountId: "mock_account",
      displayName: "Mock account"
    });

    expect(connection.status).toBe("connected");
    expect(connection.tokenRef).toContain("vault_mock_");
    expect(connection.capabilities.comment_reply.supported).toBe(true);

    const publish = await mockProvider.publish({
      ...providerContext,
      tokenRef: connection.tokenRef,
      content: {
        variantId: "variant_1",
        title: "Launch post",
        hook: "A useful hook",
        body: "A publishable post body",
        cta: "Read more",
        hashtags: ["#content"],
        media: []
      }
    });

    expect(publish.provider).toBe("mock");
    expect(publish.providerPostId).toContain("mock_post_");
    expect(publish.status).toBe("published");

    const reply = await mockProvider.replyToComment({
      ...providerContext,
      commentId: "comment_1",
      message: "Thanks for reading."
    });

    expect(reply.providerReplyId).toContain("mock_reply_");

    const metrics = await mockProvider.fetchMetrics({
      ...providerContext,
      providerPostId: publish.providerPostId
    });

    expect(metrics.metrics.impressions).toBeGreaterThan(0);
  });

  it("makes real-provider gaps explicit while keeping planned capabilities visible", async () => {
    expect(metaProvider.implementationStatus).toBe("stub");
    expect(metaProvider.capabilities.carousel.supported).toBe(true);
    await expect(
      metaProvider.publish({
        ...providerContext,
        content: {
          variantId: "variant_1",
          title: "Launch post",
          hook: "Hook",
          body: "Body",
          cta: "CTA",
          hashtags: [],
          media: []
        }
      })
    ).rejects.toMatchObject({
      code: "provider_configuration_required"
    });

    expect(xProvider.capabilities.comment_reply.supported).toBe(false);
    expect(xProvider.capabilities.comment_reply.reason).toContain("comment-agent phase");
    await expect(
      xProvider.replyToComment({
        ...providerContext,
        commentId: "comment_1",
        message: "Reply"
      })
    ).rejects.toMatchObject({
      code: "provider_capability_unsupported"
    });
  });
});
