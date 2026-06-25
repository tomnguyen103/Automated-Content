import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ensureFeatureAllowed,
  FeatureAccessError
} from "@/lib/billing/usage";
import { createReplyRuleRequestSchema } from "@/lib/replies/console";
import { resolveReplyServerContext } from "@/lib/replies/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const context = await resolveReplyServerContext(request);

  if (!context) {
    return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  try {
    const rule = createReplyRuleRequestSchema.parse(body);

    await ensureFeatureAllowed({
      workspaceId: context.workspace.id,
      feature: "keywordAutoReplies",
      skip: context.workspace.isLocalPreview
    });

    await context.repository.createRule({
      workspaceId: context.workspace.id,
      userId: context.user.id,
      rule
    });

    return NextResponse.json(await context.repository.getConsoleState(context.workspace.id), { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Invalid reply rule.",
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

    console.error("Unexpected reply rule create error", error);
    return NextResponse.json({ error: "Unable to create reply rule." }, { status: 500 });
  }
}
