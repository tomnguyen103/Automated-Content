import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { connectedAccounts, platformVariants } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  consumeUsageForLimit,
  ensureFeatureAllowed,
  FeatureAccessError,
  UsageLimitExceededError
} from "@/lib/billing/usage";
import { isDatabaseConfigured } from "@/lib/env";
import type { SocialPlatform } from "@/lib/agents/schemas/platform-variant";
import {
  formatProviderPlatformError,
  isProviderCompatibleWithPlatform
} from "@/lib/providers/platform-compatibility";
import {
  evaluateProviderHealth,
  isProviderHealthBlocking,
  type ProviderHealthAccount
} from "@/lib/providers/health";
import { getProviderAdapter } from "@/lib/providers/registry";
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

type ScheduleablePlatformVariant = {
  id: string;
  platform: SocialPlatform | null;
  policyStatus: string;
};

async function loadPlatformVariantForWorkspace({
  platformVariantId,
  workspaceId
}: {
  platformVariantId: string;
  workspaceId: string;
}): Promise<ScheduleablePlatformVariant | null> {
  if (!isDatabaseConfigured) {
    return {
      id: platformVariantId,
      platform: null,
      policyStatus: "pass"
    };
  }

  const [variant] = await getDb()
    .select({
      id: platformVariants.id,
      platform: platformVariants.platform,
      policyStatus: platformVariants.policyStatus
    })
    .from(platformVariants)
    .where(and(eq(platformVariants.id, platformVariantId), eq(platformVariants.workspaceId, workspaceId)))
    .limit(1);

  return variant ?? null;
}

async function loadConnectedAccountForWorkspace({
  connectedAccountId,
  provider,
  workspaceId
}: {
  connectedAccountId: string | null | undefined;
  provider: ProviderKey;
  workspaceId: string;
}): Promise<ProviderHealthAccount | null> {
  if (!connectedAccountId || !isDatabaseConfigured) {
    return null;
  }

  const [account] = await getDb()
    .select({
      id: connectedAccounts.id,
      status: connectedAccounts.status,
      scopes: connectedAccounts.scopes,
      capabilities: connectedAccounts.capabilities,
      lastValidatedAt: connectedAccounts.lastValidatedAt
    })
    .from(connectedAccounts)
    .where(
      and(
        eq(connectedAccounts.id, connectedAccountId),
        eq(connectedAccounts.workspaceId, workspaceId),
        eq(connectedAccounts.provider, provider)
      )
    )
    .limit(1);

  return account ?? null;
}

async function loadDefaultConnectedAccountForWorkspace({
  provider,
  workspaceId
}: {
  provider: ProviderKey;
  workspaceId: string;
}): Promise<ProviderHealthAccount | null> {
  if (!isDatabaseConfigured) {
    return null;
  }

  const [account] = await getDb()
    .select({
      id: connectedAccounts.id,
      status: connectedAccounts.status,
      scopes: connectedAccounts.scopes,
      capabilities: connectedAccounts.capabilities,
      lastValidatedAt: connectedAccounts.lastValidatedAt
    })
    .from(connectedAccounts)
    .where(
      and(
        eq(connectedAccounts.workspaceId, workspaceId),
        eq(connectedAccounts.provider, provider),
        eq(connectedAccounts.status, "connected")
      )
    )
    .limit(1);

  return account ?? null;
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

    const variant = await loadPlatformVariantForWorkspace({
      platformVariantId,
      workspaceId: workspace.id
    });

    if (!variant) {
      return NextResponse.json({ error: "Platform variant not found." }, { status: 404 });
    }

    if (variant.policyStatus !== "pass") {
      return NextResponse.json({ error: "Platform variant is not approved for scheduling." }, { status: 409 });
    }

    if (
      variant.platform &&
      !isProviderCompatibleWithPlatform({
        allowMock: workspace.isLocalPreview,
        platform: variant.platform,
        provider: input.provider
      })
    ) {
      return NextResponse.json(
        { error: formatProviderPlatformError(input.provider, variant.platform) },
        { status: 400 }
      );
    }

    const connectedAccount = input.connectedAccountId
      ? await loadConnectedAccountForWorkspace({
          connectedAccountId: input.connectedAccountId,
          provider: input.provider,
          workspaceId: workspace.id
        })
      : await loadDefaultConnectedAccountForWorkspace({
          provider: input.provider,
          workspaceId: workspace.id
        });
    const resolvedConnectedAccountId = connectedAccount?.id ?? input.connectedAccountId ?? null;

    if (input.connectedAccountId && !connectedAccount && isDatabaseConfigured) {
      return NextResponse.json({ error: "Connected account not found." }, { status: 404 });
    }

    const providerHealth = evaluateProviderHealth({
      adapter: getProviderAdapter(input.provider),
      allowMock: workspace.isLocalPreview,
      connectedAccount,
      connectedAccountId: resolvedConnectedAccountId,
      requiredCapability: "scheduled_publish"
    });

    if (isProviderHealthBlocking(providerHealth)) {
      return NextResponse.json(
        {
          error: providerHealth.blockingReason ?? "Provider is not ready for scheduling.",
          providerHealth
        },
        { status: 409 }
      );
    }

    if (input.provider !== "mock") {
      await ensureFeatureAllowed({
        workspaceId: workspace.id,
        feature: "liveProviderPublishing",
        skip: workspace.isLocalPreview
      });
    }

    await consumeUsageForLimit({
      workspaceId: workspace.id,
      key: "scheduledPostsPerDay",
      metadata: {
        platformVariantId,
        provider: input.provider,
        scheduledFor: input.scheduledFor,
        userId: user.id
      },
      skip: workspace.isLocalPreview
    });

    const result = await createScheduledPost({
      input: {
        workspaceId: workspace.id,
        platformVariantId,
        provider: input.provider,
        connectedAccountId: resolvedConnectedAccountId,
        scheduledFor,
        metadata: {
          ...input.metadata,
          localPreview: workspace.isLocalPreview
        }
      },
      repository: createSchedulerRepository({
        allowMemoryFallback: workspace.isLocalPreview
      })
    });

    return NextResponse.json(
      {
        scheduledJob: result.scheduledJob,
        enqueue: result.enqueue,
        providerHealth
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

    if (error instanceof FeatureAccessError) {
      return NextResponse.json(
        {
          error: error.message,
          code: "upgrade_required",
          feature: error.feature,
          requiredPlan: error.requiredPlan
        },
        { status: 402 }
      );
    }

    console.error("Unexpected schedule request error", error);
    return NextResponse.json({ error: "Unable to schedule post." }, { status: 500 });
  }
}
