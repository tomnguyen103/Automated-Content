import { PlaceholderPage } from "@/components/layout/placeholder-page";

export default function ConnectionsPage() {
  return (
    <PlaceholderPage
      title="Connections"
      description="Connect official provider APIs and inspect platform capabilities, health, and webhook readiness."
      phase="Phase 6"
      tabs={["Social", "Messaging", "Webhooks", "Health"]}
    />
  );
}
