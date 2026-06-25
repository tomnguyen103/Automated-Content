import "server-only";

import { env } from "@/lib/env";
import { mediaGenerationTaskIds, type MediaGenerationJobRecord } from "@/lib/jobs/types";

export type TriggerDispatchHandle = {
  mode: "trigger.dev" | "local";
  publicAccessToken?: string;
  runId: string;
  taskId: string;
};

export type TriggerDispatchClient = {
  trigger: (
    taskId: string,
    payload: Record<string, unknown>,
    options: {
      concurrencyKey?: string;
      delay?: Date | string;
      idempotencyKey?: string;
      maxAttempts?: number;
      metadata?: Record<string, unknown>;
      queue?: string;
      tags?: string[];
      ttl?: number | string;
    }
  ) => Promise<{
    id: string;
    publicAccessToken?: string;
  }>;
};

export function isTriggerRuntimeConfigured(envMap: Pick<typeof env, "TRIGGER_SECRET_KEY"> = env) {
  return Boolean(envMap.TRIGGER_SECRET_KEY);
}

async function getTriggerTasksClient(): Promise<TriggerDispatchClient> {
  const { tasks } = await import("@trigger.dev/sdk");

  return tasks as TriggerDispatchClient;
}

export async function dispatchTriggerTask({
  client,
  concurrencyKey,
  delay,
  envMap = env,
  idempotencyKey,
  localRunId,
  maxAttempts,
  metadata,
  payload,
  queue,
  tags,
  taskId,
  ttl
}: {
  taskId: string;
  payload: Record<string, unknown>;
  client?: TriggerDispatchClient;
  concurrencyKey?: string;
  delay?: Date | string;
  envMap?: Pick<typeof env, "TRIGGER_SECRET_KEY">;
  idempotencyKey?: string;
  localRunId?: string;
  maxAttempts?: number;
  metadata?: Record<string, unknown>;
  queue?: string;
  tags?: string[];
  ttl?: number | string;
}): Promise<TriggerDispatchHandle> {
  if (!isTriggerRuntimeConfigured(envMap)) {
    return {
      mode: "local",
      runId: localRunId ?? `local-trigger-${taskId}-${idempotencyKey ?? "run"}`,
      taskId
    };
  }

  const triggerClient = client ?? (await getTriggerTasksClient());
  const handle = await triggerClient.trigger(taskId, payload, {
    concurrencyKey,
    delay,
    idempotencyKey,
    maxAttempts,
    metadata,
    queue,
    tags,
    ttl
  });

  return {
    mode: "trigger.dev",
    publicAccessToken: handle.publicAccessToken,
    runId: handle.id,
    taskId
  };
}

export async function dispatchMediaGenerationJob({
  client,
  envMap = env,
  job
}: {
  job: MediaGenerationJobRecord;
  client?: TriggerDispatchClient;
  envMap?: Pick<typeof env, "TRIGGER_SECRET_KEY">;
}): Promise<TriggerDispatchHandle> {
  const taskId = mediaGenerationTaskIds[job.jobKind];
  const payload = {
    idempotencyKey: job.idempotencyKey,
    input: job.input,
    jobId: job.id,
    sourceAssetId: job.sourceAssetId,
    workspaceId: job.workspaceId
  };

  return dispatchTriggerTask({
    client,
    concurrencyKey: job.workspaceId,
    envMap,
    idempotencyKey: job.idempotencyKey ?? job.id,
    localRunId: `local-trigger-${job.id}`,
    payload,
    taskId
  });
}
