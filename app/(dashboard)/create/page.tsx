import { BriefForm } from "@/components/create/brief-form";
import { PageShell } from "@/components/layout/page-shell";
import { SubNav } from "@/components/layout/sub-nav";

export default function CreatePage() {
  return (
    <>
      <SubNav
        items={["Brief", "Research", "Drafts", "Variants", "Media", "Schedule", "Review"].map((label, index) => ({
          label,
          active: index === 0
        }))}
      />
      <PageShell
        title="Create"
        description="Turn a topic, source, or campaign goal into a structured AI content pack with platform-specific variants."
      >
        <BriefForm />
      </PageShell>
    </>
  );
}
