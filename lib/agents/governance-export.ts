import "server-only";

import { listAgentMissionAuditRecords } from "@/lib/agents/orchestration/audit";
import {
  AGENT_MISSION_HISTORY_LIMIT,
  type AgentOrchestrationRepositories
} from "@/lib/agents/orchestration/repository";
import { createBrandMemoryProposalRepository } from "@/lib/brand-memory/proposals";
import { createReplyRepository } from "@/lib/replies/repository";
import { getWorkspaceBillingState, listUsageLedgerRecords } from "@/lib/billing/usage";
import { isDatabaseConfigured } from "@/lib/env";

const sensitiveKeyPattern = /(token|secret|signature|authorization|api[-_]?key|password|credential)/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function redactSensitive(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitive(item));
  }

  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      sensitiveKeyPattern.test(key) ? "[redacted]" : redactSensitive(entry)
    ])
  );
}

async function loadOptionalExportSection<T>(label: string, loader: Promise<T>, fallback: T): Promise<T> {
  try {
    return await loader;
  } catch (error) {
    console.error(`Unable to load governance export ${label}`, error);
    return fallback;
  }
}

export async function buildAgentGovernanceExport({
  allowMemoryFallback = false,
  now = new Date(),
  repositories,
  requestedByUserId,
  workspaceId
}: {
  workspaceId: string;
  requestedByUserId: string;
  repositories: AgentOrchestrationRepositories;
  allowMemoryFallback?: boolean;
  now?: Date;
}) {
  const brandMemoryRepository = createBrandMemoryProposalRepository({
    allowMemoryFallback,
    preferMemoryFallback: allowMemoryFallback
  });
  const replyRepository = createReplyRepository({ allowMemoryFallback });
  const [missions, brandMemoryProposals, replyConsoleState, usageRecords, billingState] = await Promise.all([
    listAgentMissionAuditRecords({
      workspaceId,
      repositories,
      limit: AGENT_MISSION_HISTORY_LIMIT
    }),
    brandMemoryRepository.list({
      workspaceId,
      limit: 100
    }),
    replyRepository.getConsoleState(workspaceId),
    loadOptionalExportSection(
      "usage records",
      listUsageLedgerRecords({
        workspaceId,
        limit: 200
      }),
      []
    ),
    isDatabaseConfigured
      ? loadOptionalExportSection(
          "billing state",
          getWorkspaceBillingState({
            workspaceId,
            now
          }),
          null
        )
      : Promise.resolve(null)
  ]);

  const payload = {
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    workspaceId,
    requestedByUserId,
    summary: {
      missions: missions.length,
      taskRuns: missions.reduce((sum, record) => sum + record.tasks.length, 0),
      simulations: missions.reduce((sum, record) => sum + record.simulations.length, 0),
      policyEvents: missions.reduce((sum, record) => sum + record.policyEvents.length, 0),
      providerEvents: missions.reduce((sum, record) => sum + record.n8nEvents.length, 0),
      usageRecords: usageRecords.length,
      brandMemoryProposals: brandMemoryProposals.length,
      pendingApprovals: replyConsoleState.approvals.length
    },
    missions,
    approvals: {
      pending: replyConsoleState.approvals,
      recentAttempts: replyConsoleState.logs
    },
    autoReplyRules: replyConsoleState.rules,
    brandMemory: brandMemoryProposals,
    usage: {
      metrics: billingState?.usageMetrics ?? [],
      records: usageRecords
    }
  };

  return redactSensitive(payload);
}
