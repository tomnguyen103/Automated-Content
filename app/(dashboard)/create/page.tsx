import { PlaceholderPage } from "@/components/layout/placeholder-page";

export default function CreatePage() {
  return (
    <PlaceholderPage
      title="Create"
      description="Turn a topic, source, or campaign goal into a structured AI content pack with platform-specific variants."
      phase="Phase 3"
      tabs={["Brief", "Research", "Drafts", "Variants", "Media", "Schedule", "Review"]}
    />
  );
}
