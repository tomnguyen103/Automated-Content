"use client";

import {
  Clapperboard,
  Download,
  FileText,
  RefreshCcw,
  Sparkles,
  Square,
  UserRound,
  WandSparkles
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import type { MediaGenerationJobKind, MediaGenerationJobRecord, MediaGenerationJobStatus } from "@/lib/jobs/types";

type MediaJobsResponse = {
  jobs: MediaGenerationJobRecord[];
};

type MediaJobResponse = {
  job: MediaGenerationJobRecord;
};

type WorkflowPreset = {
  kind: MediaGenerationJobKind;
  label: string;
  icon: LucideIcon;
  buildInput: (state: StudioState) => Record<string, unknown>;
};

type StudioState = {
  prompt: string;
  sourceUrl: string;
  transcriptText: string;
  script: string;
  consentAccepted: boolean;
};

const defaultState: StudioState = {
  prompt: "Founder-led product launch for content operators",
  sourceUrl: "https://media.local-preview.invalid/demo/source-video.mp4",
  transcriptText:
    "Start with the strongest claim. Show the before and after. Add one concrete proof point. End with a clear schedule-ready call to action.",
  script: "This consented synthetic video is ready for review before scheduling.",
  consentAccepted: false
};

const statusTone: Record<MediaGenerationJobStatus, "community" | "critical" | "neutral" | "premium" | "success"> = {
  canceled: "neutral",
  failed: "critical",
  queued: "premium",
  running: "community",
  succeeded: "success"
};

const presets: WorkflowPreset[] = [
  {
    kind: "media.generate-influencer-asset",
    label: "Influencer Asset",
    icon: WandSparkles,
    buildInput: (state) => ({
      prompt: state.prompt,
      topic: state.prompt,
      personaName: "Synthetic Founder"
    })
  },
  {
    kind: "media.transcribe-video",
    label: "Transcribe",
    icon: FileText,
    buildInput: (state) => ({
      sourceUrl: state.sourceUrl,
      transcriptText: state.transcriptText
    })
  },
  {
    kind: "media.detect-short-clips",
    label: "Score Clips",
    icon: Clapperboard,
    buildInput: (state) => ({
      sourceUrl: state.sourceUrl,
      transcriptText: state.transcriptText,
      targetDurationMs: 24_000
    })
  },
  {
    kind: "media.render-short-clip",
    label: "Render Clip",
    icon: Download,
    buildInput: (state) => ({
      sourceUrl: state.sourceUrl,
      transcriptText: state.transcriptText,
      cta: "Review and schedule this clip."
    })
  },
  {
    kind: "media.generate-avatar-video",
    label: "Avatar Video",
    icon: UserRound,
    buildInput: (state) => ({
      avatarName: "Consented Avatar",
      consentAccepted: state.consentAccepted,
      retentionDays: 30,
      script: state.script
    })
  }
];

function buildIdempotencyKey(kind: MediaGenerationJobKind) {
  const randomPart =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return `${kind}:${randomPart}`;
}

function parseError(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "error" in payload) {
    return String((payload as { error: unknown }).error);
  }

  return fallback;
}

function objectRecord(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function outputText(job: MediaGenerationJobRecord) {
  if (job.error) {
    return job.error;
  }

  if (job.status !== "succeeded") {
    return "Waiting for task output.";
  }

  const transcript = objectRecord(job.output.transcript);
  if (transcript) {
    return typeof transcript.text === "string" ? transcript.text : "Transcript stored.";
  }

  if (Array.isArray(job.output.clipCandidates)) {
    const clips = job.output.clipCandidates as Array<{ title?: unknown; score?: unknown }>;
    return clips.map((clip) => `${clip.title ?? "Clip"} (${clip.score ?? "n/a"})`).join(" | ");
  }

  const clip = objectRecord(job.output.renderedClip);
  if (clip) {
    return typeof clip.url === "string" ? clip.url : "Rendered clip stored.";
  }

  const asset = objectRecord(job.output.influencerAsset);
  if (asset) {
    return `${asset.personaName ?? "Influencer asset"}: ${asset.url ?? "stored"}`;
  }

  const video = objectRecord(job.output.avatarVideo);
  if (video) {
    return typeof video.url === "string" ? video.url : "Avatar video stored.";
  }

  return "Workflow output stored.";
}

function renderedDownloadUrl(job: MediaGenerationJobRecord) {
  const clip = objectRecord(job.output.renderedClip);
  const avatar = objectRecord(job.output.avatarVideo);
  const downloadUrl = clip?.downloadUrl ?? avatar?.downloadUrl;

  return typeof downloadUrl === "string" ? downloadUrl : null;
}

export function MediaWorkflowStudio() {
  const [state, setState] = useState(defaultState);
  const [jobs, setJobs] = useState<MediaGenerationJobRecord[]>([]);
  const [busyKind, setBusyKind] = useState<MediaGenerationJobKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const latestJobs = useMemo(() => jobs.slice(0, 5), [jobs]);

  async function fetchJobs() {
    const response = await fetch("/api/media/jobs");
    const payload = (await response.json()) as unknown;

    if (!response.ok) {
      throw new Error(parseError(payload, "Media jobs failed to load."));
    }

    return (payload as MediaJobsResponse).jobs ?? [];
  }

  async function loadJobs() {
    setJobs(await fetchJobs());
  }

  useEffect(() => {
    let cancelled = false;

    const loadInitialJobs = async () => {
      try {
        const fetchedJobs = await fetchJobs();

        if (!cancelled) {
          setJobs(fetchedJobs);
        }
      } catch (caughtError) {
        if (!cancelled) {
          setError(caughtError instanceof Error ? caughtError.message : "Media jobs failed to load.");
        }
      }
    };

    void loadInitialJobs();

    return () => {
      cancelled = true;
    };
  }, []);

  async function createJob(preset: WorkflowPreset) {
    setBusyKind(preset.kind);
    setError(null);

    try {
      const response = await fetch("/api/media/jobs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          kind: preset.kind,
          idempotencyKey: buildIdempotencyKey(preset.kind),
          input: preset.buildInput(state)
        })
      });
      const payload = (await response.json()) as unknown;

      if (!response.ok) {
        throw new Error(parseError(payload, "Media job creation failed."));
      }

      const job = (payload as MediaJobResponse).job;
      setJobs((current) => [job, ...current.filter((candidate) => candidate.id !== job.id)]);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Media job creation failed.");
    } finally {
      setBusyKind(null);
    }
  }

  async function updateJob(job: MediaGenerationJobRecord, action: "cancel" | "retry") {
    setError(null);

    try {
      const response = await fetch(`/api/media/jobs/${job.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ action })
      });
      const payload = (await response.json()) as unknown;

      if (!response.ok) {
        throw new Error(parseError(payload, "Media job update failed."));
      }

      const updatedJob = (payload as MediaJobResponse).job;
      setJobs((current) => current.map((candidate) => (candidate.id === updatedJob.id ? updatedJob : candidate)));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Media job update failed.");
    }
  }

  return (
    <section id="studio" className="scroll-mt-20 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-white p-5">
      <div className="flex flex-col gap-4 border-b border-[var(--color-border)] pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] bg-rose-50 text-[var(--color-primary)]">
            <Sparkles size={18} aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-base font-semibold">AI studio</h2>
            <p className="mt-1 max-w-2xl text-sm text-[var(--color-text-muted)]">
              Generate assets, captions, clips, and consented avatar videos through the V2 job backbone.
            </p>
          </div>
        </div>
        <button
          type="button"
          className="inline-flex h-9 items-center justify-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 text-sm font-semibold transition hover:border-[var(--color-primary)] active:translate-y-px"
          onClick={() => void loadJobs()}
        >
          <RefreshCcw size={15} aria-hidden="true" />
          Refresh
        </button>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="grid gap-4">
          <label className="grid gap-2 text-sm font-medium" htmlFor="studio-prompt">
            Campaign prompt
            <input
              id="studio-prompt"
              className="h-10 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 text-sm font-normal outline-none transition focus:border-[var(--color-primary)]"
              value={state.prompt}
              onChange={(event) => setState((current) => ({ ...current, prompt: event.target.value }))}
            />
          </label>
          <label className="grid gap-2 text-sm font-medium" htmlFor="studio-source-url">
            Source video URL
            <input
              id="studio-source-url"
              className="h-10 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 text-sm font-normal outline-none transition focus:border-[var(--color-primary)]"
              value={state.sourceUrl}
              onChange={(event) => setState((current) => ({ ...current, sourceUrl: event.target.value }))}
            />
          </label>
          <label className="grid gap-2 text-sm font-medium" htmlFor="studio-transcript">
            Transcript seed
            <textarea
              id="studio-transcript"
              className="min-h-24 rounded-[var(--radius-md)] border border-[var(--color-border)] p-3 text-sm font-normal outline-none transition focus:border-[var(--color-primary)]"
              value={state.transcriptText}
              onChange={(event) => setState((current) => ({ ...current, transcriptText: event.target.value }))}
            />
          </label>
          <label className="grid gap-2 text-sm font-medium" htmlFor="studio-script">
            Avatar script
            <textarea
              id="studio-script"
              className="min-h-20 rounded-[var(--radius-md)] border border-[var(--color-border)] p-3 text-sm font-normal outline-none transition focus:border-[var(--color-primary)]"
              value={state.script}
              onChange={(event) => setState((current) => ({ ...current, script: event.target.value }))}
            />
          </label>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-[var(--color-border)]"
              checked={state.consentAccepted}
              onChange={(event) => setState((current) => ({ ...current, consentAccepted: event.target.checked }))}
            />
            Consent accepted for avatar and voice generation
          </label>

          {error ? (
            <div className="rounded-[var(--radius-md)] border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {presets.map((preset) => {
              const Icon = preset.icon;
              const busy = busyKind === preset.kind;

              return (
                <button
                  key={preset.kind}
                  type="button"
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-text)] px-3 text-sm font-semibold text-white transition hover:bg-[var(--color-primary)] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={busyKind !== null}
                  onClick={() => void createJob(preset)}
                >
                  <Icon size={15} aria-hidden="true" />
                  {busy ? "Starting" : preset.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid content-start gap-3">
          {latestJobs.length === 0 ? (
            <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm text-[var(--color-text-muted)]">
              No media jobs yet.
            </div>
          ) : (
            latestJobs.map((job) => {
              const downloadUrl = renderedDownloadUrl(job);

              return (
                <article key={job.id} className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="text-sm font-semibold">{job.jobKind}</h3>
                      <p className="mt-1 font-mono text-xs text-[var(--color-text-muted)]">{job.id}</p>
                    </div>
                    <Badge tone={statusTone[job.status]}>{job.status}</Badge>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--color-surface)]">
                    <div
                      className="h-full rounded-full bg-[var(--color-primary)]"
                      style={{ width: `${Math.max(0, Math.min(100, job.progress))}%` }}
                    />
                  </div>
                  <p className="mt-3 max-h-16 overflow-hidden break-words text-sm text-[var(--color-text-muted)]">
                    {outputText(job)}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {downloadUrl ? (
                      <a
                        className="inline-flex h-8 items-center justify-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 text-xs font-semibold transition hover:border-[var(--color-primary)]"
                        href={downloadUrl}
                      >
                        <Download size={14} aria-hidden="true" />
                        Download
                      </a>
                    ) : null}
                    {job.status === "queued" || job.status === "running" ? (
                      <button
                        type="button"
                        className="inline-flex h-8 items-center justify-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 text-xs font-semibold transition hover:border-[var(--color-primary)]"
                        onClick={() => void updateJob(job, "cancel")}
                      >
                        <Square size={12} aria-hidden="true" />
                        Cancel
                      </button>
                    ) : null}
                    {job.status === "failed" || job.status === "canceled" ? (
                      <button
                        type="button"
                        className="inline-flex h-8 items-center justify-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 text-xs font-semibold transition hover:border-[var(--color-primary)]"
                        onClick={() => void updateJob(job, "retry")}
                      >
                        <RefreshCcw size={14} aria-hidden="true" />
                        Retry
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}
