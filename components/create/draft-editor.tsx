"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import type { ContentPack } from "@/lib/agents/schemas/content-pack";

type DraftEditorProps = {
  contentPack: ContentPack | null;
};

export function DraftEditor({ contentPack }: DraftEditorProps) {
  if (!contentPack) {
    return (
      <section className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] bg-white p-5">
        <h2 className="text-base font-semibold">Draft</h2>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">Generated copy will appear here.</p>
      </section>
    );
  }

  return <EditableDraft key={contentPack.id} contentPack={contentPack} />;
}

function EditableDraft({ contentPack }: { contentPack: ContentPack }) {
  const [caption, setCaption] = useState(contentPack.captions[0] ?? "");

  return (
    <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-white p-5">
      <div className="flex flex-col gap-3 border-b border-[var(--color-border)] pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">Draft</h2>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">{contentPack.summary}</p>
        </div>
        <Badge tone={contentPack.warnings.length > 0 ? "premium" : "success"}>
          {contentPack.warnings.length > 0 ? `${contentPack.warnings.length} warnings` : "Clean"}
        </Badge>
      </div>

      <label className="mt-4 block text-sm font-medium" htmlFor="primary-caption">
        Primary caption
      </label>
      <textarea
        id="primary-caption"
        className="mt-2 min-h-36 w-full resize-y rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white px-3 py-2 text-sm leading-6 outline-none transition focus:border-[var(--color-primary)]"
        value={caption}
        onChange={(event) => setCaption(event.target.value)}
      />

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold">CTA options</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {contentPack.ctaOptions.map((cta) => (
              <Badge key={cta} tone="neutral">
                {cta}
              </Badge>
            ))}
          </div>
        </div>
        <div>
          <h3 className="text-sm font-semibold">Hashtags</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {contentPack.hashtags.map((tag) => (
              <Badge key={tag} tone="community">
                {tag}
              </Badge>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
