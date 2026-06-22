import {
  agentProfileSchema,
  agentRoleTemplateSchema,
  type AgentActionType,
  type AgentAutonomyPolicy,
  type AgentProfile,
  type AgentProfileRole,
  type AgentRoleTemplate
} from "@/lib/agents/schemas/orchestration";

function fullAutonomyPolicy({
  actions,
  autonomy = "full",
  toolScopes,
  dailyActionCap,
  confidenceThreshold = 0.72
}: {
  actions: AgentActionType[];
  autonomy?: AgentAutonomyPolicy["autonomy"];
  toolScopes: string[];
  dailyActionCap: number;
  confidenceThreshold?: number;
}): AgentAutonomyPolicy {
  return {
    autonomy,
    requiresHumanApproval: false,
    emergencyPaused: false,
    allowedActions: actions,
    allowedToolScopes: toolScopes,
    allowedProviders: ["mock", "meta", "linkedin", "x", "slack", "discord"],
    platformScope: ["linkedin", "x", "instagram", "facebook", "tiktok", "threads"],
    connectedAccountIds: [],
    dailyActionCap,
    modelBudgetCents: 0,
    confidenceThreshold,
    blockedPhrases: ["guarantee", "100%", "risk-free", "legal advice"],
    quietHours: {
      enabled: false,
      timezone: "America/Chicago",
      startHour: 22,
      endHour: 7
    },
    maxTasksPerRun: 12
  };
}

const coordinatorToolScopes = ["mission.plan", "task.assign", "task.execute", "policy.record"];
const researcherToolScopes = ["research.topic", "context.retrieve", "source.summarize"];
const strategistToolScopes = ["strategy.plan", "audience.map", "platform.fit"];
const remixerToolScopes = ["content.generate", "variant.generate", "format.rewrite", "media.prompt"];
const publisherToolScopes = ["content.schedule", "content.publish", "provider.validate", "policy.record"];
const engagementToolScopes = ["comment.triage", "reply.draft", "reply.send", "policy.record"];
const reporterToolScopes = ["analytics.summarize", "mission.report", "policy.review"];

const sharedMissionActions: AgentActionType[] = ["mission.run", "task.execute"];

const rolePolicies = {
  coordinator: fullAutonomyPolicy({
    actions: [...sharedMissionActions],
    toolScopes: coordinatorToolScopes,
    dailyActionCap: 30
  }),
  researcher: fullAutonomyPolicy({
    actions: [...sharedMissionActions, "research.collect"],
    toolScopes: researcherToolScopes,
    dailyActionCap: 40
  }),
  strategist: fullAutonomyPolicy({
    actions: [...sharedMissionActions],
    toolScopes: strategistToolScopes,
    dailyActionCap: 25
  }),
  remixer: fullAutonomyPolicy({
    actions: [...sharedMissionActions, "content.generate"],
    toolScopes: remixerToolScopes,
    dailyActionCap: 35
  }),
  publisher: fullAutonomyPolicy({
    actions: [...sharedMissionActions, "content.schedule", "content.publish"],
    autonomy: "supervised",
    toolScopes: publisherToolScopes,
    dailyActionCap: 20,
    confidenceThreshold: 0.8
  }),
  engagement: fullAutonomyPolicy({
    actions: [...sharedMissionActions, "reply.send"],
    autonomy: "supervised",
    toolScopes: engagementToolScopes,
    dailyActionCap: 50,
    confidenceThreshold: 0.72
  }),
  reporter: fullAutonomyPolicy({
    actions: [...sharedMissionActions, "report.generate"],
    toolScopes: reporterToolScopes,
    dailyActionCap: 10
  })
};

export const agentRoleTemplates = [
  {
    role: "coordinator",
    label: "Coordinator",
    mission: "Plans missions, assigns specialist work, and records policy decisions before any autonomous action.",
    instructions:
      "Break the mission into bounded tasks, choose the right specialist profile, preserve human-review checkpoints, and log policy decisions that affect scope or autonomy.",
    responsibilities: [
      "Translate a request into mission objectives and task boundaries.",
      "Route research, strategy, remixing, publishing prep, engagement, and reporting tasks.",
      "Keep the mission paused when a policy decision requires human review."
    ],
    defaultCapabilities: ["mission_planning", "task_routing", "policy_coordination"],
    defaultToolScopes: coordinatorToolScopes,
    defaultPolicy: rolePolicies.coordinator,
    defaultModelPreferences: {
      reasoning: "balanced",
      temperature: 0.2
    },
    defaultMaxConcurrency: 2
  },
  {
    role: "researcher",
    label: "Researcher",
    mission: "Finds source material, summarizes context, and flags uncertainty before content strategy begins.",
    instructions:
      "Gather relevant context, separate confirmed facts from assumptions, cite source metadata in outputs, and escalate when claims require fresh verification.",
    responsibilities: [
      "Collect source notes and audience context.",
      "Summarize reusable facts, examples, and constraints.",
      "Flag stale, missing, or unverifiable inputs."
    ],
    defaultCapabilities: ["source_research", "context_synthesis", "uncertainty_tracking"],
    defaultToolScopes: researcherToolScopes,
    defaultPolicy: rolePolicies.researcher,
    defaultModelPreferences: {
      reasoning: "careful",
      temperature: 0.1
    },
    defaultMaxConcurrency: 2
  },
  {
    role: "strategist",
    label: "Strategist",
    mission: "Turns research into positioning, audience angles, campaign themes, and channel strategy.",
    instructions:
      "Convert research notes into a concise content strategy, identify the audience promise, and define success signals without drafting final publishable copy.",
    responsibilities: [
      "Choose the primary angle and audience promise.",
      "Map messages to platform constraints.",
      "Recommend success metrics for reporting."
    ],
    defaultCapabilities: ["positioning", "campaign_strategy", "audience_mapping"],
    defaultToolScopes: strategistToolScopes,
    defaultPolicy: rolePolicies.strategist,
    defaultModelPreferences: {
      reasoning: "balanced",
      temperature: 0.3
    },
    defaultMaxConcurrency: 1
  },
  {
    role: "remixer",
    label: "Remixer",
    mission: "Adapts approved ideas into platform-ready variants and reusable creative directions.",
    instructions:
      "Create platform-specific variations from approved strategy inputs, preserve brand voice, and keep every variant in review-ready draft form.",
    responsibilities: [
      "Rewrite approved ideas for target platforms.",
      "Generate hooks, calls to action, and media prompts.",
      "Preserve policy warnings with each variant."
    ],
    defaultCapabilities: ["variant_generation", "brand_voice_adaptation", "creative_prompting"],
    defaultToolScopes: remixerToolScopes,
    defaultPolicy: rolePolicies.remixer,
    defaultModelPreferences: {
      reasoning: "fast",
      temperature: 0.6
    },
    defaultMaxConcurrency: 3
  },
  {
    role: "publisher",
    label: "Publisher",
    mission: "Schedules and publishes approved autonomous content within configured provider and account limits.",
    instructions:
      "Validate platform readiness, account constraints, and scheduling metadata before enqueueing provider sends. Stop immediately when policy denies a provider, account, or quiet-hour condition.",
    responsibilities: [
      "Check provider readiness and platform constraints.",
      "Prepare scheduling metadata for generated variants.",
      "Publish only when mission policy, provider scope, and daily action caps allow it."
    ],
    defaultCapabilities: ["schedule_preparation", "provider_readiness", "autonomous_publishing"],
    defaultToolScopes: publisherToolScopes,
    defaultPolicy: rolePolicies.publisher,
    defaultModelPreferences: {
      reasoning: "careful",
      temperature: 0.1
    },
    defaultMaxConcurrency: 1
  },
  {
    role: "engagement",
    label: "Engagement",
    mission: "Triage audience interactions and send safe replies when mission policy allows autonomous engagement.",
    instructions:
      "Classify engagement opportunities, draft responses from approved context, and send replies only when confidence, safety, provider scope, and rate limits pass.",
    responsibilities: [
      "Triage inbound comments and audience signals.",
      "Draft response suggestions that preserve brand voice.",
      "Send policy-approved replies and record every denial or fallback."
    ],
    defaultCapabilities: ["comment_triage", "reply_drafting", "autonomous_reply_sending"],
    defaultToolScopes: engagementToolScopes,
    defaultPolicy: rolePolicies.engagement,
    defaultModelPreferences: {
      reasoning: "balanced",
      temperature: 0.3
    },
    defaultMaxConcurrency: 2
  },
  {
    role: "reporter",
    label: "Reporter",
    mission: "Summarizes mission outcomes, policy events, and performance signals for human review.",
    instructions:
      "Produce concise mission summaries from persisted data, call out unresolved risks, and keep analytics claims tied to available metrics.",
    responsibilities: [
      "Summarize completed mission outputs and open decisions.",
      "Report policy events and human-review blockers.",
      "Extract performance insights from available metrics."
    ],
    defaultCapabilities: ["mission_reporting", "policy_audit_summary", "performance_synthesis"],
    defaultToolScopes: reporterToolScopes,
    defaultPolicy: rolePolicies.reporter,
    defaultModelPreferences: {
      reasoning: "balanced",
      temperature: 0.2
    },
    defaultMaxConcurrency: 1
  }
] satisfies AgentRoleTemplate[];

function buildTemplateMap(templates: AgentRoleTemplate[]) {
  const map = {} as Record<AgentProfileRole, AgentRoleTemplate>;

  for (const template of templates) {
    map[template.role] = template;
  }

  return map;
}

export const agentRoleTemplateByRole = buildTemplateMap(agentRoleTemplates);

export function getAgentRoleTemplate(role: AgentProfileRole) {
  return agentRoleTemplateByRole[role];
}

export function buildAgentProfileFromTemplate({
  role,
  workspaceId,
  createdByUserId,
  now = new Date()
}: {
  role: AgentProfileRole;
  workspaceId: string;
  createdByUserId?: string;
  now?: Date;
}): AgentProfile {
  const template = agentRoleTemplateSchema.parse(getAgentRoleTemplate(role));
  const timestamp = now.toISOString();

  return agentProfileSchema.parse({
    id: `agent_profile_${workspaceId}_${template.role}`,
    workspaceId,
    createdByUserId,
    role: template.role,
    status: "active",
    name: template.label,
    description: template.mission,
    instructions: template.instructions,
    capabilities: template.defaultCapabilities,
    toolScopes: template.defaultToolScopes,
    policy: template.defaultPolicy,
    modelPreferences: template.defaultModelPreferences,
    maxConcurrency: template.defaultMaxConcurrency,
    metadata: {
      seededTemplate: true,
      templateRole: template.role,
      templateVersion: "2026-06-21"
    },
    createdAt: timestamp,
    updatedAt: timestamp
  });
}
