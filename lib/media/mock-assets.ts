import type { MediaAsset, MediaAttachment } from "@/lib/media/types";

function svgPreview(label: string, background: string, foreground: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 900"><rect width="1200" height="900" fill="${background}"/><circle cx="260" cy="250" r="120" fill="${foreground}" opacity=".22"/><rect x="150" y="560" width="900" height="70" rx="18" fill="${foreground}" opacity=".34"/><rect x="150" y="670" width="620" height="46" rx="16" fill="${foreground}" opacity=".26"/><text x="150" y="470" fill="${foreground}" font-family="Arial, sans-serif" font-size="74" font-weight="700">${label}</text></svg>`;

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export const mockMediaAssets: MediaAsset[] = [
  {
    id: "media_launch_board",
    workspaceId: "mock-workspace",
    uploadedByUserId: "mock-user",
    provider: "mock",
    name: "Launch board",
    fileName: "launch-board.png",
    url: svgPreview("Launch board", "#fdf2f8", "#be123c"),
    thumbnailUrl: svgPreview("Launch board", "#fdf2f8", "#be123c"),
    mediaType: "image",
    mimeType: "image/png",
    width: 1200,
    height: 900,
    sizeBytes: 486_000,
    tags: ["campaign", "launch"],
    transformationDefaults: {
      crop: "maintain_ratio",
      focus: "auto",
      format: "auto",
      quality: 82
    },
    createdAt: "2026-06-20T12:00:00.000Z"
  },
  {
    id: "media_workflow_clip",
    workspaceId: "mock-workspace",
    uploadedByUserId: "mock-user",
    provider: "mock",
    name: "Workflow clip",
    fileName: "workflow-clip.mp4",
    url: "https://ik.imagekit.io/local-preview/workflow-clip.mp4",
    thumbnailUrl: svgPreview("Workflow clip", "#ecfeff", "#0f766e"),
    mediaType: "video",
    mimeType: "video/mp4",
    width: 1080,
    height: 1920,
    sizeBytes: 18_400_000,
    tags: ["short-form", "workflow"],
    transformationDefaults: {
      crop: "maintain_ratio",
      focus: "auto",
      format: "auto",
      quality: 82
    },
    createdAt: "2026-06-20T12:05:00.000Z"
  }
];

export function createMediaAttachment(asset: MediaAsset): MediaAttachment {
  return {
    assetId: asset.id,
    provider: asset.provider,
    name: asset.name,
    url: asset.url,
    thumbnailUrl: asset.thumbnailUrl,
    mediaType: asset.mediaType,
    mimeType: asset.mimeType,
    width: asset.width,
    height: asset.height,
    sizeBytes: asset.sizeBytes,
    altText: asset.altText
  };
}
