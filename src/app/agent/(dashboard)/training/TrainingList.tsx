"use client";

import { useState } from "react";
import { groupTrainingMaterialsByCategory, type CrmTrainingMaterialRow } from "@/lib/crm-types";

export default function TrainingList({ materials }: { materials: CrmTrainingMaterialRow[] }) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function copyContent(material: CrmTrainingMaterialRow) {
    try {
      await navigator.clipboard.writeText(material.content);
      setCopiedId(material.id);
      setTimeout(() => setCopiedId((current) => (current === material.id ? null : current)), 2000);
    } catch {
      // Clipboard access can fail (permissions, insecure context); the
      // script text is already visible on the page, so there's nothing
      // further to do here.
    }
  }

  const groups = groupTrainingMaterialsByCategory(materials);

  return (
    <div className="space-y-8">
      {groups.map(({ category, materials: groupMaterials }) => (
        <div key={category}>
          {groups.length > 1 && (
            <h2 className="mb-3 font-heading text-[15px] font-bold text-[var(--color-ink-strong)]">
              {category}
            </h2>
          )}
          <div className="space-y-4">
            {groupMaterials.map((material) => (
              <div
                key={material.id}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-input-bg)] p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <h3 className="font-heading text-base font-bold text-[var(--color-ink-strong)]">
                    {material.title}
                  </h3>
                  <button
                    type="button"
                    onClick={() => copyContent(material)}
                    className="shrink-0 rounded-full border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold text-[var(--color-ink)] transition hover:border-[var(--color-accent)]"
                  >
                    {copiedId === material.id ? "Copied!" : "Copy"}
                  </button>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm text-[var(--color-text-muted)]">
                  {material.content}
                </p>
                {material.link_url && (
                  <a
                    href={material.link_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 block w-full rounded-full bg-[var(--color-accent)] px-4 py-2.5 text-center text-sm font-semibold text-white transition hover:opacity-90 sm:inline-block sm:w-auto"
                  >
                    {material.link_label || "Open Link"}
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {materials.length === 0 && (
        <p className="rounded-xl border border-[var(--color-border)] bg-[var(--color-input-bg)] px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">
          No training materials yet.
        </p>
      )}
    </div>
  );
}
