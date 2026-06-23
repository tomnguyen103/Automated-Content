import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { workflowCheckpoints } from "@/db/schema";
import { isDatabaseConfigured } from "@/lib/env";
import {
  createAgentOrchestrationRepositories,
  type AgentOrchestrationRepositories
} from "@/lib/agents/orchestration/repository";
import {
  createBrandMemoryProposalRepository,
  type BrandMemoryProposalRepository
} from "@/lib/brand-memory/proposals";
import {
  createReplyRepository,
  type ReplyRepository
} from "@/lib/replies/repository";
import { logger } from "@/lib/observability/logger";
import type { ProviderKey } from "@/lib/providers/types";

export type ApprovalDecisionType =
  | "content_review"
  | "reply_approval"
  | "brand_memory"
  | "policy_escalation"
  | "provider_block"
  | "budget_block";

export type ApprovalSeverity = "info" | "warning" | "blocked";
export type ApprovalSource = "content" | "reply" | "brand_memory" | "agents";

export type ApprovalCommandCenterItem = {
  id: string;
  type: ApprovalDecisionType;
  source: ApprovalSource;
  title: string;
  detail: string;
  reason: string;
  status: "pending" | "blocked";
  severity: ApprovalSeverity;
  createdAt: string;
  ageMinutes: number;
  href: string;
  provider?: ProviderKey;
  platform?: string;
  missionId?: string;
  decisionKey?: string;
};

export type ApprovalCommandCenterFilters = {
  type?: ApprovalDecisionType;
  severity?: ApprovalSeverity;
  provider?: ProviderKey;
  platform?: string;
  missionId?: string;
  maxAgeHours?: number;
};

export type ApprovalCommandCenterResult = {
  items: ApprovalCommandCenterItem[];
  stats: {
    total: number;
    blocked: number;
    pending: number;
    bySource: Record<ApprovalSource, number>;
  };
};

type ApprovalCommandCenterOptions = {
  agentRepositories?: AgentOrchestrationRepositories;
  brandMemoryRepository?: Pick<BrandMemoryProposalRepository, "list">;
  filters?: ApprovalCommandCenterFilters;
  isLocalPreview?: boolean;
  now?: Date;
  replyRepository?: Pick<ReplyRepository, "getConsoleState">;
  workspaceId: string;
};

const checkpointApprovalStatuses = ["pending", "changes_requested", "paused"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readString(value: Record<string, unknown>, key: string) {
  const candidate = value[key];

  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : undefined;
}

function ageMinutes(createdAt: string, now: Date) {
  return Math.max(0, Math.floor((now.getTime() - new Date(createdAt).getTime()) / 60_000));
}

function policyType(policyKey: string): ApprovalDecisionType {
  if (policyKey.includes("provider") || policyKey.includes("account")) {
    return "provider_block";
  }

  if (policyKey.includes("budget") || policyKey.includes("usage")) {
    return "budget_block";
  }

  return "policy_escalation";
}

function applyFilters(items: ApprovalCommandCenterItem[], filters: ApprovalCommandCenterFilters, now: Date) {
  const minCreatedAt = filters.maxAgeHours
    ? now.getTime() - filters.maxAgeHours * 60 * 60 * 1000
    : null;

  return items.filter((item) => {
    const createdAt = new Date(item.createdAt).getTime();

    return (
      (!filters.type || item.type === filters.type) &&
      (!filters.severity || item.severity === filters.severity) &&
      (!filters.provider || item.provider === filters.provider) &&
      (!filters.platform || item.platform === filters.platform) &&
      (!filters.missionId || item.missionId === filters.missionId) &&
      (!minCreatedAt || createdAt >= minCreatedAt)
    );
  });
}

function buildStats(items: ApprovalCommandCenterItem[]): ApprovalCommandCenterResult["stats"] {
  return {
    total: items.length,
    blocked: items.filter((item) => item.status === "blocked").length,
    pending: items.filter((item) => item.status === "pending").length,
    bySource: {
      agents: items.filter((item) => item.source === "agents").length,
      brand_memory: items.filter((item) => item.source === "brand_memory").length,
      content: items.filter((item) => item.source === "content").length,
      reply: items.filter((item) => item.source === "reply").length
    }
  };
}

async function listReplyApprovalItems({
  now,
  repository,
  workspaceId
}: {
  now: Date;
  repository: Pick<ReplyRepository, "getConsoleState">;
  workspaceId: string;
}): Promise<ApprovalCommandCenterItem[]> {
  const state = await repository.getConsoleState(workspaceId);

  return state.approvals
    .filter((approval) => approval.status === "pending")
    .map((approval) => ({
      id: `reply:${approval.id}`,
      type: "reply_approval",
      source: "reply",
      title: approval.authorName ? `Reply to ${approval.authorName}` : "Reply approval",
      detail: approval.triageLabel ? `Triage: ${approval.triageLabel}` : "AI reply suggestion needs review.",
      reason: approval.triageReason ?? approval.auditNotes[0] ?? "Suggested reply requires human approval.",
      status: "pending",
      severity: approval.triageLabel === "crisis_escalation" ? "blocked" : "warning",
      createdAt: approval.createdAt,
      ageMinutes: ageMinutes(approval.createdAt, now),
      href: "/auto-replies#approvals",
      provider: approval.provider,
      platform: approval.platform,
      decisionKey: approval.triageLabel
    }));
}

async function listBrandMemoryApprovalItems({
  now,
  repository,
  workspaceId
}: {
  now: Date;
  repository: Pick<BrandMemoryProposalRepository, "list">;
  workspaceId: string;
}): Promise<ApprovalCommandCenterItem[]> {
  const proposals = await repository.list({
    workspaceId,
    status: "pending",
    limit: 100
  });

  return proposals.map((proposal) => ({
    id: `brand-memory:${proposal.id}`,
    type: "brand_memory",
    source: "brand_memory",
    title: proposal.scope === "platform" && proposal.platform
      ? `Brand rule for ${proposal.platform}`
      : "Brand memory proposal",
    detail: proposal.inferredRule,
    reason: `Confidence ${proposal.confidence}%. Human review is required before this memory can affect generation.`,
    status: "pending",
    severity: proposal.confidence < 70 ? "warning" : "info",
    createdAt: proposal.createdAt,
    ageMinutes: ageMinutes(proposal.createdAt, now),
    href: "/brand-memory#proposals",
    platform: proposal.platform,
    decisionKey: proposal.scope
  }));
}

async function listContentWorkflowApprovalItems({
  now,
  workspaceId
}: {
  now: Date;
  workspaceId: string;
}): Promise<ApprovalCommandCenterItem[]> {
  if (!isDatabaseConfigured) {
    return [];
  }

  let rows: Array<typeof workflowCheckpoints.$inferSelect> = [];

  try {
    rows = await getDb()
      .select()
      .from(workflowCheckpoints)
      .where(
        and(
          eq(workflowCheckpoints.workspaceId, workspaceId),
          inArray(workflowCheckpoints.approvalStatus, [...checkpointApprovalStatuses])
        )
      )
      .orderBy(desc(workflowCheckpoints.updatedAt))
      .limit(50);
  } catch (error) {
    logger.warn("Approval command center checkpoint query failed", {
      error: error instanceof Error ? error.message : "Unknown workflow checkpoint query failure.",
      workspaceId
    });
    return [];
  }

  return rows.map((row) => {
    const state = isRecord(row.state) ? row.state : {};
    const input = isRecord(state.input) ? state.input : {};
    const topic = readString(input, "topic") ?? readString(state, "topic") ?? "Content workflow";
    const createdAt = row.updatedAt.toISOString();

    return {
      id: `content:${row.id}`,
      type: "content_review",
      source: "content",
      title: topic,
      detail: `Checkpoint ${row.currentNode} is ${row.approvalStatus}.`,
      reason: "Content generation is waiting for a human decision before save, schedule, or publish work continues.",
      status: "pending",
      severity: row.approvalStatus === "changes_requested" ? "warning" : "info",
      createdAt,
      ageMinutes: ageMinutes(createdAt, now),
      href: "/create#review",
      decisionKey: row.approvalStatus
    };
  });
}

async function listAgentPolicyApprovalItems({
  now,
  repositories,
  workspaceId
}: {
  now: Date;
  repositories: AgentOrchestrationRepositories;
  workspaceId: string;
}): Promise<ApprovalCommandCenterItem[]> {
  const missions = await repositories.missions.list(workspaceId, { limit: 25 });
  const rows = await Promise.all(
    missions.map(async (mission) => {
      const policyEvents = await repositories.policyEvents.listForMission({
        workspaceId,
        missionId: mission.id,
        limit: 12
      });

      return policyEvents
        .filter((event) => event.action === "require_review" || event.severity === "blocked")
        .map((event) => {
          const details = isRecord(event.details) ? event.details : {};
          const createdAt = event.occurredAt;
          const severity = event.severity === "blocked" ? "blocked" : "warning";

          return {
            id: `policy:${event.id}`,
            type: policyType(event.policyKey),
            source: "agents",
            title: mission.title,
            detail: event.message,
            reason: event.policyKey,
            status: severity === "blocked" ? "blocked" : "pending",
            severity,
            createdAt,
            ageMinutes: ageMinutes(createdAt, now),
            href: `/agents#mission-${mission.id}`,
            provider: readString(details, "provider") as ProviderKey | undefined,
            platform: readString(details, "platform"),
            missionId: mission.id,
            decisionKey: event.policyKey
          } satisfies ApprovalCommandCenterItem;
        });
    })
  );

  return rows.flat();
}

export async function getApprovalCommandCenter({
  agentRepositories,
  brandMemoryRepository,
  filters = {},
  isLocalPreview = false,
  now = new Date(),
  replyRepository,
  workspaceId
}: ApprovalCommandCenterOptions): Promise<ApprovalCommandCenterResult> {
  const [replyItems, brandMemoryItems, contentItems, agentItems] = await Promise.all([
    listReplyApprovalItems({
      now,
      repository: replyRepository ?? createReplyRepository({ allowMemoryFallback: isLocalPreview }),
      workspaceId
    }),
    listBrandMemoryApprovalItems({
      now,
      repository:
        brandMemoryRepository ??
        createBrandMemoryProposalRepository({
          allowMemoryFallback: true,
          preferMemoryFallback: isLocalPreview
        }),
      workspaceId
    }),
    listContentWorkflowApprovalItems({ now, workspaceId }),
    listAgentPolicyApprovalItems({
      now,
      repositories: agentRepositories ?? createAgentOrchestrationRepositories({ allowMemoryFallback: isLocalPreview }),
      workspaceId
    })
  ]);
  const items = applyFilters(
    [...replyItems, ...brandMemoryItems, ...contentItems, ...agentItems].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    filters,
    now
  );

  return {
    items,
    stats: buildStats(items)
  };
}
