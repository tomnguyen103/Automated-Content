import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { getDb, type DatabaseClient } from "@/db";
import {
  agentMissions,
  agentPolicyEvents,
  agentProfiles,
  agentTaskRuns
} from "@/db/schema";
import {
  agentMissionSchema,
  agentPolicyEventSchema,
  agentProfileSchema,
  agentTaskRunSchema,
  type AgentMission,
  type AgentPolicyEvent,
  type AgentProfile,
  type AgentProfileRole,
  type AgentTaskRun
} from "@/lib/agents/schemas/orchestration";
import { isDatabaseConfigured } from "@/lib/env";
import { agentRoleTemplates, buildAgentProfileFromTemplate } from "@/lib/agents/orchestration/role-templates";

type ScopedIdInput = {
  workspaceId: string;
  id: string;
};

type MissionScopedInput = {
  workspaceId: string;
  missionId: string;
};

type TaskRunScopedInput = {
  workspaceId: string;
  taskRunId: string;
};

export type SeedAgentRoleTemplatesInput = {
  workspaceId: string;
  createdByUserId?: string;
  roles?: AgentProfileRole[];
  now?: Date;
};

export type AgentProfileRepository = {
  save: (profile: AgentProfile) => Promise<AgentProfile>;
  get: (input: ScopedIdInput) => Promise<AgentProfile | null>;
  list: (workspaceId: string) => Promise<AgentProfile[]>;
  seedRoleTemplates: (input: SeedAgentRoleTemplatesInput) => Promise<AgentProfile[]>;
};

export type AgentMissionRepository = {
  save: (mission: AgentMission) => Promise<AgentMission>;
  get: (input: ScopedIdInput) => Promise<AgentMission | null>;
  list: (workspaceId: string) => Promise<AgentMission[]>;
};

export type AgentTaskRunRepository = {
  save: (taskRun: AgentTaskRun) => Promise<AgentTaskRun>;
  get: (input: ScopedIdInput) => Promise<AgentTaskRun | null>;
  listForMission: (input: MissionScopedInput) => Promise<AgentTaskRun[]>;
};

export type AgentPolicyEventRepository = {
  record: (event: AgentPolicyEvent) => Promise<AgentPolicyEvent>;
  get: (input: ScopedIdInput) => Promise<AgentPolicyEvent | null>;
  listForMission: (input: MissionScopedInput) => Promise<AgentPolicyEvent[]>;
  listForTaskRun: (input: TaskRunScopedInput) => Promise<AgentPolicyEvent[]>;
};

export type AgentOrchestrationRepositories = {
  profiles: AgentProfileRepository;
  missions: AgentMissionRepository;
  taskRuns: AgentTaskRunRepository;
  policyEvents: AgentPolicyEventRepository;
};

function toJsonRecord(value: Record<string, unknown>) {
  return value;
}

function toDate(value: string) {
  return new Date(value);
}

function toIso(value: Date | string | null | undefined) {
  if (!value) {
    return undefined;
  }

  return value instanceof Date ? value.toISOString() : value;
}

function sortByCreatedDesc<T extends { createdAt: string }>(rows: T[]) {
  return [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function sortPolicyEventsDesc(rows: AgentPolicyEvent[]) {
  return [...rows].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

function profileFromRow(row: typeof agentProfiles.$inferSelect): AgentProfile {
  return agentProfileSchema.parse({
    id: row.id,
    workspaceId: row.workspaceId,
    createdByUserId: row.createdByUserId ?? undefined,
    role: row.role,
    status: row.status,
    name: row.name,
    description: row.description,
    instructions: row.instructions,
    capabilities: row.capabilities,
    toolScopes: row.toolScopes,
    policy: row.policy,
    modelPreferences: row.modelPreferences,
    maxConcurrency: row.maxConcurrency,
    metadata: row.metadata,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  });
}

function missionFromRow(row: typeof agentMissions.$inferSelect): AgentMission {
  return agentMissionSchema.parse({
    id: row.id,
    workspaceId: row.workspaceId,
    createdByUserId: row.createdByUserId ?? undefined,
    coordinatorProfileId: row.coordinatorProfileId ?? undefined,
    missionType: row.missionType,
    title: row.title,
    objective: row.objective,
    brief: row.brief,
    status: row.status,
    priority: row.priority,
    inputs: row.inputs,
    context: row.context,
    policy: row.policy,
    result: row.result ?? undefined,
    error: row.error ?? undefined,
    requestedAt: row.requestedAt.toISOString(),
    startedAt: toIso(row.startedAt),
    completedAt: toIso(row.completedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  });
}

function taskRunFromRow(row: typeof agentTaskRuns.$inferSelect): AgentTaskRun {
  return agentTaskRunSchema.parse({
    id: row.id,
    workspaceId: row.workspaceId,
    missionId: row.missionId,
    profileId: row.profileId,
    agentRunId: row.agentRunId ?? undefined,
    taskName: row.taskName,
    status: row.status,
    attemptNumber: row.attemptNumber,
    input: row.input,
    output: row.output ?? undefined,
    policySnapshot: row.policySnapshot,
    error: row.error ?? undefined,
    queuedAt: row.queuedAt.toISOString(),
    startedAt: toIso(row.startedAt),
    completedAt: toIso(row.completedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  });
}

function policyEventFromRow(row: typeof agentPolicyEvents.$inferSelect): AgentPolicyEvent {
  return agentPolicyEventSchema.parse({
    id: row.id,
    workspaceId: row.workspaceId,
    missionId: row.missionId ?? undefined,
    taskRunId: row.taskRunId ?? undefined,
    profileId: row.profileId ?? undefined,
    severity: row.severity,
    action: row.action,
    policyKey: row.policyKey,
    message: row.message,
    details: row.details,
    occurredAt: row.occurredAt.toISOString(),
    createdAt: row.createdAt.toISOString()
  });
}

function profileToRow(profile: AgentProfile) {
  return {
    id: profile.id,
    workspaceId: profile.workspaceId,
    createdByUserId: profile.createdByUserId ?? null,
    role: profile.role,
    status: profile.status,
    name: profile.name,
    description: profile.description,
    instructions: profile.instructions,
    capabilities: profile.capabilities,
    toolScopes: profile.toolScopes,
    policy: toJsonRecord(profile.policy),
    modelPreferences: toJsonRecord(profile.modelPreferences),
    maxConcurrency: profile.maxConcurrency,
    metadata: toJsonRecord(profile.metadata),
    createdAt: toDate(profile.createdAt),
    updatedAt: toDate(profile.updatedAt)
  };
}

function missionToRow(mission: AgentMission) {
  return {
    id: mission.id,
    workspaceId: mission.workspaceId,
    createdByUserId: mission.createdByUserId ?? null,
    coordinatorProfileId: mission.coordinatorProfileId ?? null,
    missionType: mission.missionType,
    title: mission.title,
    objective: mission.objective,
    brief: mission.brief,
    status: mission.status,
    priority: mission.priority,
    inputs: toJsonRecord(mission.inputs),
    context: toJsonRecord(mission.context),
    policy: toJsonRecord(mission.policy),
    result: mission.result ? toJsonRecord(mission.result) : null,
    error: mission.error ?? null,
    requestedAt: toDate(mission.requestedAt),
    startedAt: mission.startedAt ? toDate(mission.startedAt) : null,
    completedAt: mission.completedAt ? toDate(mission.completedAt) : null,
    createdAt: toDate(mission.createdAt),
    updatedAt: toDate(mission.updatedAt)
  };
}

function taskRunToRow(taskRun: AgentTaskRun) {
  return {
    id: taskRun.id,
    workspaceId: taskRun.workspaceId,
    missionId: taskRun.missionId,
    profileId: taskRun.profileId,
    agentRunId: taskRun.agentRunId ?? null,
    taskName: taskRun.taskName,
    status: taskRun.status,
    attemptNumber: taskRun.attemptNumber,
    input: toJsonRecord(taskRun.input),
    output: taskRun.output ? toJsonRecord(taskRun.output) : null,
    policySnapshot: toJsonRecord(taskRun.policySnapshot),
    error: taskRun.error ?? null,
    queuedAt: toDate(taskRun.queuedAt),
    startedAt: taskRun.startedAt ? toDate(taskRun.startedAt) : null,
    completedAt: taskRun.completedAt ? toDate(taskRun.completedAt) : null,
    createdAt: toDate(taskRun.createdAt),
    updatedAt: toDate(taskRun.updatedAt)
  };
}

function policyEventToRow(event: AgentPolicyEvent) {
  return {
    id: event.id,
    workspaceId: event.workspaceId,
    missionId: event.missionId ?? null,
    taskRunId: event.taskRunId ?? null,
    profileId: event.profileId ?? null,
    severity: event.severity,
    action: event.action,
    policyKey: event.policyKey,
    message: event.message,
    details: toJsonRecord(event.details),
    occurredAt: toDate(event.occurredAt),
    createdAt: toDate(event.createdAt)
  };
}

export function createDatabaseAgentProfileRepository(db: DatabaseClient = getDb()): AgentProfileRepository {
  const repository: AgentProfileRepository = {
    async save(profile) {
      const parsed = agentProfileSchema.parse(profile);
      const row = profileToRow(parsed);

      await db
        .insert(agentProfiles)
        .values(row)
        .onConflictDoUpdate({
          target: agentProfiles.id,
          set: {
            createdByUserId: row.createdByUserId,
            role: row.role,
            status: row.status,
            name: row.name,
            description: row.description,
            instructions: row.instructions,
            capabilities: row.capabilities,
            toolScopes: row.toolScopes,
            policy: row.policy,
            modelPreferences: row.modelPreferences,
            maxConcurrency: row.maxConcurrency,
            metadata: row.metadata,
            updatedAt: row.updatedAt
          }
        });

      return parsed;
    },

    async get({ workspaceId, id }) {
      const [row] = await db
        .select()
        .from(agentProfiles)
        .where(and(eq(agentProfiles.workspaceId, workspaceId), eq(agentProfiles.id, id)))
        .limit(1);

      return row ? profileFromRow(row) : null;
    },

    async list(workspaceId) {
      const rows = await db
        .select()
        .from(agentProfiles)
        .where(eq(agentProfiles.workspaceId, workspaceId))
        .orderBy(desc(agentProfiles.createdAt));

      return rows.map(profileFromRow);
    },

    async seedRoleTemplates({ workspaceId, createdByUserId, roles, now = new Date() }) {
      const profiles = (roles ?? agentRoleTemplates.map((template) => template.role)).map((role) =>
        buildAgentProfileFromTemplate({ role, workspaceId, createdByUserId, now })
      );

      await Promise.all(profiles.map((profile) => repository.save(profile)));

      return profiles;
    }
  };

  return repository;
}

export function createDatabaseAgentMissionRepository(db: DatabaseClient = getDb()): AgentMissionRepository {
  return {
    async save(mission) {
      const parsed = agentMissionSchema.parse(mission);
      const row = missionToRow(parsed);

      await db
        .insert(agentMissions)
        .values(row)
        .onConflictDoUpdate({
          target: agentMissions.id,
          set: {
            createdByUserId: row.createdByUserId,
            coordinatorProfileId: row.coordinatorProfileId,
            missionType: row.missionType,
            title: row.title,
            objective: row.objective,
            brief: row.brief,
            status: row.status,
            priority: row.priority,
            inputs: row.inputs,
            context: row.context,
            policy: row.policy,
            result: row.result,
            error: row.error,
            startedAt: row.startedAt,
            completedAt: row.completedAt,
            updatedAt: row.updatedAt
          }
        });

      return parsed;
    },

    async get({ workspaceId, id }) {
      const [row] = await db
        .select()
        .from(agentMissions)
        .where(and(eq(agentMissions.workspaceId, workspaceId), eq(agentMissions.id, id)))
        .limit(1);

      return row ? missionFromRow(row) : null;
    },

    async list(workspaceId) {
      const rows = await db
        .select()
        .from(agentMissions)
        .where(eq(agentMissions.workspaceId, workspaceId))
        .orderBy(desc(agentMissions.createdAt));

      return rows.map(missionFromRow);
    }
  };
}

export function createDatabaseAgentTaskRunRepository(db: DatabaseClient = getDb()): AgentTaskRunRepository {
  return {
    async save(taskRun) {
      const parsed = agentTaskRunSchema.parse(taskRun);
      const row = taskRunToRow(parsed);

      await db
        .insert(agentTaskRuns)
        .values(row)
        .onConflictDoUpdate({
          target: agentTaskRuns.id,
          set: {
            profileId: row.profileId,
            agentRunId: row.agentRunId,
            taskName: row.taskName,
            status: row.status,
            attemptNumber: row.attemptNumber,
            input: row.input,
            output: row.output,
            policySnapshot: row.policySnapshot,
            error: row.error,
            startedAt: row.startedAt,
            completedAt: row.completedAt,
            updatedAt: row.updatedAt
          }
        });

      return parsed;
    },

    async get({ workspaceId, id }) {
      const [row] = await db
        .select()
        .from(agentTaskRuns)
        .where(and(eq(agentTaskRuns.workspaceId, workspaceId), eq(agentTaskRuns.id, id)))
        .limit(1);

      return row ? taskRunFromRow(row) : null;
    },

    async listForMission({ workspaceId, missionId }) {
      const rows = await db
        .select()
        .from(agentTaskRuns)
        .where(and(eq(agentTaskRuns.workspaceId, workspaceId), eq(agentTaskRuns.missionId, missionId)))
        .orderBy(desc(agentTaskRuns.createdAt));

      return rows.map(taskRunFromRow);
    }
  };
}

export function createDatabaseAgentPolicyEventRepository(db: DatabaseClient = getDb()): AgentPolicyEventRepository {
  return {
    async record(event) {
      const parsed = agentPolicyEventSchema.parse(event);

      await db.insert(agentPolicyEvents).values(policyEventToRow(parsed));

      return parsed;
    },

    async get({ workspaceId, id }) {
      const [row] = await db
        .select()
        .from(agentPolicyEvents)
        .where(and(eq(agentPolicyEvents.workspaceId, workspaceId), eq(agentPolicyEvents.id, id)))
        .limit(1);

      return row ? policyEventFromRow(row) : null;
    },

    async listForMission({ workspaceId, missionId }) {
      const rows = await db
        .select()
        .from(agentPolicyEvents)
        .where(and(eq(agentPolicyEvents.workspaceId, workspaceId), eq(agentPolicyEvents.missionId, missionId)))
        .orderBy(desc(agentPolicyEvents.occurredAt));

      return rows.map(policyEventFromRow);
    },

    async listForTaskRun({ workspaceId, taskRunId }) {
      const rows = await db
        .select()
        .from(agentPolicyEvents)
        .where(and(eq(agentPolicyEvents.workspaceId, workspaceId), eq(agentPolicyEvents.taskRunId, taskRunId)))
        .orderBy(desc(agentPolicyEvents.occurredAt));

      return rows.map(policyEventFromRow);
    }
  };
}

export function createDatabaseAgentOrchestrationRepositories(
  db: DatabaseClient = getDb()
): AgentOrchestrationRepositories {
  return {
    profiles: createDatabaseAgentProfileRepository(db),
    missions: createDatabaseAgentMissionRepository(db),
    taskRuns: createDatabaseAgentTaskRunRepository(db),
    policyEvents: createDatabaseAgentPolicyEventRepository(db)
  };
}

export function createMemoryAgentOrchestrationRepositories(): AgentOrchestrationRepositories & {
  clear: () => void;
} {
  const profiles = new Map<string, AgentProfile>();
  const missions = new Map<string, AgentMission>();
  const taskRuns = new Map<string, AgentTaskRun>();
  const policyEvents = new Map<string, AgentPolicyEvent>();

  function key(workspaceId: string, id: string) {
    return `${workspaceId}:${id}`;
  }

  const repositories: AgentOrchestrationRepositories & { clear: () => void } = {
    profiles: {
      async save(profile) {
        const parsed = agentProfileSchema.parse(profile);
        profiles.set(key(parsed.workspaceId, parsed.id), parsed);
        return parsed;
      },
      async get({ workspaceId, id }) {
        return profiles.get(key(workspaceId, id)) ?? null;
      },
      async list(workspaceId) {
        const workspacePrefix = `${workspaceId}:`;

        return sortByCreatedDesc(
          [...profiles.entries()]
            .filter(([profileKey]) => profileKey.startsWith(workspacePrefix))
            .map(([, profile]) => profile)
        );
      },
      async seedRoleTemplates({ workspaceId, createdByUserId, roles, now = new Date() }) {
        const seededProfiles = (roles ?? agentRoleTemplates.map((template) => template.role)).map((role) =>
          buildAgentProfileFromTemplate({ role, workspaceId, createdByUserId, now })
        );

        await Promise.all(seededProfiles.map((profile) => repositories.profiles.save(profile)));

        return seededProfiles;
      }
    },
    missions: {
      async save(mission) {
        const parsed = agentMissionSchema.parse(mission);
        missions.set(key(parsed.workspaceId, parsed.id), parsed);
        return parsed;
      },
      async get({ workspaceId, id }) {
        return missions.get(key(workspaceId, id)) ?? null;
      },
      async list(workspaceId) {
        const workspacePrefix = `${workspaceId}:`;

        return sortByCreatedDesc(
          [...missions.entries()]
            .filter(([missionKey]) => missionKey.startsWith(workspacePrefix))
            .map(([, mission]) => mission)
        );
      }
    },
    taskRuns: {
      async save(taskRun) {
        const parsed = agentTaskRunSchema.parse(taskRun);
        taskRuns.set(key(parsed.workspaceId, parsed.id), parsed);
        return parsed;
      },
      async get({ workspaceId, id }) {
        return taskRuns.get(key(workspaceId, id)) ?? null;
      },
      async listForMission({ workspaceId, missionId }) {
        return sortByCreatedDesc(
          [...taskRuns.values()].filter(
            (taskRun) => taskRun.workspaceId === workspaceId && taskRun.missionId === missionId
          )
        );
      }
    },
    policyEvents: {
      async record(event) {
        const parsed = agentPolicyEventSchema.parse(event);
        policyEvents.set(key(parsed.workspaceId, parsed.id), parsed);
        return parsed;
      },
      async get({ workspaceId, id }) {
        return policyEvents.get(key(workspaceId, id)) ?? null;
      },
      async listForMission({ workspaceId, missionId }) {
        return sortPolicyEventsDesc(
          [...policyEvents.values()].filter(
            (event) => event.workspaceId === workspaceId && event.missionId === missionId
          )
        );
      },
      async listForTaskRun({ workspaceId, taskRunId }) {
        return sortPolicyEventsDesc(
          [...policyEvents.values()].filter(
            (event) => event.workspaceId === workspaceId && event.taskRunId === taskRunId
          )
        );
      }
    },
    clear() {
      profiles.clear();
      missions.clear();
      taskRuns.clear();
      policyEvents.clear();
    }
  };

  return repositories;
}

const sharedMemoryAgentOrchestrationRepositories = createMemoryAgentOrchestrationRepositories();

export function createAgentOrchestrationRepositories({ allowMemoryFallback = false } = {}) {
  if (allowMemoryFallback) {
    return sharedMemoryAgentOrchestrationRepositories;
  }

  if (isDatabaseConfigured) {
    return createDatabaseAgentOrchestrationRepositories();
  }

  throw new Error("DATABASE_URL is required for agent orchestration persistence.");
}

export function clearAgentOrchestrationRepositoriesForTests() {
  sharedMemoryAgentOrchestrationRepositories.clear();
}
