"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Ban,
  Bot,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Clock3,
  FlaskConical,
  ListChecks,
  Pause,
  Play,
  RotateCw,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  agentMissionSchema,
  agentMissionSimulationRunSchema,
  agentMissionTypeSchema,
  agentN8nAuditEventSchema,
  agentPolicyEventSchema,
  agentProfileSchema,
  agentTaskRunSchema,
  type AgentN8nAuditEvent,
  type AgentMission,
  type AgentMissionSimulationRun,
  type AgentMissionType,
  type AgentPolicyEvent,
  type AgentProfile,
  type AgentSimulationPlannedAction,
  type AgentTaskRun
} from "@/lib/agents/schemas/orchestration";

type MissionRecord = {
  mission: AgentMission;
  tasks: AgentTaskRun[];
  policyEvents: AgentPolicyEvent[];
  simulations: AgentMissionSimulationRun[];
  n8nEvents: AgentN8nAuditEvent[];
};

type AgentsConsoleState = {
  profiles: AgentProfile[];
  missions: MissionRecord[];
};

type AgentsConsoleProps = {
  initialState: AgentsConsoleState;
};

type BusyAction =
  | "create_mission"
  | "run_mission"
  | "simulate_mission"
  | "pause_mission"
  | "resume_mission"
  | "profile_pause"
  | "profile_resume"
  | "refresh"
  | null;

const missionTypeOptions: Array<{ value: AgentMissionType; label: string }> = [
  { value: "research_topics", label: "Research topics" },
  { value: "content_pipeline", label: "Content pipeline" },
  { value: "content_remix", label: "Content remix" },
  { value: "auto_publish", label: "Auto publish" },
  { value: "comment_engagement", label: "Comment engagement" },
  { value: "weekly_report", label: "Weekly report" }
];

const platformOptions = ["linkedin", "x", "instagram", "facebook", "threads", "tiktok"] as const;

const statusTone = {
  active: "success",
  archived: "neutral",
  canceled: "neutral",
  disabled: "critical",
  draft: "neutral",
  failed: "critical",
  paused: "premium",
  queued: "community",
  running: "primary",
  skipped: "neutral",
  succeeded: "success"
} as const;

function formatDate(value: string | undefined) {
  if (!value) {
    return "Not started";
  }

  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short"
  }).format(new Date(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseProfiles(payload: unknown) {
  if (!isRecord(payload) || !Array.isArray(payload.profiles)) {
    return [];
  }

  return payload.profiles.map((profile) => agentProfileSchema.parse(profile));
}

function parseMissions(payload: unknown): MissionRecord[] {
  if (!isRecord(payload) || !Array.isArray(payload.missions)) {
    return [];
  }

  return payload.missions.filter(isRecord).map((record) => ({
    mission: agentMissionSchema.parse(record.mission),
    tasks: (Array.isArray(record.tasks) ? record.tasks : []).map((task) => agentTaskRunSchema.parse(task)),
    policyEvents: (Array.isArray(record.policyEvents) ? record.policyEvents : []).map((event) => agentPolicyEventSchema.parse(event)),
    simulations: (Array.isArray(record.simulations) ? record.simulations : []).map((simulation) => agentMissionSimulationRunSchema.parse(simulation)),
    n8nEvents: (Array.isArray(record.n8nEvents) ? record.n8nEvents : []).map((event) => agentN8nAuditEventSchema.parse(event))
  }));
}

async function readJson(response: Response) {
  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
        ? payload.error
        : "Agent request failed.";
    throw new Error(message);
  }

  return payload;
}

function roleLabel(role: AgentProfile["role"]) {
  return role.replace("_", " ");
}

function missionVerb(status: AgentMission["status"]) {
  if (status === "paused") {
    return "Resume";
  }

  if (status === "running") {
    return "Running";
  }

  return "Run";
}

function newestActivity(missions: MissionRecord[]) {
  return missions
    .flatMap((record) => [
      ...record.tasks.map((task) => ({
        id: task.id,
        label: task.taskName,
        detail: record.mission.title,
        status: task.status,
        at: task.completedAt ?? task.startedAt ?? task.queuedAt
      })),
      ...record.policyEvents.map((event) => ({
        id: event.id,
        label: event.message,
        detail: event.policyKey,
        status: event.severity,
        at: event.occurredAt
      })),
      ...record.simulations.map((simulation) => ({
        id: simulation.id,
        label: simulation.status === "failed" ? "Mission simulation failed" : "Mission simulation completed",
        detail: simulation.error ?? `${record.mission.title} - ${simulation.plannedActions.length} planned actions`,
        status: simulation.status,
        at: simulation.completedAt ?? simulation.createdAt
      })),
      ...record.n8nEvents.map((event) => ({
        id: event.id,
        label: event.eventType ?? event.workflow ?? "n8n event",
        detail: record.mission.title,
        status: event.status,
        at: event.occurredAt ?? event.createdAt
      }))
    ])
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 8);
}

function newestSimulations(missions: MissionRecord[]) {
  return missions
    .flatMap((record) =>
      record.simulations.map((simulation) => ({
        mission: record.mission,
        simulation
      }))
    )
    .sort((a, b) => (b.simulation.completedAt ?? b.simulation.createdAt).localeCompare(a.simulation.completedAt ?? a.simulation.createdAt))
    .slice(0, 6);
}

function plannedActionTone(status: AgentSimulationPlannedAction["status"]) {
  if (status === "would_run") {
    return "success";
  }

  if (status === "would_require_review") {
    return "premium";
  }

  return status === "blocked" ? "critical" : "neutral";
}

function missionPolicyMessage(simulation: AgentMissionSimulationRun) {
  const missionEvent = simulation.policyEvents.find((event) => {
    const details = isRecord(event.details) ? event.details : {};

    return typeof details.plannedActionId !== "string";
  });

  return missionEvent?.message;
}

function formatCents(value: number) {
  if (value === 0) {
    return "$0.00";
  }

  return `$${(value / 100).toFixed(2)}`;
}

function numberFromSummary(summary: Record<string, unknown>, key: string) {
  const value = summary[key];

  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function stringArrayFromSummary(summary: Record<string, unknown>, key: string) {
  const value = summary[key];

  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];
}

function simulationSummary(simulation: AgentMissionSimulationRun) {
  const summary = isRecord(simulation.summary) ? simulation.summary : {};
  const riskLevel = typeof summary.riskLevel === "string" ? summary.riskLevel : "low";
  const promotable = typeof summary.promotable === "boolean"
    ? summary.promotable
    : simulation.status === "succeeded"
      && simulation.plannedActions.length > 0
      && simulation.plannedActions.every((action) => action.status === "would_run");

  return {
    approvalRequiredCount: numberFromSummary(summary, "approvalRequiredCount"),
    blockedReasonCount: numberFromSummary(summary, "blockedReasonCount"),
    promotable,
    providerReadinessWarnings: stringArrayFromSummary(summary, "providerReadinessWarnings"),
    riskLevel
  };
}

function riskTone(riskLevel: string) {
  if (riskLevel === "blocked") {
    return "critical";
  }

  if (riskLevel === "high") {
    return "premium";
  }

  if (riskLevel === "medium") {
    return "community";
  }

  return "success";
}

function newestSimulation(record: MissionRecord) {
  return [...record.simulations].sort((a, b) =>
    (b.completedAt ?? b.createdAt).localeCompare(a.completedAt ?? a.createdAt)
  )[0];
}

function summarizeTaskOutput(task: AgentTaskRun) {
  if (task.error) {
    return task.error;
  }

  if (!task.output || Object.keys(task.output).length === 0) {
    return "No output recorded.";
  }

  const keys = Object.keys(task.output).slice(0, 3);

  return `Output fields: ${keys.join(", ")}`;
}

function n8nLabel(event: AgentN8nAuditEvent) {
  return event.eventType ?? event.workflow ?? "n8n event";
}

export function AgentsConsole({ initialState }: AgentsConsoleProps) {
  const [profiles, setProfiles] = useState(initialState.profiles);
  const [missions, setMissions] = useState(initialState.missions);
  const [missionType, setMissionType] = useState<AgentMissionType>("content_pipeline");
  const [title, setTitle] = useState("Supervised content mission");
  const [topic, setTopic] = useState("Autonomous content operations");
  const [brief, setBrief] = useState("Research, generate, schedule, and report on a focused content mission.");
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(["linkedin", "x"]);
  const [dailyActionCap, setDailyActionCap] = useState(10);
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.78);
  const [blockedPhrases, setBlockedPhrases] = useState("guarantee, risk-free");
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedMissionId, setExpandedMissionId] = useState<string | null>(
    initialState.missions[0]?.mission.id ?? null
  );
  const activity = useMemo(() => newestActivity(missions), [missions]);
  const simulationRecords = useMemo(() => newestSimulations(missions), [missions]);
  const stats = useMemo(
    () => ({
      activeProfiles: profiles.filter((profile) => profile.status === "active" && !profile.policy.emergencyPaused).length,
      pausedProfiles: profiles.filter((profile) => profile.policy.emergencyPaused || profile.status !== "active").length,
      runningMissions: missions.filter((record) => record.mission.status === "running" || record.mission.status === "queued").length,
      blockedEvents: missions.reduce(
        (sum, record) => sum + record.policyEvents.filter((event) => event.severity === "blocked").length,
        0
      ),
      simulationRuns: missions.reduce((sum, record) => sum + record.simulations.length, 0)
    }),
    [missions, profiles]
  );

  async function refresh() {
    const [profilePayload, missionPayload] = await Promise.all([
      fetch("/api/agents/profiles").then(readJson),
      fetch("/api/agents/missions").then(readJson)
    ]);

    setProfiles(parseProfiles(profilePayload));
    setMissions(parseMissions(missionPayload));
  }

  async function withBusy(action: BusyAction, mutation: () => Promise<void>) {
    setBusyAction(action);
    setError(null);

    try {
      await mutation();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Agent request failed.");
    } finally {
      setBusyAction(null);
    }
  }

  async function createMission() {
    await withBusy("create_mission", async () => {
      const parsedMissionType = agentMissionTypeSchema.parse(missionType);
      const platforms = selectedPlatforms.length > 0 ? selectedPlatforms : ["linkedin"];

      await readJson(
        await fetch("/api/agents/missions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            missionType: parsedMissionType,
            title,
            objective: topic,
            brief,
            inputs: {
              topic,
              platforms,
              providerByPlatform: {
                facebook: "meta",
                instagram: "meta",
                linkedin: "linkedin",
                threads: "meta",
                tiktok: "mock",
                x: "x"
              },
              maxComments: dailyActionCap
            },
            policy: {
              autonomy: "supervised",
              dailyActionCap,
              confidenceThreshold,
              blockedPhrases: blockedPhrases
                .split(",")
                .map((phrase) => phrase.trim())
                .filter(Boolean),
              platformScope: platforms,
              maxTasksPerRun: 12
            }
          })
        })
      );
      await refresh();
    });
  }

  async function runMission(mission: AgentMission) {
    const endpoint = mission.status === "paused" ? "resume" : "run";

    await withBusy(mission.status === "paused" ? "resume_mission" : "run_mission", async () => {
      await readJson(await fetch(`/api/agents/missions/${mission.id}/${endpoint}`, { method: "POST" }));
      await refresh();
    });
  }

  async function simulateMission(mission: AgentMission) {
    await withBusy("simulate_mission", async () => {
      await readJson(await fetch(`/api/agents/missions/${mission.id}/simulate`, { method: "POST" }));
      await refresh();
    });
  }

  async function pauseMission(mission: AgentMission) {
    await withBusy("pause_mission", async () => {
      await readJson(await fetch(`/api/agents/missions/${mission.id}/pause`, { method: "POST" }));
      await refresh();
    });
  }

  async function toggleProfilePause(profile: AgentProfile) {
    const nextPaused = !profile.policy.emergencyPaused;

    await withBusy(nextPaused ? "profile_pause" : "profile_resume", async () => {
      await readJson(
        await fetch(`/api/agents/profiles/${profile.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            policy: {
              emergencyPaused: nextPaused
            }
          })
        })
      );
      await refresh();
    });
  }

  async function toggleAllProfiles(nextPaused: boolean) {
    await withBusy(nextPaused ? "profile_pause" : "profile_resume", async () => {
      const results = await Promise.allSettled(
        profiles.map(async (profile) =>
          readJson(
            await fetch(`/api/agents/profiles/${profile.id}`, {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                policy: {
                  emergencyPaused: nextPaused
                }
              })
            })
          )
        )
      );
      await refresh();

      const failed = results.filter((result) => result.status === "rejected");
      if (failed.length > 0) {
        throw new Error(`${failed.length} profile update(s) failed. Retry to fully apply this action.`);
      }
    });
  }

  return (
    <div className="grid gap-6">
      <section id="control" className="grid scroll-mt-20 gap-4 md:grid-cols-5">
        <Stat label="Active agents" value={stats.activeProfiles} icon={<Bot size={18} aria-hidden="true" />} />
        <Stat label="Paused agents" value={stats.pausedProfiles} icon={<Pause size={18} aria-hidden="true" />} />
        <Stat label="Open missions" value={stats.runningMissions} icon={<Clock3 size={18} aria-hidden="true" />} />
        <Stat label="Simulations" value={stats.simulationRuns} icon={<FlaskConical size={18} aria-hidden="true" />} />
        <Stat label="Policy blocks" value={stats.blockedEvents} icon={<ShieldAlert size={18} aria-hidden="true" />} />
      </section>

      {error ? (
        <div className="rounded-[var(--radius-md)] border border-[var(--color-error)] bg-rose-50 p-4 text-sm font-medium text-[var(--color-error)]">
          {error}
        </div>
      ) : null}

      <section className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          onClick={() => withBusy("refresh", refresh)}
          disabled={busyAction === "refresh"}
        >
          <RotateCw size={16} aria-hidden="true" />
          Refresh
        </Button>
        <Button
          variant="outline"
          onClick={() => toggleAllProfiles(true)}
          disabled={busyAction === "profile_pause" || profiles.every((profile) => profile.policy.emergencyPaused)}
        >
          <Ban size={16} aria-hidden="true" />
          Kill switch
        </Button>
        <Button
          variant="outline"
          onClick={() => toggleAllProfiles(false)}
          disabled={busyAction === "profile_resume" || profiles.every((profile) => !profile.policy.emergencyPaused)}
        >
          <ShieldCheck size={16} aria-hidden="true" />
          Resume agents
        </Button>
      </section>

      <section id="permissions" className="grid scroll-mt-20 gap-4 lg:grid-cols-7">
        {profiles.map((profile) => (
          <article key={profile.id} className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold capitalize">{roleLabel(profile.role)}</p>
                <p className="mt-1 truncate text-xs text-[var(--color-text-muted)]">{profile.name}</p>
              </div>
              <Badge tone={profile.policy.emergencyPaused ? "premium" : statusTone[profile.status]}>
                {profile.policy.emergencyPaused ? "paused" : profile.status}
              </Badge>
            </div>
            <dl className="mt-4 grid gap-2 text-xs">
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--color-text-muted)]">Cap</dt>
                <dd className="font-medium">{profile.policy.dailyActionCap}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--color-text-muted)]">Threshold</dt>
                <dd className="font-medium">{profile.policy.confidenceThreshold.toFixed(2)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--color-text-muted)]">Tools</dt>
                <dd className="font-medium">{profile.toolScopes.length}</dd>
              </div>
            </dl>
            <Button
              className="mt-4 w-full"
              variant="outline"
              size="sm"
              onClick={() => toggleProfilePause(profile)}
              disabled={busyAction === "profile_pause" || busyAction === "profile_resume"}
            >
              {profile.policy.emergencyPaused ? <Play size={15} aria-hidden="true" /> : <Pause size={15} aria-hidden="true" />}
              {profile.policy.emergencyPaused ? "Resume" : "Pause"}
            </Button>
          </article>
        ))}
      </section>

      <section id="missions" className="grid scroll-mt-20 gap-6 xl:grid-cols-[410px_1fr]">
        <form
          className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white p-5"
          onSubmit={(event) => {
            event.preventDefault();
            void createMission();
          }}
        >
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] bg-teal-50 text-teal-700">
              <SlidersHorizontal size={18} aria-hidden="true" />
            </span>
            <h2 className="text-base font-semibold">Mission builder</h2>
          </div>

          <div className="mt-5 grid gap-4">
            <label className="grid gap-2 text-sm font-medium">
              Mission type
              <select
                className="h-10 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white px-3 text-sm font-normal"
                value={missionType}
                onChange={(event) => setMissionType(event.target.value as AgentMissionType)}
              >
                {missionTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-sm font-medium">
              Title
              <input
                className="h-10 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 text-sm font-normal"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>

            <label className="grid gap-2 text-sm font-medium">
              Topic
              <input
                className="h-10 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 text-sm font-normal"
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
              />
            </label>

            <label className="grid gap-2 text-sm font-medium">
              Brief
              <textarea
                className="min-h-24 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2 text-sm font-normal leading-6"
                value={brief}
                onChange={(event) => setBrief(event.target.value)}
              />
            </label>

            <div className="grid gap-2">
              <span className="text-sm font-medium">Platforms</span>
              <div className="grid grid-cols-2 gap-2">
                {platformOptions.map((platform) => (
                  <label key={platform} className="flex items-center gap-2 text-sm capitalize">
                    <input
                      type="checkbox"
                      checked={selectedPlatforms.includes(platform)}
                      onChange={(event) =>
                        setSelectedPlatforms((current) =>
                          event.target.checked
                            ? [...current, platform]
                            : current.filter((candidate) => candidate !== platform)
                        )
                      }
                    />
                    {platform}
                  </label>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium">
                Daily cap
                <input
                  className="h-10 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 text-sm font-normal"
                  min={1}
                  max={100}
                  type="number"
                  value={dailyActionCap}
                  onChange={(event) => setDailyActionCap(Number(event.target.value))}
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                Confidence
                <input
                  className="h-10 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 text-sm font-normal"
                  max={1}
                  min={0}
                  step={0.01}
                  type="number"
                  value={confidenceThreshold}
                  onChange={(event) => setConfidenceThreshold(Number(event.target.value))}
                />
              </label>
            </div>

            <label className="grid gap-2 text-sm font-medium">
              Blocked phrases
              <input
                className="h-10 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 text-sm font-normal"
                value={blockedPhrases}
                onChange={(event) => setBlockedPhrases(event.target.value)}
              />
            </label>

            <Button type="submit" disabled={busyAction === "create_mission"}>
              <CheckCircle2 size={16} aria-hidden="true" />
              Create mission
            </Button>
          </div>
        </form>

        <section className="grid gap-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold">Missions</h2>
            <Badge tone="neutral">{missions.length} total</Badge>
          </div>
          {missions.length === 0 ? (
            <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white p-5 text-sm text-[var(--color-text-muted)]">
              No missions have been created yet.
            </div>
          ) : (
            <div className="grid gap-3">
              {missions.map((record) => {
                const expanded = expandedMissionId === record.mission.id;
                const latestSimulation = newestSimulation(record);

                return (
                <article key={record.mission.id} className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">{record.mission.title}</h3>
                        <Badge tone={statusTone[record.mission.status]}>{record.mission.status.replace("_", " ")}</Badge>
                        <Badge tone="neutral">{record.mission.missionType.replace("_", " ")}</Badge>
                        {latestSimulation ? (
                          <Badge tone={riskTone(simulationSummary(latestSimulation).riskLevel)}>
                            {simulationSummary(latestSimulation).riskLevel} risk
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">{record.mission.objective}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => simulateMission(record.mission)}
                        disabled={busyAction === "simulate_mission"}
                      >
                        <FlaskConical size={15} aria-hidden="true" />
                        Simulate
                      </Button>
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => runMission(record.mission)}
                        disabled={record.mission.status === "running" || busyAction === "run_mission" || busyAction === "resume_mission"}
                      >
                        <Play size={15} aria-hidden="true" />
                        {missionVerb(record.mission.status)}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => pauseMission(record.mission)}
                        disabled={record.mission.status === "paused" || busyAction === "pause_mission"}
                      >
                        <Pause size={15} aria-hidden="true" />
                        Pause
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-expanded={expanded}
                        onClick={() => setExpandedMissionId(expanded ? null : record.mission.id)}
                      >
                        <ListChecks size={15} aria-hidden="true" />
                        Details
                        {expanded ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
                      </Button>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <MiniMetric label="Tasks" value={record.tasks.length} />
                    <MiniMetric label="Policy events" value={record.policyEvents.length} />
                    <MiniMetric label="Simulations" value={record.simulations.length} />
                  </div>
                  <div className="mt-3">
                    <MiniMetric label="Updated" value={formatDate(record.mission.updatedAt)} />
                  </div>
                  {record.tasks.length > 0 ? (
                    <div className="mt-4 divide-y divide-[var(--color-border)] border-t border-[var(--color-border)]">
                      {record.tasks.slice(0, 4).map((task) => (
                        <div key={task.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                          <span className="min-w-0 truncate">{task.taskName}</span>
                          <Badge tone={statusTone[task.status]}>{task.status}</Badge>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {expanded ? <MissionAuditDetail record={record} /> : null}
                </article>
                );
              })}
            </div>
          )}
        </section>
      </section>

      <section id="simulations" className="grid scroll-mt-20 gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Simulation runs</h2>
          <Badge tone="neutral">{simulationRecords.length} recent</Badge>
        </div>
        {simulationRecords.length === 0 ? (
          <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white p-5 text-sm text-[var(--color-text-muted)]">
            Run a simulation to preview planned actions, policy outcomes, and estimated usage before execution.
          </div>
        ) : (
          <div className="grid gap-3">
            {simulationRecords.map(({ mission, simulation }) => {
              const summary = simulationSummary(simulation);

              return (
              <article key={simulation.id} className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{mission.title}</h3>
                      <Badge tone={statusTone[simulation.status]}>{simulation.status}</Badge>
                      <Badge tone={riskTone(summary.riskLevel)}>{summary.riskLevel} risk</Badge>
                      <Badge tone={summary.promotable ? "success" : "premium"}>
                        {summary.promotable ? "promotable" : "needs review"}
                      </Badge>
                    </div>
                    <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                      {formatDate(simulation.completedAt ?? simulation.createdAt)}
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-right text-xs sm:grid-cols-5">
                    <MiniMetric label="Actions" value={simulation.plannedActions.length} />
                    <MiniMetric label="Approvals" value={summary.approvalRequiredCount} />
                    <MiniMetric label="Blocked" value={summary.blockedReasonCount} />
                    <MiniMetric label="Suppressed" value={simulation.estimatedUsage.sideEffectsSuppressed} />
                    <MiniMetric label="Cost" value={formatCents(simulation.estimatedUsage.estimatedCostCents)} />
                  </div>
                </div>
                {simulation.error ? (
                  <div className="mt-4 rounded-[var(--radius-md)] border border-[var(--color-error)] bg-rose-50 p-3">
                    <p className="text-sm font-semibold text-[var(--color-error)]">Simulation error</p>
                    <p className="mt-1 text-sm leading-6 text-[var(--color-error)]">{simulation.error}</p>
                  </div>
                ) : null}
                {summary.providerReadinessWarnings.length > 0 ? (
                  <div className="mt-4 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 p-3">
                    <p className="text-sm font-semibold text-amber-800">Provider readiness warnings</p>
                    <ul className="mt-2 grid gap-1 text-xs leading-5 text-amber-800">
                      {summary.providerReadinessWarnings.slice(0, 3).map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <div className="mt-4 divide-y divide-[var(--color-border)] border-t border-[var(--color-border)]">
                  {simulation.plannedActions.length === 0 ? (
                    <div className="py-3 text-sm">
                      <p className="font-medium">No task actions planned</p>
                      <p className="mt-1 text-xs leading-5 text-[var(--color-text-muted)]">
                        {simulation.error
                          ? "The simulation stopped before task planning."
                          : missionPolicyMessage(simulation) ?? "Mission policy stopped before task planning."}
                      </p>
                    </div>
                  ) : null}
                  {simulation.plannedActions.slice(0, 4).map((action) => (
                    <div key={action.id} className="grid gap-3 py-3 text-sm md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{action.taskName}</p>
                        <p className="mt-1 text-xs text-[var(--color-text-muted)]">{action.action}</p>
                        <p className="mt-1 text-xs leading-5 text-[var(--color-text-muted)]">{action.policy.message}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 md:justify-end">
                        <Badge tone={plannedActionTone(action.status)}>{action.status.replaceAll("_", " ")}</Badge>
                        <Badge tone={riskTone(action.riskLevel)}>{action.riskLevel}</Badge>
                        <span className="text-xs text-[var(--color-text-muted)]">
                          {action.suppressedSideEffects.length} suppressed
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
              );
            })}
          </div>
        )}
      </section>

      <section id="activity" className="grid scroll-mt-20 gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Live activity</h2>
          <Badge tone="neutral">{activity.length} events</Badge>
        </div>
        <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white">
          {activity.length === 0 ? (
            <div className="p-5 text-sm text-[var(--color-text-muted)]">No agent activity has been recorded.</div>
          ) : (
            <div className="divide-y divide-[var(--color-border)]">
              {activity.map((event) => (
                <div key={event.id} className="grid gap-2 p-4 md:grid-cols-[1fr_auto_auto] md:items-center">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{event.label}</p>
                    <p className="mt-1 text-xs text-[var(--color-text-muted)]">{event.detail}</p>
                  </div>
                  <Badge
                    tone={
                      event.status === "blocked" || event.status === "failed"
                        ? "critical"
                        : event.status === "warning"
                          ? "premium"
                          : event.status === "succeeded" || event.status === "info"
                            ? "success"
                            : "neutral"
                    }
                  >
                    {event.status}
                  </Badge>
                  <span className="text-xs text-[var(--color-text-muted)]">{formatDate(event.at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function MissionAuditDetail({ record }: { record: MissionRecord }) {
  const latestSimulation = newestSimulation(record);
  const summary = latestSimulation ? simulationSummary(latestSimulation) : null;
  const failedTask = record.tasks.find((task) => task.status === "failed");
  const timeline = [
    {
      id: `${record.mission.id}_created`,
      label: "Mission created",
      status: record.mission.status,
      at: record.mission.createdAt
    },
    ...record.simulations.map((simulation) => ({
      id: simulation.id,
      label: simulation.status === "failed" ? "Simulation failed" : "Simulation completed",
      status: simulation.status,
      at: simulation.completedAt ?? simulation.createdAt
    })),
    ...record.tasks.map((task) => ({
      id: task.id,
      label: task.taskName,
      status: task.status,
      at: task.completedAt ?? task.startedAt ?? task.queuedAt
    })),
    ...record.policyEvents.map((event) => ({
      id: event.id,
      label: event.message,
      status: event.severity,
      at: event.occurredAt
    })),
    ...record.n8nEvents.map((event) => ({
      id: event.id,
      label: n8nLabel(event),
      status: event.status,
      at: event.occurredAt ?? event.createdAt
    }))
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 10);

  return (
    <div className="mt-4 grid gap-4 border-t border-[var(--color-border)] pt-4">
      {record.mission.error || failedTask ? (
        <section className="rounded-[var(--radius-md)] border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-800">Needs attention</p>
          <p className="mt-2 text-sm leading-6 text-red-800">
            {record.mission.error ?? failedTask?.error ?? "A mission task failed."}
          </p>
          <p className="mt-2 text-xs leading-5 text-red-800">
            Review the failed task, adjust inputs or policy, then rerun the mission when the blocker is cleared.
          </p>
        </section>
      ) : null}

      <div className="grid gap-3 md:grid-cols-4">
        <MiniMetric label="Risk" value={summary?.riskLevel ?? "No simulation"} />
        <MiniMetric label="Approvals" value={summary?.approvalRequiredCount ?? 0} />
        <MiniMetric label="Provider warnings" value={summary?.providerReadinessWarnings.length ?? 0} />
        <MiniMetric label="n8n events" value={record.n8nEvents.length} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-4">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-sm font-semibold">Simulation history</h4>
            <Badge tone="neutral">{record.simulations.length} runs</Badge>
          </div>
          {record.simulations.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--color-text-muted)]">No simulation has been recorded for this mission.</p>
          ) : (
            <div className="mt-3 divide-y divide-[var(--color-border)]">
              {record.simulations.slice(0, 4).map((simulation) => {
                const itemSummary = simulationSummary(simulation);

                return (
                  <div key={simulation.id} className="grid gap-2 py-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{formatDate(simulation.completedAt ?? simulation.createdAt)}</span>
                      <div className="flex flex-wrap gap-2">
                        <Badge tone={statusTone[simulation.status]}>{simulation.status}</Badge>
                        <Badge tone={riskTone(itemSummary.riskLevel)}>{itemSummary.riskLevel}</Badge>
                      </div>
                    </div>
                    <p className="text-xs leading-5 text-[var(--color-text-muted)]">
                      {simulation.plannedActions.length} actions, {itemSummary.approvalRequiredCount} approvals, {simulation.estimatedUsage.sideEffectsSuppressed} suppressed side effects.
                    </p>
                    {simulation.error ? <p className="text-xs leading-5 text-[var(--color-error)]">{simulation.error}</p> : null}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-4">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-sm font-semibold">Execution history</h4>
            <Badge tone="neutral">{record.tasks.length} tasks</Badge>
          </div>
          {record.tasks.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--color-text-muted)]">No task runs have been created by this mission.</p>
          ) : (
            <div className="mt-3 divide-y divide-[var(--color-border)]">
              {record.tasks.slice(0, 4).map((task) => (
                <div key={task.id} className="grid gap-2 py-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{task.taskName}</span>
                    <Badge tone={statusTone[task.status]}>{task.status}</Badge>
                  </div>
                  <p className="text-xs leading-5 text-[var(--color-text-muted)]">{summarizeTaskOutput(task)}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-4">
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-sm font-semibold">Policy decisions</h4>
          <Badge tone="neutral">{record.policyEvents.length} events</Badge>
        </div>
        {record.policyEvents.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--color-text-muted)]">No policy events have been recorded.</p>
        ) : (
          <div className="mt-3 grid gap-2">
            {record.policyEvents.slice(0, 5).map((event) => (
              <div key={event.id} className="grid gap-1 rounded-[var(--radius-sm)] bg-[var(--color-surface)] p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{event.policyKey}</span>
                  <Badge tone={event.severity === "blocked" ? "critical" : event.severity === "warning" ? "premium" : "success"}>
                    {event.action}
                  </Badge>
                </div>
                <p className="text-xs leading-5 text-[var(--color-text-muted)]">{event.message}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-4">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-sm font-semibold">n8n events</h4>
            <Badge tone="neutral">{record.n8nEvents.length} linked</Badge>
          </div>
          {record.n8nEvents.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--color-text-muted)]">No mission-linked n8n events are recorded.</p>
          ) : (
            <div className="mt-3 divide-y divide-[var(--color-border)]">
              {record.n8nEvents.map((event) => (
                <div key={event.id} className="grid gap-1 py-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{n8nLabel(event)}</span>
                    <Badge tone={event.status === "failed" ? "critical" : event.status === "delivered" ? "success" : "neutral"}>
                      {event.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-[var(--color-text-muted)]">{formatDate(event.occurredAt ?? event.createdAt)}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-4">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-sm font-semibold">Timeline</h4>
            <Badge tone="neutral">{timeline.length} items</Badge>
          </div>
          <div className="mt-3 divide-y divide-[var(--color-border)]">
            {timeline.map((event) => (
              <div key={event.id} className="grid gap-1 py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{event.label}</span>
                  <span className="text-xs text-[var(--color-text-muted)]">{event.status}</span>
                </div>
                <p className="text-xs text-[var(--color-text-muted)]">{formatDate(event.at)}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-surface)] text-[var(--color-primary)]">
          {icon}
        </span>
        <div>
          <p className="text-2xl font-semibold">{value}</p>
          <p className="text-sm text-[var(--color-text-muted)]">{label}</p>
        </div>
      </div>
    </section>
  );
}

function MiniMetric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-[var(--radius-md)] bg-[var(--color-surface)] px-3 py-2">
      <p className="text-xs text-[var(--color-text-muted)]">{label}</p>
      <p className={cn("mt-1 truncate text-sm font-semibold", typeof value === "number" ? "tabular-nums" : "")}>{value}</p>
    </div>
  );
}
