import { NextResponse } from "next/server";
import { resolveReplyServerContext } from "@/lib/replies/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const context = await resolveReplyServerContext(request);

  if (!context) {
    return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  }

  try {
    return NextResponse.json(await context.repository.getConsoleState(context.workspace.id));
  } catch (error) {
    console.error("Unexpected auto replies console load error", error);
    return NextResponse.json({ error: "Unable to load auto replies." }, { status: 500 });
  }
}
