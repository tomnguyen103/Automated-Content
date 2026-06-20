import { MediaLibrary } from "@/components/media/media-library";
import { PageShell } from "@/components/layout/page-shell";
import { SubNav } from "@/components/layout/sub-nav";

export default function MediaPage() {
  return (
    <>
      <SubNav
        items={["Library", "Uploads", "AI Transforms", "Platform Crops"].map((label, index) => ({
          label,
          active: index === 0
        }))}
      />
      <PageShell
        title="Media"
        description="Manage uploaded assets, ImageKit transformations, crops, and platform-ready media variants."
      >
        <MediaLibrary />
      </PageShell>
    </>
  );
}
