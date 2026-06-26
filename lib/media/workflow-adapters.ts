import "server-only";

import { createHash } from "node:crypto";
import type { MediaGenerationJobKind } from "@/lib/jobs/types";

export type TranscriptSegment = {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
};

export type CaptionTrack = {
  id: string;
  format: "srt" | "vtt";
  language: string;
  text: string;
};

export type ClipCandidate = {
  id: string;
  title: string;
  startMs: number;
  endMs: number;
  score: number;
  reason: string;
  caption: string;
};

export type RenderedClip = {
  artifactManifestUrl: string;
  id: string;
  clipCandidateId: string;
  format: "mp4";
  height: number;
  status: "succeeded";
  syntheticMediaLabel: string;
  url: string;
  width: number;
};

export type GeneratedInfluencerAsset = {
  artifactManifestUrl: string;
  id: string;
  assetType: "synthetic_influencer";
  mediaType: "image" | "video";
  prompt: string;
  personaName: string;
  provider: "mock";
  syntheticMediaLabel: string;
  url: string;
};

export type ConsentRecord = {
  accepted: true;
  acceptedAt: string;
  consentText: string;
  retentionDays: number;
};

export type GeneratedAvatarVideo = {
  artifactManifestUrl: string;
  id: string;
  avatarAssetId: string;
  provider: "mock";
  syntheticMediaLabel: string;
  url: string;
  voiceAssetId: string;
};

export type MediaWorkflowProviderAdapter = {
  mode: "deterministic-mock";
  transcribeVideo: (input: WorkflowInput) => Promise<{
    captions: CaptionTrack[];
    sourceVideo: SourceVideoDescriptor;
    transcript: {
      id: string;
      language: string;
      segments: TranscriptSegment[];
      text: string;
    };
  }>;
  detectShortClips: (input: WorkflowInput) => Promise<{
    clipCandidates: ClipCandidate[];
    transcript: string;
  }>;
  renderShortClip: (input: WorkflowInput) => Promise<{
    renderedClip: RenderedClip;
    scheduleHandoff: ScheduleHandoff;
  }>;
  generateInfluencerAsset: (input: WorkflowInput) => Promise<{
    influencerAsset: GeneratedInfluencerAsset;
    reviewHandoff: ReviewHandoff;
  }>;
  generateAvatarVideo: (input: WorkflowInput) => Promise<{
    avatarVideo: GeneratedAvatarVideo;
    consentRecord: ConsentRecord;
    retentionPolicy: {
      deleteSourceSamplesAfterDays: number;
      sourceSamplesRetained: boolean;
    };
    reviewHandoff: ReviewHandoff;
  }>;
};

export type WorkflowInput = {
  input: Record<string, unknown>;
  jobId: string;
  jobKind: MediaGenerationJobKind;
  sourceAssetId?: string;
  workspaceId: string;
};

type SourceVideoDescriptor = {
  assetId?: string;
  url: string;
};

type ReviewHandoff = {
  contentPack: {
    captions: string[];
    media: Array<{
      altText: string;
      assetId: string;
      mediaType: "image" | "video";
      name: string;
      provider: "mock";
      url: string;
    }>;
    title: string;
  };
  target: "review";
};

type ScheduleHandoff = {
  target: "schedule";
  platformVariant: {
    body: string;
    media: Array<{
      assetId: string;
      mediaType: "video";
      name: string;
      provider: "mock";
      url: string;
    }>;
    platform: "linkedin";
    title: string;
  };
};

export class MediaWorkflowInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MediaWorkflowInputError";
  }
}

function stableId(prefix: string, values: Array<string | undefined>) {
  const hash = createHash("sha256")
    .update(values.filter(Boolean).join(":"))
    .digest("hex")
    .slice(0, 16);

  return `${prefix}_${hash}`;
}

function stringInput(input: Record<string, unknown>, key: string) {
  const value = input[key];

  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function numberInput(input: Record<string, unknown>, key: string) {
  const value = input[key];

  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function booleanInput(input: Record<string, unknown>, key: string) {
  return input[key] === true;
}

function sourceVideo(input: WorkflowInput): SourceVideoDescriptor {
  const url =
    stringInput(input.input, "sourceUrl") ??
    stringInput(input.input, "publicUrl") ??
    `https://media.local-preview.invalid/workspaces/${encodeURIComponent(input.workspaceId)}/source/${encodeURIComponent(input.sourceAssetId ?? input.jobId)}.mp4`;

  return {
    assetId: input.sourceAssetId,
    url
  };
}

function sentenceParts(value: string) {
  const parts = value
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  return parts.length > 0 ? parts : [value];
}

function transcriptText(input: WorkflowInput) {
  const provided = stringInput(input.input, "transcriptText");

  if (provided) {
    return provided;
  }

  const topic = stringInput(input.input, "topic") ?? stringInput(input.input, "title") ?? "the campaign";

  return [
    `Open with the strongest hook for ${topic}.`,
    "Show the transformation clearly in the first few seconds.",
    "Use one concise proof point before the final call to action.",
    "End with a direct next step that can become a scheduled post."
  ].join(" ");
}

function createTranscriptSegments(text: string): TranscriptSegment[] {
  return sentenceParts(text).slice(0, 8).map((segment, index) => ({
    id: `segment_${index + 1}`,
    startMs: index * 4_500,
    endMs: index * 4_500 + Math.max(3_000, Math.min(7_500, segment.length * 80)),
    text: segment
  }));
}

function formatSrt(segments: TranscriptSegment[]) {
  function ts(milliseconds: number) {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const ms = milliseconds % 1000;

    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
  }

  return segments
    .map((segment, index) => `${index + 1}\n${ts(segment.startMs)} --> ${ts(segment.endMs)}\n${segment.text}`)
    .join("\n\n");
}

function artifactUrl(input: WorkflowInput, suffix: string) {
  const base = stringInput(input.input, "artifactBaseUrl") ?? "/api/media/artifacts";

  return `${base.replace(/\/+$/, "")}/${encodeURIComponent(input.workspaceId)}/${encodeURIComponent(input.jobId)}/${suffix}`;
}

function toClipCandidates(input: WorkflowInput, text: string): ClipCandidate[] {
  const segments = createTranscriptSegments(text);
  const targetDurationMs = Math.max(8_000, Math.min(60_000, numberInput(input.input, "targetDurationMs") ?? 24_000));
  const candidates = segments.slice(0, 3).map((segment, index) => {
    const id = stableId("clip", [input.jobId, segment.id, String(index)]);
    const endMs = Math.min(segment.startMs + targetDurationMs, segment.endMs + 12_000);

    return {
      id,
      title: `Short ${index + 1}: ${segment.text.replace(/[.!?]+$/, "").slice(0, 54)}`,
      startMs: segment.startMs,
      endMs,
      score: 92 - index * 7,
      reason:
        index === 0
          ? "Strong opening hook and clear setup."
          : index === 1
            ? "Contains a concise proof point for social preview."
            : "Works as a direct call-to-action clip.",
      caption: segment.text
    };
  });

  return candidates.length > 0 ? candidates : [
    {
      id: stableId("clip", [input.jobId, "fallback"]),
      title: "Short 1: Campaign hook",
      startMs: 0,
      endMs: targetDurationMs,
      score: 80,
      reason: "Fallback candidate created from the source prompt.",
      caption: text
    }
  ];
}

function clipFromInput(input: WorkflowInput): ClipCandidate {
  const clipInput = input.input.clipCandidate;

  if (clipInput && typeof clipInput === "object") {
    const candidate = clipInput as Record<string, unknown>;

    return {
      id: typeof candidate.id === "string" ? candidate.id : stableId("clip", [input.jobId, "provided"]),
      title: typeof candidate.title === "string" ? candidate.title : "Rendered short clip",
      startMs: typeof candidate.startMs === "number" ? candidate.startMs : 0,
      endMs: typeof candidate.endMs === "number" ? candidate.endMs : 30_000,
      score: typeof candidate.score === "number" ? candidate.score : 85,
      reason: typeof candidate.reason === "string" ? candidate.reason : "Selected clip candidate.",
      caption: typeof candidate.caption === "string" ? candidate.caption : "Captioned short clip."
    };
  }

  return toClipCandidates(input, transcriptText(input))[0]!;
}

export const deterministicMediaWorkflowAdapter: MediaWorkflowProviderAdapter = {
  mode: "deterministic-mock",
  async transcribeVideo(input) {
    const text = transcriptText(input);
    const segments = createTranscriptSegments(text);
    const id = stableId("transcript", [input.jobId, input.sourceAssetId, text]);

    return {
      sourceVideo: sourceVideo(input),
      transcript: {
        id,
        language: stringInput(input.input, "language") ?? "en",
        segments,
        text
      },
      captions: [
        {
          id: stableId("captions", [id, "srt"]),
          format: "srt",
          language: stringInput(input.input, "language") ?? "en",
          text: formatSrt(segments)
        }
      ]
    };
  },
  async detectShortClips(input) {
    const text = transcriptText(input);

    return {
      transcript: text,
      clipCandidates: toClipCandidates(input, text)
    };
  },
  async renderShortClip(input) {
    const clip = clipFromInput(input);
    const renderedClip: RenderedClip = {
      id: stableId("render", [input.jobId, clip.id]),
      clipCandidateId: clip.id,
      artifactManifestUrl: artifactUrl(input, `${clip.id}.json?download=1`),
      format: "mp4",
      height: 1920,
      status: "succeeded",
      syntheticMediaLabel: "Edited from user-provided source video with AI-selected captions.",
      url: artifactUrl(input, `${clip.id}.json`),
      width: 1080
    };

    return {
      renderedClip,
      scheduleHandoff: {
        target: "schedule",
        platformVariant: {
          body: `${clip.caption}\n\n${stringInput(input.input, "cta") ?? "Schedule this clip for review."}`,
          media: [
            {
              assetId: renderedClip.id,
              mediaType: "video",
              name: clip.title,
              provider: "mock",
              url: renderedClip.url
            }
          ],
          platform: "linkedin",
          title: clip.title
        }
      }
    };
  },
  async generateInfluencerAsset(input) {
    const personaName = stringInput(input.input, "personaName") ?? "Synthetic Founder";
    const prompt =
      stringInput(input.input, "prompt") ??
      `Create a synthetic creator asset for ${stringInput(input.input, "topic") ?? "the campaign"}.`;
    const id = stableId("influencer", [input.jobId, personaName, prompt]);
    const url = artifactUrl(input, `${id}.json`);

    return {
      influencerAsset: {
        id,
        artifactManifestUrl: `${url}?download=1`,
        assetType: "synthetic_influencer",
        mediaType: "image",
        personaName,
        prompt,
        provider: "mock",
        syntheticMediaLabel: "AI-generated synthetic influencer asset.",
        url
      },
      reviewHandoff: {
        target: "review",
        contentPack: {
          title: `${personaName} campaign asset`,
          captions: [
            stringInput(input.input, "caption") ??
              `${personaName} introduces ${stringInput(input.input, "topic") ?? "the launch"} with a reviewed, synthetic-media label.`
          ],
          media: [
            {
              altText: `Synthetic influencer asset for ${personaName}`,
              assetId: id,
              mediaType: "image",
              name: `${personaName} asset`,
              provider: "mock",
              url
            }
          ]
        }
      }
    };
  },
  async generateAvatarVideo(input) {
    const accepted = booleanInput(input.input, "consentAccepted");

    if (!accepted) {
      throw new MediaWorkflowInputError("Avatar and voice video generation requires explicit consentAccepted=true.");
    }

    const avatarName = stringInput(input.input, "avatarName") ?? "Consented Avatar";
    const script = stringInput(input.input, "script") ?? "This reviewed avatar video is ready for scheduling.";
    const retentionDays = Math.max(1, Math.min(365, Math.floor(numberInput(input.input, "retentionDays") ?? 30)));
    const avatarAssetId = stableId("avatar", [input.jobId, avatarName]);
    const voiceAssetId = stableId("voice", [input.jobId, script]);
    const id = stableId("talking_video", [input.jobId, avatarAssetId, voiceAssetId]);
    const url = artifactUrl(input, `${id}.json`);

    return {
      consentRecord: {
        accepted: true,
        acceptedAt: new Date().toISOString(),
        consentText:
          stringInput(input.input, "consentText") ??
          "User confirmed they have rights to use the provided face and voice samples.",
        retentionDays
      },
      retentionPolicy: {
        deleteSourceSamplesAfterDays: retentionDays,
        sourceSamplesRetained: retentionDays > 0
      },
      avatarVideo: {
        id,
        artifactManifestUrl: `${url}?download=1`,
        avatarAssetId,
        provider: "mock",
        syntheticMediaLabel: "AI-generated avatar and voice video.",
        url,
        voiceAssetId
      },
      reviewHandoff: {
        target: "review",
        contentPack: {
          title: `${avatarName} talking video`,
          captions: [script],
          media: [
            {
              altText: `Synthetic talking video for ${avatarName}`,
              assetId: id,
              mediaType: "video",
              name: `${avatarName} talking video`,
              provider: "mock",
              url
            }
          ]
        }
      }
    };
  }
};

export function getMediaWorkflowProviderAdapter() {
  return deterministicMediaWorkflowAdapter;
}
