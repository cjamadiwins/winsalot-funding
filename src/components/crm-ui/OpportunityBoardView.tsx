"use client";

import { useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Calendar, ChevronLeft, ChevronRight, Phone } from "lucide-react";
import type { OpportunityBoardCard, OpportunityBoardColumn } from "@/lib/opportunity-board";

// How far one click of the left/right nav arrow scrolls the board -
// roughly one column's width plus its gap.
const SCROLL_STEP_PX = 290;

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

// Shared Kanban-style Board View for both CRMs' Opportunity Finder,
// reused as-is by Growth CRM (admin + agent) and Lead Gen CRM (admin +
// agent) - a purely presentational second view over whatever
// OpportunityBoardCard[] the caller already built from its own existing
// List View rows. Clicking a card opens a compact detail panel with
// View Full Record / Edit (both reuse the CRM's own existing detail
// page - there is no separate edit route in either CRM) and a small
// Add Note form that calls back into the caller's own existing
// note/call-log action, so no new note-taking system is introduced here.
export default function OpportunityBoardView({
  columns,
  cards,
  onAddNote,
  scopeNotice,
}: {
  columns: OpportunityBoardColumn[];
  cards: OpportunityBoardCard[];
  onAddNote: (cardId: string, note: string) => Promise<{ error?: string }>;
  // Agent views pass a short, explicit label (e.g. "Showing only
  // opportunities assigned to you") so it's visually obvious the board
  // is scoped - purely a text hint, never changes which cards RLS/the
  // caller's own query already returned.
  scopeNotice?: string;
}) {
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function scrollByStep(direction: -1 | 1) {
    scrollRef.current?.scrollBy({ left: direction * SCROLL_STEP_PX, behavior: "smooth" });
  }

  const cardsByColumn = useMemo(() => {
    const map = new Map<string, OpportunityBoardCard[]>();
    for (const column of columns) map.set(column.key, []);
    for (const card of cards) {
      const list = map.get(card.stageKey);
      if (list) list.push(card);
      else map.set(card.stageKey, [card]);
    }
    return map;
  }, [columns, cards]);

  const selected = cards.find((c) => c.id === selectedId) ?? null;

  function openCard(card: OpportunityBoardCard) {
    setSelectedId(card.id);
    setNoteText("");
    setNoteError(null);
  }

  function submitNote() {
    if (!selected || !noteText.trim()) return;
    setNoteError(null);
    startTransition(async () => {
      const result = await onAddNote(selected.id, noteText.trim());
      if (result.error) {
        setNoteError(result.error);
        return;
      }
      setNoteText("");
      router.refresh();
    });
  }

  return (
    <div className="mt-4">
      {scopeNotice && (
        <p className="mb-2 flex items-center gap-1.5 text-[12px] font-medium text-slate-500">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-sky-400" aria-hidden="true" />
          {scopeNotice}
        </p>
      )}
      <div className="relative">
        <button
          type="button"
          onClick={() => scrollByStep(-1)}
          aria-label="Scroll pipeline left"
          className="absolute left-0 top-1/2 z-10 hidden -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white p-1.5 text-slate-500 shadow-sm transition hover:border-sky-300 hover:text-sky-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-1 sm:flex"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => scrollByStep(1)}
          aria-label="Scroll pipeline right"
          className="absolute right-0 top-1/2 z-10 hidden translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white p-1.5 text-slate-500 shadow-sm transition hover:border-sky-300 hover:text-sky-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-1 sm:flex"
        >
          <ChevronRight className="h-4 w-4" />
        </button>

        <div ref={scrollRef} className="opportunity-board-scroll flex gap-3 overflow-x-auto px-1 pb-3 sm:px-6">
          {columns.map((column) => {
            const columnCards = cardsByColumn.get(column.key) ?? [];
            return (
              <div key={column.key} className="flex w-[270px] shrink-0 flex-col rounded-2xl border border-slate-200 bg-slate-50">
                <div className="flex items-center justify-between gap-2 rounded-t-2xl border-b border-slate-200 bg-white px-3 py-2.5">
                  <span className={`min-w-0 truncate rounded-full px-2.5 py-1 text-[11px] font-bold ${column.styleClass}`} title={column.label}>
                    {column.label}
                  </span>
                  <span className="shrink-0 text-[12px] font-semibold text-slate-400">{columnCards.length}</span>
                </div>
                <div className="flex max-h-[560px] flex-col gap-2 overflow-y-auto p-2">
                  {columnCards.length === 0 && <p className="px-1 py-3 text-center text-[12px] text-slate-400">No opportunities</p>}
                  {columnCards.map((card) => (
                    <button
                      key={card.id}
                      type="button"
                      onClick={() => openCard(card)}
                      className="rounded-xl border border-slate-200 bg-white p-2.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-1"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 truncate font-semibold text-slate-900" title={card.businessName}>
                          {card.businessName}
                        </div>
                        <span className="shrink-0 text-[11.5px] font-extrabold text-slate-900">{card.score}</span>
                      </div>
                      <div className="mt-0.5 truncate text-[11.5px] text-slate-500">{card.assignedAgentName || "Unassigned"}</div>
                      <dl className="mt-1.5 space-y-0.5 text-[11.5px] text-slate-600">
                        <div className="flex justify-between gap-2">
                          <dt className="flex items-center gap-1 text-slate-400"><Phone className="h-3 w-3" /> Last Contact</dt>
                          <dd className="text-right">{fmt(card.lastCallAt)}</dd>
                        </div>
                        {card.lastCallOutcome && (
                          <div className="flex justify-between gap-2">
                            <dt className="shrink-0 text-slate-400">Outcome</dt>
                            <dd className="truncate text-right">{card.lastCallOutcome}</dd>
                          </div>
                        )}
                        <div className="flex justify-between gap-2">
                          <dt className="flex items-center gap-1 text-slate-400"><Calendar className="h-3 w-3" /> Follow-up</dt>
                          <dd className="text-right">{fmt(card.nextFollowUpAt)}</dd>
                        </div>
                      </dl>
                      {card.notes[0] && <p className="mt-1.5 line-clamp-2 break-words text-[11.5px] text-slate-600">{card.notes[0]}</p>}
                      {card.appointmentStatus && (
                        <span className={`mt-1.5 inline-flex rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${card.appointmentStatusStyle}`}>
                          {card.appointmentStatus}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          {cards.length === 0 && <p className="py-10 text-center text-slate-400">No opportunities match these filters.</p>}
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/40 p-4 sm:p-6" onClick={() => setSelectedId(null)}>
          <div
            className="flex max-h-full w-full max-w-md flex-col overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg font-bold text-slate-900">{selected.businessName}</h3>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                aria-label="Close"
                className="rounded-full p-1 text-slate-400 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
              >
                ×
              </button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-lg font-extrabold text-slate-900">{selected.score}</span>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${selected.scoreCategoryStyle}`}>{selected.scoreCategoryLabel}</span>
              <span className={`inline-flex w-fit rounded-full px-2.5 py-1 text-[11px] font-bold ${selected.stageStyle}`}>{selected.stageLabel}</span>
            </div>

            <dl className="mt-4 space-y-2.5 text-[13px] text-slate-700">
              <Row label="Client / Current Business" value={selected.clientOrBusiness} />
              <Row label="Assigned Agent" value={selected.assignedAgentName || "Unassigned"} />
              <Row label="Phone" value={selected.phone || "—"} />
              <Row label="Last Contact Date/Time" icon={<Phone className="h-3 w-3" />} value={fmt(selected.lastCallAt)} />
              <Row label="Last Contact Outcome" value={selected.lastCallOutcome || "—"} />
              <Row label="Next Follow-Up" icon={<Calendar className="h-3 w-3" />} value={fmt(selected.nextFollowUpAt)} />
              {selected.appointmentStatus && <Row label="Appointment Status" value={selected.appointmentStatus} />}
            </dl>

            <div className="mt-4 border-t border-slate-100 pt-4">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Latest Notes</div>
              {selected.notes.length === 0 ? (
                <p className="mt-1.5 text-[13px] text-slate-500">No notes logged yet.</p>
              ) : (
                <ul className="mt-1.5 space-y-2">
                  {selected.notes.map((note, i) => (
                    <li key={i} className="rounded-lg bg-slate-50 px-3 py-2 text-[12.5px] text-slate-700">
                      {note}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={selected.viewHref} className="rounded-full border border-indigo-300 bg-indigo-50 px-3.5 py-1.5 text-[12px] font-semibold text-indigo-700 hover:border-indigo-400">
                View Full Record
              </Link>
              <Link href={selected.editHref} className="rounded-full border border-slate-300 px-3.5 py-1.5 text-[12px] font-semibold text-slate-700 hover:border-slate-400">
                Edit
              </Link>
            </div>

            <div className="mt-4 border-t border-slate-100 pt-4">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Add Note</label>
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Quick note..."
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px] text-slate-900"
                rows={2}
              />
              {noteError && <p className="mt-1.5 text-[12px] text-rose-600">{noteError}</p>}
              <button
                type="button"
                disabled={isPending || !noteText.trim()}
                onClick={submitNote}
                className="mt-2 rounded-full bg-sky-600 px-4 py-1.5 text-[12.5px] font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPending ? "Saving…" : "Save Note"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="flex shrink-0 items-center gap-1 text-slate-400">
        {icon}
        {label}
      </dt>
      <dd className="text-right font-medium text-slate-800">{value}</dd>
    </div>
  );
}
