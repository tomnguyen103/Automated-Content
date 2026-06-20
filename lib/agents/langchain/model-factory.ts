import { z } from "zod";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatGoogle } from "@langchain/google";
import { ChatOpenAI } from "@langchain/openai";
import type { AiProvider } from "@/lib/agents/schemas/agent-run";
import type { CommentReplyInput } from "@/lib/agents/schemas/comment-reply";
import type { ContentAgentInput, ContentIdea } from "@/lib/agents/schemas/content-pack";
import { env, type AppEnv } from "@/lib/env";
import type { BrandProfileOutput } from "@/lib/agents/tools/read-brand-profile";
import type { ResearchTopicOutput } from "@/lib/agents/tools/research-topic";
import type { RetrievePastPostsOutput } from "@/lib/agents/tools/retrieve-past-posts";
import { createLangSmithRunConfig } from "@/lib/observability/langsmith";

export const contentModelPlanSchema = z.object({
  summary: z.string().min(1),
  ideas: z.array(
    z.object({
      id: z.string().min(1),
      title: z.string().min(1),
      angle: z.string().min(1),
      audiencePromise: z.string().min(1)
    })
  ).min(1).max(6),
  captions: z.array(z.string().min(1)).min(1).max(6),
  hashtags: z.array(z.string().min(2)).min(1).max(16),
  ctaOptions: z.array(z.string().min(1)).min(1).max(6),
  warnings: z.array(z.string().min(1)).max(12)
});

export type ContentModelPlan = z.infer<typeof contentModelPlanSchema>;

export type ContentModelContext = {
  traceId: string;
  research: ResearchTopicOutput;
  brandProfile: BrandProfileOutput;
  pastPosts: RetrievePastPostsOutput;
  metadata?: Record<string, unknown>;
};

export type ContentModel = {
  provider: AiProvider;
  model: string;
  mode: "local" | "remote";
  generatePlan: (input: ContentAgentInput, context: ContentModelContext) => Promise<ContentModelPlan>;
};

export const commentModelDraftSchema = z.object({
  replyDraft: z.string().min(1).max(500),
  confidence: z.number().min(0).max(1),
  auditNotes: z.array(z.string().min(1))
});

export type CommentModelDraft = z.infer<typeof commentModelDraftSchema>;

export type CommentModelContext = {
  traceId: string;
  metadata?: Record<string, unknown>;
};

export type CommentModel = {
  provider: AiProvider;
  model: string;
  mode: "local" | "remote";
  draftReply: (input: CommentReplyInput, context: CommentModelContext) => Promise<CommentModelDraft>;
};

type ModelFactoryEnv = Pick<AppEnv, "AI_PROVIDER" | "OPENAI_API_KEY" | "GEMINI_API_KEY">;

type ContentModelFactoryOptions = {
  env?: ModelFactoryEnv;
  model?: string;
  generatePlan?: ContentModel["generatePlan"];
};

type CommentModelFactoryOptions = {
  env?: ModelFactoryEnv;
  model?: string;
  draftReply?: CommentModel["draftReply"];
};

const providerModels: Record<AiProvider, string> = {
  openai: "gpt-4.1-mini",
  gemini: "gemini-2.5-flash"
};

const remoteModelTimeoutMs = 30_000;
const remoteModelMaxRetries = 2;

function toHashTag(keyword: string) {
  const compact = keyword.replace(/[^a-zA-Z0-9]/g, "");
  return compact ? `#${compact}` : null;
}

function buildIdeas(input: ContentAgentInput, context: ContentModelContext): ContentIdea[] {
  const angles = context.research.angles.length > 0 ? context.research.angles : [`Explain ${input.topic}`];

  return angles.slice(0, 3).map((angle, index) => ({
    id: `idea_${index + 1}`,
    title: index === 0 ? `Make ${input.topic} actionable` : `Angle ${index + 1}: ${input.topic}`,
    angle,
    audiencePromise: `Give ${input.audience} a clear next step they can apply today.`
  }));
}

function buildLocalPlan(input: ContentAgentInput, context: ContentModelContext): ContentModelPlan {
  const ideas = buildIdeas(input, context);
  const keywords = [...new Set([...context.research.keywords, "content", "workflow"])];
  const hashtags = keywords.map(toHashTag).filter((tag): tag is string => Boolean(tag)).slice(0, 10);
  const strongestPastPost = context.pastPosts.posts[0];

  return {
    summary: [
      context.research.summary,
      `Brand voice should stay ${context.brandProfile.voice}.`,
      strongestPastPost ? `Avoid repeating "${strongestPastPost.title}" too closely.` : null
    ].filter(Boolean).join(" "),
    ideas,
    captions: ideas.map(
      (idea) =>
        `${idea.title}: ${idea.angle}. The practical takeaway for ${input.audience} is to make the workflow visible before scaling it.`
    ),
    hashtags,
    ctaOptions: [
      "Save this for your next planning session.",
      "Reply with the platform you want to improve first.",
      "Turn this into one draft before you automate the next step."
    ],
    warnings:
      input.sources.length === 0
        ? ["No source material was provided, so research notes are directional."]
        : []
  };
}

function getFirstName(name: string | undefined) {
  return name?.trim().split(/\s+/)[0] ?? "";
}

function truncateText(value: string, maxLength: number) {
  const normalized = value.trim().replace(/\s+/g, " ");

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function clampReplyDraft(value: string) {
  return value.length <= 500 ? value : `${value.slice(0, 497).trimEnd()}...`;
}

function buildLocalCommentDraft(input: CommentReplyInput): CommentModelDraft {
  const name = getFirstName(input.comment.authorName);
  const greeting = name ? `Thanks, ${name}.` : "Thanks for the note.";
  const postContext = input.postContext.title ? ` On ${truncateText(input.postContext.title, 80)},` : "";

  return {
    replyDraft: clampReplyDraft(
      `${greeting}${postContext} we can help with that. I will flag this for a human review so the reply stays accurate.`
    ),
    confidence: 0.72,
    auditNotes: ["No keyword rule matched. Created a model-backed suggestion for human approval."]
  };
}

function buildModelMessages(input: ContentAgentInput, context: ContentModelContext) {
  return [
    new SystemMessage(
      [
        "You are a senior social content strategist inside a SaaS content planning product.",
        "Return a concise, structured content plan that the application can validate with Zod.",
        "Do not include unsafe publishing claims. Keep every idea specific, useful, and review-ready."
      ].join(" ")
    ),
    new HumanMessage(
      JSON.stringify(
        {
          brief: input,
          research: context.research,
          brandProfile: context.brandProfile,
          pastPosts: context.pastPosts,
          traceId: context.traceId
        },
        null,
        2
      )
    )
  ];
}

function buildCommentModelMessages(input: CommentReplyInput, context: CommentModelContext) {
  return [
    new SystemMessage(
      [
        "You are drafting a short social reply suggestion inside an approval-gated SaaS workflow.",
        "Do not claim the reply has been sent. Avoid guarantees, pricing commitments, legal advice, or support promises.",
        "Return only a concise structured draft that a human can approve before sending."
      ].join(" ")
    ),
    new HumanMessage(
      JSON.stringify(
        {
          comment: input.comment,
          postContext: input.postContext,
          brandVoice: input.brandVoice,
          traceId: context.traceId
        },
        null,
        2
      )
    )
  ];
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(new Error(`Remote model invocation timed out after ${timeoutMs}ms.`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function resolveProviderConfig(runtimeEnv: ModelFactoryEnv, modelOverride: string | undefined) {
  const provider = runtimeEnv.AI_PROVIDER;
  const model = modelOverride ?? providerModels[provider];
  const forceLocalModel = process.env.PLAYWRIGHT_AUTH_LOCAL_PREVIEW === "1";
  const providerKey = forceLocalModel
    ? undefined
    : provider === "openai"
      ? runtimeEnv.OPENAI_API_KEY
      : runtimeEnv.GEMINI_API_KEY;

  return {
    provider,
    model,
    providerKey
  };
}

function createStructuredChatModel({
  apiKey,
  model,
  provider
}: {
  apiKey: string;
  model: string;
  provider: AiProvider;
}) {
  return provider === "openai"
    ? new ChatOpenAI({
        apiKey,
        model,
        temperature: 0.2,
        timeout: remoteModelTimeoutMs,
        maxRetries: remoteModelMaxRetries
      })
    : new ChatGoogle({
        apiKey,
        model,
        temperature: 0.2,
        maxRetries: remoteModelMaxRetries
      });
}

async function generateRemotePlan({
  provider,
  model,
  apiKey,
  input,
  context
}: {
  provider: AiProvider;
  model: string;
  apiKey: string;
  input: ContentAgentInput;
  context: ContentModelContext;
}) {
  const chatModel = createStructuredChatModel({ apiKey, model, provider });
  const structuredModel = chatModel.withStructuredOutput(contentModelPlanSchema, {
    name: "content_model_plan"
  });
  const runConfig = createLangSmithRunConfig({
    runName: "content_model_plan",
    traceId: context.traceId,
    tags: ["langchain", "content-plan", provider, model],
    metadata: {
      ...context.metadata,
      model,
      provider
    }
  });

  return withTimeout(
    structuredModel.invoke(buildModelMessages(input, context), {
      ...runConfig,
      timeout: remoteModelTimeoutMs
    }),
    remoteModelTimeoutMs
  );
}

async function generateRemoteCommentDraft({
  provider,
  model,
  apiKey,
  input,
  context
}: {
  provider: AiProvider;
  model: string;
  apiKey: string;
  input: CommentReplyInput;
  context: CommentModelContext;
}) {
  const chatModel = createStructuredChatModel({ apiKey, model, provider });
  const structuredModel = chatModel.withStructuredOutput(commentModelDraftSchema, {
    name: "comment_reply_draft"
  });
  const runConfig = createLangSmithRunConfig({
    runName: "comment_reply_draft",
    traceId: context.traceId,
    tags: ["langchain", "comment-reply", provider, model],
    metadata: {
      ...context.metadata,
      model,
      provider
    }
  });

  return withTimeout(
    structuredModel.invoke(buildCommentModelMessages(input, context), {
      ...runConfig,
      timeout: remoteModelTimeoutMs
    }),
    remoteModelTimeoutMs
  );
}

export function createContentModel(options: ContentModelFactoryOptions = {}): ContentModel {
  const runtimeEnv = options.env ?? env;
  const { provider, model, providerKey } = resolveProviderConfig(runtimeEnv, options.model);

  return {
    provider,
    model,
    mode: providerKey ? "remote" : "local",
    async generatePlan(input, context) {
      const plan = options.generatePlan
        ? await options.generatePlan(input, context)
        : providerKey
          ? await generateRemotePlan({
              provider,
              model,
              apiKey: providerKey,
              input,
              context
            })
          : buildLocalPlan(input, context);

      return contentModelPlanSchema.parse(plan);
    }
  };
}

export function createCommentModel(options: CommentModelFactoryOptions = {}): CommentModel {
  const runtimeEnv = options.env ?? env;
  const { provider, model, providerKey } = resolveProviderConfig(runtimeEnv, options.model);

  return {
    provider,
    model,
    mode: providerKey ? "remote" : "local",
    async draftReply(input, context) {
      const draft = options.draftReply
        ? await options.draftReply(input, context)
        : providerKey
          ? await generateRemoteCommentDraft({
              provider,
              model,
              apiKey: providerKey,
              input,
              context
            })
          : buildLocalCommentDraft(input);

      return commentModelDraftSchema.parse(draft);
    }
  };
}
