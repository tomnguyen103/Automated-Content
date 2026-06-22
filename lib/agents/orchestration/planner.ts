import {
  type AgentMission,
  type AgentMissionType,
  type AgentProfile,
  type AgentProfileRole,
  type AgentTaskRun
} from "@/lib/agents/schemas/orchestration";

export type MissionPlanTask = {
  role: AgentProfileRole;
  taskName: string;
  action:
    | "research.collect"
    | "content.generate"
    | "content.schedule"
    | "content.publish"
    | "reply.send"
    | "report.generate"
    | "task.execute";
  toolScope: string;
  input: Record<string, unknown>;
};

export type MissionPlan = {
  missionId: string;
  missionType: AgentMissionType;
  tasks: MissionPlanTask[];
};

const missionTaskTemplates: Record<AgentMissionType, Omit<MissionPlanTask, "input">[]> = {
  research_topics: [
    {
      role: "researcher",
      taskName: "Collect source notes",
      action: "research.collect",
      toolScope: "research.topic"
    },
    {
      role: "reporter",
      taskName: "Summarize research brief",
      action: "report.generate",
      toolScope: "mission.report"
    }
  ],
  content_pipeline: [
    {
      role: "researcher",
      taskName: "Research topic context",
      action: "research.collect",
      toolScope: "research.topic"
    },
    {
      role: "strategist",
      taskName: "Plan content strategy",
      action: "task.execute",
      toolScope: "strategy.plan"
    },
    {
      role: "remixer",
      taskName: "Generate platform variants",
      action: "content.generate",
      toolScope: "content.generate"
    },
    {
      role: "publisher",
      taskName: "Schedule and publish variants",
      action: "content.publish",
      toolScope: "content.publish"
    }
  ],
  content_remix: [
    {
      role: "remixer",
      taskName: "Remix approved source content",
      action: "content.generate",
      toolScope: "content.generate"
    },
    {
      role: "publisher",
      taskName: "Schedule remixed variants",
      action: "content.schedule",
      toolScope: "content.schedule"
    }
  ],
  supervised_campaign: [
    {
      role: "researcher",
      taskName: "Research campaign context",
      action: "research.collect",
      toolScope: "research.topic"
    },
    {
      role: "strategist",
      taskName: "Plan supervised campaign strategy",
      action: "task.execute",
      toolScope: "strategy.plan"
    },
    {
      role: "remixer",
      taskName: "Generate campaign variants",
      action: "content.generate",
      toolScope: "content.generate"
    },
    {
      role: "publisher",
      taskName: "Prepare approval-gated schedule",
      action: "content.schedule",
      toolScope: "content.schedule"
    },
    {
      role: "reporter",
      taskName: "Compile campaign readiness report",
      action: "report.generate",
      toolScope: "mission.report"
    }
  ],
  auto_publish: [
    {
      role: "publisher",
      taskName: "Publish queued autonomous content",
      action: "content.publish",
      toolScope: "content.publish"
    }
  ],
  comment_engagement: [
    {
      role: "engagement",
      taskName: "Process inbound comments",
      action: "reply.send",
      toolScope: "reply.send"
    }
  ],
  weekly_report: [
    {
      role: "reporter",
      taskName: "Compile weekly operating report",
      action: "report.generate",
      toolScope: "mission.report"
    }
  ]
};

export function createMissionPlan(mission: AgentMission): MissionPlan {
  return {
    missionId: mission.id,
    missionType: mission.missionType,
    tasks: missionTaskTemplates[mission.missionType].map((template) => ({
      ...template,
      input: {
        missionId: mission.id,
        missionType: mission.missionType,
        objective: mission.objective,
        brief: mission.brief,
        ...mission.inputs
      }
    }))
  };
}

export function selectProfileForTask({
  profiles,
  role
}: {
  profiles: AgentProfile[];
  role: AgentProfileRole;
}) {
  return profiles.find((profile) => profile.role === role && profile.status === "active")
    ?? profiles.find((profile) => profile.role === role)
    ?? null;
}

export function createQueuedTaskRun({
  mission,
  now = new Date(),
  profile,
  task,
  taskIndex
}: {
  mission: AgentMission;
  profile: AgentProfile;
  task: MissionPlanTask;
  taskIndex: number;
  now?: Date;
}): AgentTaskRun {
  const timestamp = now.toISOString();

  return {
    id: `agent_task_${crypto.randomUUID()}`,
    workspaceId: mission.workspaceId,
    missionId: mission.id,
    profileId: profile.id,
    taskName: task.taskName,
    status: "queued",
    attemptNumber: 1,
    input: {
      ...task.input,
      role: task.role,
      action: task.action,
      toolScope: task.toolScope,
      taskIndex
    },
    policySnapshot: {
      profilePolicy: profile.policy,
      missionPolicy: mission.policy
    },
    queuedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}
