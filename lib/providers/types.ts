export const providerKeys = ["mock", "meta", "linkedin", "x", "slack", "discord"] as const;

export type ProviderKey = (typeof providerKeys)[number];

export type ProviderGroup = "social" | "messaging";

export const providerCapabilities = [
  "text_post",
  "image_post",
  "video_post",
  "carousel",
  "scheduled_publish",
  "immediate_publish",
  "comment_ingest",
  "comment_reply",
  "metrics_sync"
] as const;

export type ProviderCapability = (typeof providerCapabilities)[number];

export type CapabilitySupport = {
  capability: ProviderCapability;
  supported: boolean;
  reason?: string;
};

export type ProviderCapabilityMap = Record<ProviderCapability, CapabilitySupport>;

export type ProviderConnectionStatus =
  | "connected"
  | "requires_configuration"
  | "unsupported"
  | "disconnected"
  | "error";

export type ProviderImplementationStatus = "mock" | "stub" | "live";

export type ProviderTokenSet = {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: Date;
  scopes?: string[];
  raw?: Record<string, unknown>;
};

export type ProviderConnectionInput = {
  workspaceId: string;
  providerAccountId?: string;
  displayName?: string;
  authorizationCode?: string;
  redirectUri?: string;
  tokens?: ProviderTokenSet;
  scopes?: string[];
  metadata?: Record<string, unknown>;
};

export type ProviderConnectionResult = {
  provider: ProviderKey;
  providerAccountId: string;
  displayName: string;
  status: ProviderConnectionStatus;
  tokenRef?: string;
  scopes: string[];
  capabilities: ProviderCapabilityMap;
  metadata?: Record<string, unknown>;
};

export type ProviderContext = {
  workspaceId: string;
  connectedAccountId?: string;
  providerAccountId?: string;
  tokenRef?: string | null;
};

export type ProviderPublishContent = {
  variantId: string;
  title: string;
  hook: string;
  body: string;
  cta: string;
  hashtags: string[];
  media: Array<Record<string, unknown>>;
};

export type ProviderPublishInput = ProviderContext & {
  scheduledJobId?: string;
  content: ProviderPublishContent;
  scheduledFor?: Date;
};

export type ProviderPublishResult = {
  provider: ProviderKey;
  providerPostId: string;
  status: "accepted" | "published";
  publishedAt: Date;
  url?: string;
  raw?: Record<string, unknown>;
};

export type ProviderReplyInput = ProviderContext & {
  commentId: string;
  message: string;
};

export type ProviderReplyResult = {
  provider: ProviderKey;
  providerReplyId: string;
  status: "accepted" | "sent";
  sentAt: Date;
  raw?: Record<string, unknown>;
};

export type ProviderMetricsInput = ProviderContext & {
  providerPostId: string;
  since?: Date;
};

export type ProviderMetricsResult = {
  provider: ProviderKey;
  providerPostId: string;
  metrics: {
    impressions?: number;
    engagements?: number;
    clicks?: number;
    comments?: number;
    shares?: number;
  };
  fetchedAt: Date;
  raw?: Record<string, unknown>;
};

export type NormalizedProviderError = {
  code: string;
  message: string;
  retryable: boolean;
  provider: ProviderKey;
  cause?: unknown;
};

export type ProviderAdapter = {
  key: ProviderKey;
  displayName: string;
  group: ProviderGroup;
  implementationStatus: ProviderImplementationStatus;
  website?: string;
  capabilities: ProviderCapabilityMap;
  connect: (input: ProviderConnectionInput) => Promise<ProviderConnectionResult>;
  refreshToken: (context: ProviderContext) => Promise<ProviderConnectionResult>;
  validateCapabilities: (context?: ProviderContext) => Promise<ProviderCapabilityMap>;
  publish: (input: ProviderPublishInput) => Promise<ProviderPublishResult>;
  replyToComment: (input: ProviderReplyInput) => Promise<ProviderReplyResult>;
  fetchMetrics: (input: ProviderMetricsInput) => Promise<ProviderMetricsResult>;
  normalizeError: (error: unknown) => NormalizedProviderError;
};
