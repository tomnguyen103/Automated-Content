import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { connectedAccounts, platformVariants, scheduledJobs } from "@/db/schema";
import { isDatabaseConfigured } from "@/lib/env";

export type QueueRow = {
  id: string;
  title: string;
  provider: string;
  scheduledFor: string;
  status: "Queued" | "Scheduled" | "Publishing" | "Published" | "Failed" | "Canceled";
  enqueue: "Queued" | "Pending" | "Retry needed";
};

const previewQueueRows: QueueRow[] = [
  {
    id: "queue-001",
    title: "Founder story carousel",
    provider: "Meta",
    scheduledFor: "Today 9:00 AM",
    status: "Queued",
    enqueue: "Queued"
  },
  {
    id: "queue-002",
    title: "AI workflow thread",
    provider: "X",
    scheduledFor: "Today 12:30 PM",
    status: "Scheduled",
    enqueue: "Retry needed"
  },
  {
    id: "queue-003",
    title: "Product lesson post",
    provider: "LinkedIn",
    scheduledFor: "Tomorrow 8:45 AM",
    status: "Scheduled",
    enqueue: "Pending"
  }
];

function toTitleCase(value: string) {
  return value
    .split("_")
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ") as QueueRow["status"];
}

function toEnqueueLabel(value: string): QueueRow["enqueue"] {
  if (value === "queued") {
    return "Queued";
  }

  if (value === "failed") {
    return "Retry needed";
  }

  return "Pending";
}

function formatScheduledFor(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

export async function getQueueRows({
  isLocalPreview = false,
  limit = 20,
  workspaceId
}: {
  isLocalPreview?: boolean;
  limit?: number;
  workspaceId: string | null | undefined;
}): Promise<QueueRow[]> {
  if (isLocalPreview) {
    return previewQueueRows.slice(0, limit);
  }

  if (!isDatabaseConfigured || !workspaceId) {
    return [];
  }

  const rows = await getDb()
    .select({
      id: scheduledJobs.id,
      title: platformVariants.title,
      provider: connectedAccounts.displayName,
      fallbackProvider: scheduledJobs.provider,
      scheduledFor: scheduledJobs.scheduledFor,
      status: scheduledJobs.status,
      enqueueStatus: scheduledJobs.enqueueStatus
    })
    .from(scheduledJobs)
    .innerJoin(
      platformVariants,
      and(
        eq(scheduledJobs.workspaceId, platformVariants.workspaceId),
        eq(scheduledJobs.platformVariantId, platformVariants.id)
      )
    )
    .leftJoin(
      connectedAccounts,
      and(
        eq(scheduledJobs.workspaceId, connectedAccounts.workspaceId),
        eq(scheduledJobs.connectedAccountId, connectedAccounts.id),
        eq(scheduledJobs.provider, connectedAccounts.provider)
      )
    )
    .where(eq(scheduledJobs.workspaceId, workspaceId))
    .orderBy(asc(scheduledJobs.scheduledFor))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    provider: row.provider ?? toTitleCase(row.fallbackProvider),
    scheduledFor: formatScheduledFor(row.scheduledFor),
    status: toTitleCase(row.status),
    enqueue: toEnqueueLabel(row.enqueueStatus)
  }));
}

export function getQueueStats(queueRows: QueueRow[]) {
  return {
    scheduled: queueRows.length,
    queued: queueRows.filter((row) => row.enqueue === "Queued").length,
    recoverable: queueRows.filter((row) => row.enqueue === "Retry needed").length
  };
}
