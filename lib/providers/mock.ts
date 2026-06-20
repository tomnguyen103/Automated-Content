import { normalizeProviderError } from "@/lib/providers/errors";
import { defineProviderCapabilities } from "@/lib/providers/capabilities";
import type {
  ProviderAdapter,
  ProviderConnectionInput,
  ProviderMetricsInput,
  ProviderPublishInput,
  ProviderReplyInput
} from "@/lib/providers/types";
import { storeProviderTokens } from "@/lib/providers/token-vault";

export const mockProviderCapabilities = defineProviderCapabilities({
  supported: [
    "text_post",
    "image_post",
    "video_post",
    "carousel",
    "scheduled_publish",
    "immediate_publish",
    "comment_ingest",
    "comment_reply",
    "metrics_sync"
  ]
});

function createMockId(prefix: string, seed: string) {
  return `${prefix}_${Buffer.from(seed).toString("base64url").slice(0, 18)}`;
}

export const mockProvider: ProviderAdapter = {
  key: "mock",
  displayName: "Mock Provider",
  group: "social",
  capabilities: mockProviderCapabilities,
  async connect(input: ProviderConnectionInput) {
    const providerAccountId = input.providerAccountId ?? `mock_${input.workspaceId}`;
    const tokenResult = await storeProviderTokens({
      workspaceId: input.workspaceId,
      provider: "mock",
      providerAccountId,
      tokens: input.tokens ?? {
        accessToken: "mock_access_token",
        refreshToken: "mock_refresh_token",
        scopes: input.scopes ?? ["publish", "reply", "metrics"]
      }
    });

    return {
      provider: "mock",
      providerAccountId,
      displayName: input.displayName ?? "Local preview account",
      status: "connected",
      tokenRef: tokenResult.tokenRef,
      scopes: input.scopes ?? tokenResult.scopes,
      capabilities: mockProviderCapabilities,
      metadata: {
        mode: "local-preview",
        ...input.metadata
      }
    };
  },
  async refreshToken(context) {
    return this.connect({
      workspaceId: context.workspaceId,
      providerAccountId: context.providerAccountId,
      displayName: "Local preview account"
    });
  },
  async validateCapabilities() {
    return mockProviderCapabilities;
  },
  async publish(input: ProviderPublishInput) {
    const publishedAt = input.scheduledFor ?? new Date();

    return {
      provider: "mock",
      providerPostId: createMockId("mock_post", `${input.workspaceId}:${input.content.variantId}`),
      status: input.scheduledFor ? "accepted" : "published",
      publishedAt,
      url: `https://mock.provider/posts/${input.content.variantId}`,
      raw: {
        scheduledJobId: input.scheduledJobId ?? null,
        characterCount: input.content.body.length
      }
    };
  },
  async replyToComment(input: ProviderReplyInput) {
    return {
      provider: "mock",
      providerReplyId: createMockId("mock_reply", `${input.commentId}:${input.message}`),
      status: "sent",
      sentAt: new Date(),
      raw: {
        commentId: input.commentId
      }
    };
  },
  async fetchMetrics(input: ProviderMetricsInput) {
    return {
      provider: "mock",
      providerPostId: input.providerPostId,
      metrics: {
        impressions: 1200,
        engagements: 184,
        clicks: 31,
        comments: 12,
        shares: 8
      },
      fetchedAt: new Date(),
      raw: {
        since: input.since?.toISOString() ?? null
      }
    };
  },
  normalizeError(error) {
    return normalizeProviderError("mock", error);
  }
};
