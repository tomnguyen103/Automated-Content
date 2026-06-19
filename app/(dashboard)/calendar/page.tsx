import { PlaceholderPage } from "@/components/layout/placeholder-page";

export default function CalendarPage() {
  return (
    <PlaceholderPage
      title="Calendar"
      description="Review scheduled posts, queue state, failed publishes, and drafts in a calendar-first workspace."
      phase="Phase 6"
      tabs={["Calendar", "Queue", "Published", "Failed", "Drafts"]}
    />
  );
}
