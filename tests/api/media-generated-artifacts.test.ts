import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

function routeContext({
  asset,
  jobId,
  workspaceId
}: {
  asset: string;
  jobId: string;
  workspaceId: string;
}) {
  return {
    params: Promise.resolve({
      asset,
      jobId,
      workspaceId
    })
  };
}

describe("generated media artifacts API", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("AUTH_LOCAL_PREVIEW", "1");
    vi.stubEnv("PLAYWRIGHT_AUTH_LOCAL_PREVIEW", "1");
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "");
    vi.stubEnv("CLERK_SECRET_KEY", "");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("TRIGGER_SECRET_KEY", "");
  });

  it("serves deterministic workflow artifact manifests for completed local jobs", async () => {
    const [{ GET }, mediaJobs, { executeMediaGenerationWorkflow }, { localPreviewWorkspaceId }] = await Promise.all([
      import("@/app/api/media/artifacts/[workspaceId]/[jobId]/[asset]/route"),
      import("@/lib/jobs/media"),
      import("@/lib/jobs/media-workflows"),
      import("@/lib/workspaces/personal-workspace")
    ]);
    mediaJobs.clearMediaGenerationJobsForTests();
    const { job } = await mediaJobs.createMediaGenerationJobForWorkspace({
      allowMemoryFallback: true,
      createdByUserId: "local_user",
      input: {
        transcriptText: "Hook first. Proof second.",
        sourceUrl: "https://media.local-preview.invalid/source.mp4"
      },
      jobKind: "media.render-short-clip",
      workspaceId: localPreviewWorkspaceId
    });

    const result = await executeMediaGenerationWorkflow({
      allowMemoryFallback: true,
      payload: {
        input: job.input,
        jobId: job.id,
        workspaceId: job.workspaceId
      }
    });
    const renderedClip = result.job.output.renderedClip as { artifactManifestUrl: string; url: string };

    expect(renderedClip.url).toContain(`/api/media/artifacts/${localPreviewWorkspaceId}/${job.id}/`);
    expect(renderedClip.url).toContain(".json");
    expect(renderedClip.artifactManifestUrl).toContain("?download=1");

    const manifestUrl = new URL(renderedClip.artifactManifestUrl, "http://localhost:3000");
    const response = await GET(
      new NextRequest(manifestUrl.toString()),
      routeContext({
        asset: manifestUrl.pathname.split("/").at(-1)!,
        jobId: job.id,
        workspaceId: job.workspaceId
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(response.headers.get("Content-Disposition")).toContain("attachment;");
    expect(payload.artifact).toMatchObject({
      jobId: job.id,
      jobKind: "media.render-short-clip",
      syntheticMediaLabel: "Edited from user-provided source video with AI-selected captions.",
      workspaceId: localPreviewWorkspaceId
    });
  });
});
