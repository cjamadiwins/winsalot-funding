"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

// Generic large, centered, desktop-friendly modal shell - the same pop-up
// treatment already used by SmartOpportunitiesModal/CrmCardModal (fixed
// backdrop, capped height, vertical scroll only in the body, sticky
// header/footer) but with no assumptions about what it shows, so it can
// host the full Opportunity Finder (list + inline lead detail) as well as
// any other large dashboard pop-up. `headerLeft` replaces the title/
// subtitle block entirely (used for the "← Back to Opportunities" state
// when a lead's full detail is open inside the modal) so the header never
// has to show both a title and a back button competing for space.
export default function LargeModal({
  open,
  onClose,
  title,
  subtitle,
  headerLeft,
  footer,
  children,
  maxWidthClassName = "max-w-7xl",
  labelledBy = "large-modal-title",
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  headerLeft?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  maxWidthClassName?: string;
  labelledBy?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-slate-950/55 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {/* w-full + max-w keeps the panel within the viewport at every
          breakpoint; the body below is the only element that scrolls, and
          only vertically - every child of this modal must wrap/stack
          rather than introduce its own horizontal scroll. */}
      <div className={`flex max-h-[calc(100dvh-1.5rem)] w-full ${maxWidthClassName} flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:max-h-[calc(100dvh-3rem)]`}>
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-4 py-4 sm:px-6">
          {headerLeft ?? (
            <div className="min-w-0">
              {title && (
                <h2 id={labelledBy} className="text-xl font-bold text-slate-900">
                  {title}
                </h2>
              )}
              {subtitle && <p className="mt-1 text-[13px] text-slate-500">{subtitle}</p>}
            </div>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-full border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 hover:text-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-4 py-3 sm:px-6">{children}</div>

        {footer && <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 sm:px-6">{footer}</footer>}
      </div>
    </div>
  );
}
