import { PlaceholderPage } from "@/components/layout/placeholder-page";

export default function BillingPage() {
  return (
    <PlaceholderPage
      title="Billing"
      description="Manage Free and Premium plans, usage limits, invoices, and seven-post-per-day automation capacity."
      phase="Phase 2"
      tabs={["Plan", "Usage", "Invoices", "Upgrade"]}
    />
  );
}
