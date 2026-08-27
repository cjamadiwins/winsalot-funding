"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveAgreementTemplateAction } from "./actions";

export default function ApproveTemplateButton({ templateId }: { templateId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        if (!confirm("Approve this agreement template's final wording? New agreements will use it immediately.")) return;
        startTransition(async () => {
          await approveAgreementTemplateAction(templateId);
          router.refresh();
        });
      }}
      className="mt-2 rounded-full bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isPending ? "Approving…" : "Approve Final Wording"}
    </button>
  );
}
