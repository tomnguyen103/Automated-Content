import { NextResponse } from "next/server";
import { z } from "zod";
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
    await context.repository.createRule({
      workspaceId: context.workspace.id,
      userId: context.user.id,
      rule: createReplyRuleRequestSchema.parse(body)
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

    console.error("Unexpected reply rule create error", error);
    return NextResponse.json({ error: "Unable to create reply rule." }, { status: 500 });
  }
}
