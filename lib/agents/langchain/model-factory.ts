import { z } from "zod";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatGoogle } from "@langchain/google";
import { ChatOpenAI } from "@langchain/openai";
import type { AiProvider } from "@/lib/agents/schemas/agent-run";
import type { ContentAgentInput, ContentIdea } from "@/lib/agents/schemas/content-pack";
import { env, type AppEnv } from "@/lib/env";
import type { BrandProfileOutput } from "@/lib/agents/tools/read-brand-profile";
import type { ResearchTopicOutput } from "@/lib/agents/tools/research-topic";
import type { RetrievePastPostsOutput } from "@/lib/agents/tools/retrieve-past-posts";

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
};

export type ContentModel = {
  provider: AiProvider;
  model: string;
  mode: "local" | "remote";
  generatePlan: (input: ContentAgentInput, context: ContentModelContext) => Promise<ContentModelPlan>;
};

type ModelFactoryEnv = Pick<AppEnv, "AI_PROVIDER" | "OPENAI_API_KEY" | "GEMINI_API_KEY">;

type ModelFactoryOptions = {
  env?: ModelFactoryEnv;
  model?: string;
  generatePlan?: ContentModel["generatePlan"];
};

const providerModels: Record<AiProvider, string> = {
  openai: "gpt-4.1-mini",
  gemini: "gemini-2.5-flash"
};

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
  const chatModel =
    provider === "openai"
      ? new ChatOpenAI({
          apiKey,
          model,
          temperature: 0.2
        })
      : new ChatGoogle({
          apiKey,
          model,
          temperature: 0.2
        });
  const structuredModel = chatModel.withStructuredOutput(contentModelPlanSchema, {
    name: "content_model_plan"
  });

  return structuredModel.invoke(buildModelMessages(input, context));
}

export function createContentModel(options: ModelFactoryOptions = {}): ContentModel {
  const runtimeEnv = options.env ?? env;
  const provider = runtimeEnv.AI_PROVIDER;
  const model = options.model ?? providerModels[provider];
  const forceLocalModel = process.env.PLAYWRIGHT_AUTH_LOCAL_PREVIEW === "1";
  const providerKey = forceLocalModel
    ? undefined
    : provider === "openai"
      ? runtimeEnv.OPENAI_API_KEY
      : runtimeEnv.GEMINI_API_KEY;

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
