import { PlaceholderPage } from "@/components/layout/placeholder-page";

export default function SettingsPage() {
  return (
    <PlaceholderPage
      title="Settings"
      description="Configure workspace defaults, brand voice, safety settings, and automation preferences."
      phase="Phase 2"
      tabs={["Workspace", "Brand Voice", "Safety", "Automation"]}
    />
  );
}
