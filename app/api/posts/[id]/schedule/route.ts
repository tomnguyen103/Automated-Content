import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { connectedAccounts, platformVariants } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  ensureUsageAllowed,
  recordUsageForLimit,
  UsageLimitExceededError
} from "@/lib/billing/usage";
import { isDatabaseConfigured } from "@/lib/env";
import { providerKeys, type ProviderKey } from "@/lib/providers/types";
import {
  createScheduledPost,
  createSchedulerRepository
} from "@/lib/scheduler/create-scheduled-post";
import { resolvePersonalWorkspaceForUser } from "@/lib/workspaces/personal-workspace";

export const runtime = "nodejs";

const scheduleRequestSchema = z.object({
  provider: z.enum(providerKeys),
  connectedAccountId: z.string().uuid().nullable().optional(),
  scheduledFor: z.string().datetime(),
  metadata: z.record(z.string(), z.unknown()).optional()
});

async function platformVariantExistsForWorkspace({
  platformVariantId,
  workspaceId
}: {
  platformVariantId: string;
  workspaceId: string;
}) {
  if (!isDatabaseConfigured) {
    return true;
  }

  const [variant] = await getDb()
    .select({ id: platformVariants.id })
    .from(platformVariants)
    .where(and(eq(platformVariants.id, platformVariantId), eq(platformVariants.workspaceId, workspaceId)))
    .limit(1);

  return Boolean(variant);
}

async function connectedAccountExistsForWorkspace({
  connectedAccountId,
  provider,
  workspaceId
}: {
  connectedAccountId: string | null | undefined;
  provider: ProviderKey;
  workspaceId: string;
}) {
  if (!connectedAccountId || !isDatabaseConfigured) {
    return true;
  }

  const [account] = await getDb()
    .select({ id: connectedAccounts.id })
    .from(connectedAccounts)
    .where(
      and(
        eq(connectedAccounts.id, connectedAccountId),
        eq(connectedAccounts.workspaceId, workspaceId),
        eq(connectedAccounts.provider, provider),
        eq(connectedAccounts.status, "connected")
      )
    )
    .limit(1);

  return Boolean(account);
}

export async function POST(
  request: NextRequest,
  {
    params
  }: {
    params: Promise<{ id: string }>;
  }
) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  try {
    const { id: platformVariantId } = await params;
    const input = scheduleRequestSchema.parse(body);
    const workspace = await resolvePersonalWorkspaceForUser(user);
    const scheduledFor = new Date(input.scheduledFor);

    if (scheduledFor <= new Date()) {
      return NextResponse.json({ error: "Scheduled time must be in the future." }, { status: 400 });
    }

    const variantExists = await platformVariantExistsForWorkspace({
      platformVariantId,
      workspaceId: workspace.id
    });

    if (!variantExists) {
      return NextResponse.json({ error: "Platform variant not found." }, { status: 404 });
    }

    const accountExists = await connectedAccountExistsForWorkspace({
      connectedAccountId: input.connectedAccountId,
      provider: input.provider,
      workspaceId: workspace.id
    });

    if (!accountExists) {
      return NextResponse.json({ error: "Connected account not found." }, { status: 404 });
    }

    await ensureUsageAllowed({
      workspaceId: workspace.id,
      key: "scheduledPostsPerDay",
      skip: workspace.isLocalPreview
    });

    const result = await createScheduledPost({
      input: {
        workspaceId: workspace.id,
        platformVariantId,
        provider: input.provider,
        connectedAccountId: input.connectedAccountId ?? null,
        scheduledFor,
        metadata: input.metadata
      },
      repository: createSchedulerRepository({
        allowMemoryFallback: workspace.isLocalPreview
      })
    });
    await recordUsageForLimit({
      workspaceId: workspace.id,
      key: "scheduledPostsPerDay",
      sourceId: result.scheduledJob.id,
      metadata: {
        platformVariantId,
        provider: input.provider,
        scheduledFor: input.scheduledFor,
        userId: user.id
      },
      skip: workspace.isLocalPreview
    });

    return NextResponse.json(
      {
        scheduledJob: result.scheduledJob,
        enqueue: result.enqueue
      },
      {
        status: result.enqueue.status === "queued" ? 201 : 202
      }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Invalid schedule request.",
          issues: error.issues
        },
        { status: 400 }
      );
    }

    if (error instanceof UsageLimitExceededError) {
      return NextResponse.json(
        {
          error: error.message,
          usage: error.metric
        },
        { status: 429 }
      );
    }

    console.error("Unexpected schedule request error", error);
    return NextResponse.json({ error: "Unable to schedule post." }, { status: 500 });
  }
}
