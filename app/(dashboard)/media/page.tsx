import { MediaLibrary } from "@/components/media/media-library";
import { PageShell } from "@/components/layout/page-shell";
import { SubNav } from "@/components/layout/sub-nav";

export default function MediaPage() {
  return (
    <>
      <SubNav
        items={[
          { label: "Library", href: "#library", active: true },
          { label: "Uploads", href: "#uploads" },
          { label: "AI Transforms", href: "#transforms" },
          { label: "Platform Crops", href: "#transforms" }
        ]}
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
