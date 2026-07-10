"use client";

import { useSearchParams } from "next/navigation";

export default function AddedBanner() {
  const searchParams = useSearchParams();
  if (searchParams.get("added") !== "1") return null;

  return (
    <div className="mt-4 rounded-xl bg-[var(--color-green-soft)] px-4 py-3 text-[13.5px] font-medium text-[var(--color-green-soft-text)]">
      Lead added successfully.
    </div>
  );
}
