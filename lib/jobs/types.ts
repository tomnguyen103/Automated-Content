import { z } from "zod";

export const mediaGenerationJobKinds = [
  "media.transcribe-video",
  "media.detect-short-clips",
  "media.render-short-clip",
  "media.generate-influencer-asset",
  "media.generate-avatar-video"
] as const;

export type MediaGenerationJobKind = (typeof mediaGenerationJobKinds)[number];

export const mediaGenerationJobStatuses = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "canceled"
] as const;

export type MediaGenerationJobStatus = (typeof mediaGenerationJobStatuses)[number];

export const mediaGenerationTaskIds: Record<MediaGenerationJobKind, MediaGenerationJobKind> =
  Object.fromEntries(mediaGenerationJobKinds.map((kind) => [kind, kind])) as Record<
    MediaGenerationJobKind,
    MediaGenerationJobKind
  >;

export type MediaGenerationJobRecord = {
  id: string;
  workspaceId: string;
  createdByUserId: string;
  jobKind: MediaGenerationJobKind;
  status: MediaGenerationJobStatus;
  idempotencyKey?: string;
  sourceAssetId?: string;
  triggerTaskId?: string;
  triggerRunId?: string;
  providerTaskId?: string;
  progress: number;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  cost: Record<string, unknown>;
  audit: Record<string, unknown>;
  error?: string;
  queuedAt: string;
  startedAt?: string;
  completedAt?: string;
  canceledAt?: string;
  createdAt: string;
  updatedAt: string;
};

export const mediaGenerationJobKindSchema = z.enum(mediaGenerationJobKinds);
export const mediaGenerationJobStatusSchema = z.enum(mediaGenerationJobStatuses);

export const createMediaGenerationJobSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(180).optional(),
  input: z.record(z.string(), z.unknown()).default({}),
  kind: mediaGenerationJobKindSchema,
  sourceAssetId: z.string().trim().min(1).max(240).optional()
});

export const updateMediaGenerationJobActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("cancel")
  }),
  z.object({
    action: z.literal("retry")
  })
]);

export type CreateMediaGenerationJobInput = z.infer<typeof createMediaGenerationJobSchema>;

export type MediaGenerationTaskPayload = {
  idempotencyKey?: string;
  input: Record<string, unknown>;
  jobId: string;
  sourceAssetId?: string;
  workspaceId: string;
};

export const mediaGenerationTaskPayloadSchema = z.object({
  idempotencyKey: z.string().optional(),
  input: z.record(z.string(), z.unknown()),
  jobId: z.string().min(1),
  sourceAssetId: z.string().optional(),
  workspaceId: z.string().min(1)
}) satisfies z.ZodType<MediaGenerationTaskPayload>;
