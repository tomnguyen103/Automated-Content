import "server-only";

import { env, type AppEnv } from "@/lib/env";

type LangSmithEnv = Pick<AppEnv, "LANGSMITH_API_KEY" | "LANGSMITH_PROJECT">;

export type LangSmithRunConfigInput = {
  metadata?: Record<string, unknown>;
  runName: string;
  tags?: string[];
  traceId: string;
};

function compactMetadata(metadata: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(metadata).filter(([, value]) => value !== undefined && value !== null && value !== "")
  );
}

export function configureLangSmith(runtimeEnv: LangSmithEnv = env) {
  if (!runtimeEnv.LANGSMITH_API_KEY) {
    return false;
  }

  process.env.LANGCHAIN_TRACING_V2 ??= "true";
  process.env.LANGCHAIN_API_KEY ??= runtimeEnv.LANGSMITH_API_KEY;
  process.env.LANGCHAIN_PROJECT ??= runtimeEnv.LANGSMITH_PROJECT ?? "automated-content-agent";
  process.env.LANGCHAIN_CALLBACKS_BACKGROUND ??= "true";

  return true;
}

export function createLangSmithRunConfig({
  metadata = {},
  runName,
  tags = [],
  traceId
}: LangSmithRunConfigInput) {
  const enabled = configureLangSmith();

  return {
    runName,
    tags: ["automated-content", ...tags],
    metadata: compactMetadata({
      app: "automated-content-agent",
      langsmithEnabled: enabled,
      langsmithProject: env.LANGSMITH_PROJECT,
      traceId,
      ...metadata
    })
  };
}
