import type { AnalyticsSnapshot, PlatformBreakdownItem } from "@/lib/analytics/metrics";

export type AnalyticsRecommendation = {
  id: string;
  title: string;
  reason: string;
  evidence: string;
  href: string;
  actionLabel: string;
  priority: number;
  severity: "info" | "warning" | "critical";
};

function failedPlatform(platformBreakdown: PlatformBreakdownItem[]) {
  return [...platformBreakdown].sort((a, b) => b.failures - a.failures || a.platform.localeCompare(b.platform))[0];
}

function recommendationSort(left: AnalyticsRecommendation, right: AnalyticsRecommendation) {
  const severityWeight = {
    critical: 3,
    warning: 2,
    info: 1
  };

  return severityWeight[right.severity] - severityWeight[left.severity] || right.priority - left.priority;
}

export function buildAnalyticsRecommendations(snapshot: AnalyticsSnapshot): AnalyticsRecommendation[] {
  const recommendations: AnalyticsRecommendation[] = [];
  const topFailedPlatform = failedPlatform(snapshot.platformBreakdown);

  if (snapshot.failures.total > 0) {
    recommendations.push({
      id: "review_failed_operations",
      title: "Review failed operations",
      reason: "Failures should be cleared before autonomy or schedule volume increases.",
      evidence: `${snapshot.failures.publishing} publish, ${snapshot.failures.replies} reply, and ${snapshot.failures.agents} agent failures.`,
      href: "/calendar#failed",
      actionLabel: "Open failed queue",
      priority: 100,
      severity: "critical"
    });
  }

  if (topFailedPlatform && topFailedPlatform.failures > 0) {
    recommendations.push({
      id: "inspect_failed_platform",
      title: `Inspect ${topFailedPlatform.platform} reliability`,
      reason: "One platform is carrying the most failed work and may need provider or content review.",
      evidence: `${topFailedPlatform.failures} failures across ${topFailedPlatform.posts + topFailedPlatform.comments + topFailedPlatform.replies} tracked items.`,
      href: "/connections",
      actionLabel: "Open connections",
      priority: 92,
      severity: "warning"
    });
  }

  if (snapshot.replies.awaitingApproval > 0) {
    recommendations.push({
      id: "clear_reply_approvals",
      title: "Clear reply approvals",
      reason: "Pending replies are already review-gated, so clearing them improves throughput without adding automation risk.",
      evidence: `${snapshot.replies.awaitingApproval} reply approvals are waiting.`,
      href: "/approvals?type=reply_approval",
      actionLabel: "Open approvals",
      priority: 88,
      severity: "warning"
    });
  }

  if (snapshot.agents.failed > 0 || snapshot.agents.scorecards.some((scorecard) => scorecard.grade === "blocked")) {
    recommendations.push({
      id: "inspect_agent_scorecards",
      title: "Inspect low-scoring agents",
      reason: "Agent failures and blocked scorecards need evidence review before expanding mission scope.",
      evidence: `${snapshot.agents.failed} failed agents and ${snapshot.agents.scorecards.filter((scorecard) => scorecard.grade === "blocked").length} blocked scorecards.`,
      href: "/analytics#agent-quality",
      actionLabel: "Review scorecards",
      priority: 84,
      severity: "warning"
    });
  }

  if (snapshot.posting.scheduled + snapshot.posting.queued === 0) {
    recommendations.push({
      id: "restart_publishing_cadence",
      title: "Restart the publishing cadence",
      reason: "There are no scheduled or queued posts, so content operations may stall.",
      evidence: `${snapshot.posting.scheduled} scheduled and ${snapshot.posting.queued} queued posts.`,
      href: "/create",
      actionLabel: "Create content",
      priority: 72,
      severity: "info"
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      id: "maintain_operational_posture",
      title: "Maintain current operating posture",
      reason: "No failed work, stalled approvals, or empty publishing queue needs immediate action.",
      evidence: `${snapshot.posting.queued + snapshot.posting.scheduled} queued or scheduled posts and ${snapshot.failures.total} failures.`,
      href: "/agents",
      actionLabel: "Open agents",
      priority: 20,
      severity: "info"
    });
  }

  return recommendations.sort(recommendationSort).slice(0, 5);
}
