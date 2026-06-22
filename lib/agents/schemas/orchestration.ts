import { z } from "zod";

const isoTimestampSchema = z.iso.datetime({ offset: true });
const jsonRecordSchema = z.record(z.string(), z.unknown());

export const agentProfileRoleSchema = z.enum([
  "coordinator",
  "researcher",
  "strategist",
  "remixer",
  "publisher",
  "engagement",
  "reporter"
]);

export const agentProfileStatusSchema = z.enum(["active", "disabled", "archived"]);
export const agentMissionStatusSchema = z.enum([
  "draft",
  "queued",
  "running",
  "paused",
  "succeeded",
  "failed",
  "canceled"
]);
export const agentMissionTypeSchema = z.enum([
  "research_topics",
  "content_pipeline",
  "content_remix",
  "auto_publish",
  "comment_engagement",
  "weekly_report"
]);
export const agentTaskRunStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
  "canceled",
  "skipped"
]);
export const agentPolicyEventSeveritySchema = z.enum(["info", "warning", "blocked"]);
export const agentPolicyEventActionSchema = z.enum([
  "allow",
  "require_review",
  "block",
  "escalate",
  "note"
]);
export const agentMissionSimulationStatusSchema = z.enum(["succeeded", "failed"]);

export const agentActionTypeSchema = z.enum([
  "mission.run",
  "research.collect",
  "content.generate",
  "content.schedule",
  "content.publish",
  "reply.send",
  "report.generate",
  "task.execute"
]);

export const autonomyModeSchema = z.enum(["assistive", "supervised", "full"]);

export const defaultQuietHours = {
  enabled: false,
  timezone: "America/Chicago",
  startHour: 22,
  endHour: 7
};

export const quietHoursSchema = z.object({
  enabled: z.boolean().default(false),
  timezone: z.string().min(1).default("America/Chicago"),
  startHour: z.number().int().min(0).max(23).default(22),
  endHour: z.number().int().min(0).max(23).default(7)
});

export const agentAutonomyPolicySchema = z.object({
  autonomy: autonomyModeSchema.default("supervised"),
  requiresHumanApproval: z.boolean().default(false),
  emergencyPaused: z.boolean().default(false),
  allowedActions: z.array(agentActionTypeSchema).default([]),
  allowedToolScopes: z.array(z.string().min(1)).default([]),
  allowedProviders: z.array(z.string().min(1)).default([]),
  platformScope: z.array(z.string().min(1)).default([]),
  connectedAccountIds: z.array(z.string().min(1)).default([]),
  dailyActionCap: z.number().int().positive().default(25),
  modelBudgetCents: z.number().int().nonnegative().default(0),
  confidenceThreshold: z.number().min(0).max(1).default(0.7),
  blockedPhrases: z.array(z.string().min(1)).default([]),
  quietHours: quietHoursSchema.default(defaultQuietHours),
  maxTasksPerRun: z.number().int().positive().default(12)
});

export const defaultAgentAutonomyPolicy = agentAutonomyPolicySchema.parse({
  autonomy: "supervised",
  requiresHumanApproval: false,
  emergencyPaused: false,
  allowedActions: [],
  allowedToolScopes: [],
  allowedProviders: [],
  platformScope: [],
  connectedAccountIds: [],
  dailyActionCap: 25,
  modelBudgetCents: 0,
  confidenceThreshold: 0.7,
  blockedPhrases: [],
  quietHours: defaultQuietHours,
  maxTasksPerRun: 12
});

export const missionInputsSchema = z.record(z.string(), z.unknown()).default({});
export const missionContextSchema = z.record(z.string(), z.unknown()).default({});
export const missionResultSchema = z.record(z.string(), z.unknown());

export const agentRoleTemplateSchema = z.object({
  role: agentProfileRoleSchema,
  label: z.string().min(1).max(80),
  mission: z.string().min(1).max(400),
  instructions: z.string().min(1).max(4000),
  responsibilities: z.array(z.string().min(1).max(240)).min(1).max(12),
  defaultCapabilities: z.array(z.string().min(1).max(80)).min(1).max(16),
  defaultToolScopes: z.array(z.string().min(1).max(120)).max(16),
  defaultPolicy: agentAutonomyPolicySchema,
  defaultModelPreferences: jsonRecordSchema.default({}),
  defaultMaxConcurrency: z.number().int().positive().default(1)
});

export const agentProfileSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  createdByUserId: z.string().min(1).optional(),
  role: agentProfileRoleSchema,
  status: agentProfileStatusSchema.default("active"),
  name: z.string().min(1).max(120),
  description: z.string().min(1).max(1000),
  instructions: z.string().min(1).max(8000),
  capabilities: z.array(z.string().min(1).max(120)).default([]),
  toolScopes: z.array(z.string().min(1).max(160)).default([]),
  policy: agentAutonomyPolicySchema.default(defaultAgentAutonomyPolicy),
  modelPreferences: jsonRecordSchema.default({}),
  maxConcurrency: z.number().int().positive().default(1),
  metadata: jsonRecordSchema.default({}),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema
});

export const agentMissionSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  createdByUserId: z.string().min(1).optional(),
  coordinatorProfileId: z.string().min(1).optional(),
  missionType: agentMissionTypeSchema,
  title: z.string().min(1).max(180),
  objective: z.string().min(1).max(1000),
  brief: z.string().min(1).max(8000),
  status: agentMissionStatusSchema.default("draft"),
  priority: z.number().int().min(0).max(100).default(50),
  inputs: missionInputsSchema,
  context: missionContextSchema,
  policy: agentAutonomyPolicySchema.default(defaultAgentAutonomyPolicy),
  result: missionResultSchema.optional(),
  error: z.string().min(1).optional(),
  requestedAt: isoTimestampSchema,
  startedAt: isoTimestampSchema.optional(),
  completedAt: isoTimestampSchema.optional(),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema
});

export const agentTaskRunSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  missionId: z.string().min(1),
  profileId: z.string().min(1),
  agentRunId: z.string().min(1).optional(),
  taskName: z.string().min(1).max(180),
  status: agentTaskRunStatusSchema.default("queued"),
  attemptNumber: z.number().int().positive().default(1),
  input: jsonRecordSchema.default({}),
  output: jsonRecordSchema.optional(),
  policySnapshot: jsonRecordSchema.default({}),
  error: z.string().min(1).optional(),
  queuedAt: isoTimestampSchema,
  startedAt: isoTimestampSchema.optional(),
  completedAt: isoTimestampSchema.optional(),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema
});

export const agentPolicyEventSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  missionId: z.string().min(1).optional(),
  taskRunId: z.string().min(1).optional(),
  profileId: z.string().min(1).optional(),
  severity: agentPolicyEventSeveritySchema.default("info"),
  action: agentPolicyEventActionSchema,
  policyKey: z.string().min(1).max(160),
  message: z.string().min(1).max(1200),
  details: jsonRecordSchema.default({}),
  occurredAt: isoTimestampSchema,
  createdAt: isoTimestampSchema
});

export const agentSimulationUsageEstimateSchema = z.object({
  modelCalls: z.number().int().nonnegative().default(0),
  toolCalls: z.number().int().nonnegative().default(0),
  estimatedCostCents: z.number().int().nonnegative().default(0),
  usageLedgerWrites: z.number().int().nonnegative().default(0),
  scheduledPostWrites: z.number().int().nonnegative().default(0),
  publishEnqueues: z.number().int().nonnegative().default(0),
  replySends: z.number().int().nonnegative().default(0),
  providerRequests: z.number().int().nonnegative().default(0),
  sideEffectsSuppressed: z.number().int().nonnegative().default(0)
});

export const agentSimulationRiskLevelSchema = z.enum(["low", "medium", "high", "blocked"]);

export const agentSimulationPlannedActionSchema = z.object({
  id: z.string().min(1),
  taskIndex: z.number().int().nonnegative(),
  role: agentProfileRoleSchema,
  taskName: z.string().min(1).max(180),
  action: agentActionTypeSchema,
  toolScope: z.string().min(1),
  input: jsonRecordSchema.default({}),
  profileId: z.string().min(1).optional(),
  profileName: z.string().min(1).optional(),
  status: z.enum(["would_run", "would_skip", "would_require_review", "blocked"]),
  policy: z.object({
    allowed: z.boolean(),
    action: agentPolicyEventActionSchema,
    severity: agentPolicyEventSeveritySchema,
    policyKey: z.string().min(1),
    message: z.string().min(1)
  }),
  estimatedUsage: agentSimulationUsageEstimateSchema,
  suppressedSideEffects: z.array(z.string().min(1)).default([]),
  approvalRequired: z.boolean().default(false),
  blockedReasons: z.array(z.string().min(1)).default([]),
  providerReadinessWarnings: z.array(z.string().min(1)).default([]),
  promotable: z.boolean().default(false),
  riskLevel: agentSimulationRiskLevelSchema.default("low")
});

export const agentN8nAuditEventSchema = z.object({
  id: z.string().min(1),
  direction: z.enum(["outbound", "callback"]),
  eventType: z.string().min(1).optional(),
  workflow: z.string().min(1).optional(),
  status: z.string().min(1),
  payload: jsonRecordSchema.default({}),
  responseStatus: z.number().int().optional(),
  error: z.string().min(1).optional(),
  occurredAt: isoTimestampSchema.optional(),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema
});

export const agentMissionSimulationRunSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  missionId: z.string().min(1),
  requestedByUserId: z.string().min(1).optional(),
  status: agentMissionSimulationStatusSchema.default("succeeded"),
  plannedActions: z.array(agentSimulationPlannedActionSchema).default([]),
  policyEvents: z.array(agentPolicyEventSchema).default([]),
  estimatedUsage: agentSimulationUsageEstimateSchema,
  summary: jsonRecordSchema.default({}),
  error: z.string().min(1).optional(),
  createdAt: isoTimestampSchema,
  completedAt: isoTimestampSchema.optional()
});

export type AgentProfileRole = z.infer<typeof agentProfileRoleSchema>;
export type AgentProfileStatus = z.infer<typeof agentProfileStatusSchema>;
export type AgentMissionStatus = z.infer<typeof agentMissionStatusSchema>;
export type AgentMissionType = z.infer<typeof agentMissionTypeSchema>;
export type AgentTaskRunStatus = z.infer<typeof agentTaskRunStatusSchema>;
export type AgentPolicyEventSeverity = z.infer<typeof agentPolicyEventSeveritySchema>;
export type AgentPolicyEventAction = z.infer<typeof agentPolicyEventActionSchema>;
export type AgentMissionSimulationStatus = z.infer<typeof agentMissionSimulationStatusSchema>;
export type AgentActionType = z.infer<typeof agentActionTypeSchema>;
export type AgentAutonomyPolicy = z.infer<typeof agentAutonomyPolicySchema>;
export type AgentRoleTemplate = z.infer<typeof agentRoleTemplateSchema>;
export type AgentProfile = z.infer<typeof agentProfileSchema>;
export type AgentMission = z.infer<typeof agentMissionSchema>;
export type AgentTaskRun = z.infer<typeof agentTaskRunSchema>;
export type AgentPolicyEvent = z.infer<typeof agentPolicyEventSchema>;
export type AgentSimulationUsageEstimate = z.infer<typeof agentSimulationUsageEstimateSchema>;
export type AgentSimulationRiskLevel = z.infer<typeof agentSimulationRiskLevelSchema>;
export type AgentSimulationPlannedAction = z.infer<typeof agentSimulationPlannedActionSchema>;
export type AgentMissionSimulationRun = z.infer<typeof agentMissionSimulationRunSchema>;
export type AgentN8nAuditEvent = z.infer<typeof agentN8nAuditEventSchema>;
