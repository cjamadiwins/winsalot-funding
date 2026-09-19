"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Trash2 } from "lucide-react";

export default function DeleteDraftButton({
  segmentId,
  listHref,
  deleteAction,
}: {
  segmentId: string;
  listHref: string;
  deleteAction: (segmentId: string) => Promise<{ error?: string } | void>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (!confirm("Delete this Draft segment and all its uploaded rows? This cannot be undone.")) return;
    startTransition(async () => {
      const result = await deleteAction(segmentId);
      if (result?.error) {
        alert(result.error);
        return;
      }
      router.push(listHref);
    });
  }

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={handleClick}
      className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 px-3 py-1.5 text-[12.5px] font-medium text-rose-700 hover:border-rose-400 disabled:opacity-50"
    >
      <Trash2 className="h-3.5 w-3.5" /> {isPending ? "Deleting…" : "Delete Draft"}
    </button>
  );
}
