import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getApprovalCommandCenter } from "@/lib/approvals/command-center";
import { providerKeys } from "@/lib/providers/types";
import { resolveAgentOrchestrationContext } from "@/lib/agents/orchestration/server";

export const runtime = "nodejs";

const approvalTypeSchema = z.enum([
  "content_review",
  "reply_approval",
  "brand_memory",
  "policy_escalation",
  "provider_block",
  "budget_block"
]);
const approvalSeveritySchema = z.enum(["info", "warning", "blocked"]);
const providerKeySchema = z.enum(providerKeys);

function parseApprovalType(value: string | null) {
  if (!value) {
    return undefined;
  }

  const parsed = approvalTypeSchema.safeParse(value);

  return parsed.success ? parsed.data : undefined;
}

function parseApprovalSeverity(value: string | null) {
  if (!value) {
    return undefined;
  }

  const parsed = approvalSeveritySchema.safeParse(value);

  return parsed.success ? parsed.data : undefined;
}

function parseProviderKey(value: string | null) {
  if (!value) {
    return undefined;
  }

  const parsed = providerKeySchema.safeParse(value);

  return parsed.success ? parsed.data : undefined;
}

function parseMaxAgeHours(value: string | null) {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function parseOptionalText(value: string | null) {
  const trimmed = value?.trim();

  return trimmed ? trimmed : undefined;
}

export async function GET(request: NextRequest) {
  const context = await resolveAgentOrchestrationContext();

  if (!context) {
    return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const result = await getApprovalCommandCenter({
    agentRepositories: context.repositories,
    filters: {
      type: parseApprovalType(params.get("type")),
      severity: parseApprovalSeverity(params.get("severity")),
      provider: parseProviderKey(params.get("provider")),
      platform: parseOptionalText(params.get("platform")),
      missionId: parseOptionalText(params.get("missionId")),
      maxAgeHours: parseMaxAgeHours(params.get("maxAgeHours"))
    },
    isLocalPreview: context.workspace.isLocalPreview,
    workspaceId: context.workspace.id
  });

  return NextResponse.json(result);
}
