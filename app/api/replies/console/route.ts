import { NextResponse } from "next/server";
import { resolveReplyServerContext } from "@/lib/replies/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const context = await resolveReplyServerContext(request);

  if (!context) {
    return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  }

  return NextResponse.json(await context.repository.getConsoleState(context.workspace.id));
}
