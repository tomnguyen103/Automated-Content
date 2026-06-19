import { PlaceholderPage } from "@/components/layout/placeholder-page";

export default function MediaPage() {
  return (
    <PlaceholderPage
      title="Media"
      description="Manage uploaded assets, ImageKit transformations, crops, and platform-ready media variants."
      phase="Phase 5"
      tabs={["Library", "Uploads", "AI Transforms", "Platform Crops"]}
    />
  );
}
