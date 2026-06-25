import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ensureFeatureAllowed,
  FeatureAccessError
} from "@/lib/billing/usage";
import { updateReplyRuleRequestSchema } from "@/lib/replies/console";
import { resolveReplyServerContext } from "@/lib/replies/server";

export const runtime = "nodejs";

type RuleRouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(request: Request, context: RuleRouteContext) {
  const replyContext = await resolveReplyServerContext(request);

  if (!replyContext) {
    return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  try {
    const { id } = await context.params;
    const input = updateReplyRuleRequestSchema.parse(body);

    if (input.enabled) {
      await ensureFeatureAllowed({
        workspaceId: replyContext.workspace.id,
        feature: "keywordAutoReplies",
        skip: replyContext.workspace.isLocalPreview
      });
    }

    const rule = await replyContext.repository.updateRuleEnabled({
      workspaceId: replyContext.workspace.id,
      ruleId: id,
      enabled: input.enabled
    });

    if (!rule) {
      return NextResponse.json({ error: "Reply rule not found." }, { status: 404 });
    }

    return NextResponse.json(await replyContext.repository.getConsoleState(replyContext.workspace.id));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Invalid reply rule update.",
          issues: error.issues
        },
        { status: 400 }
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

    console.error("Unexpected reply rule update error", error);
    return NextResponse.json({ error: "Unable to update reply rule." }, { status: 500 });
  }
}
