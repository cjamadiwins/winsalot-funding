import Link from "next/link";
import { ClipboardCheck, ChevronRight } from "lucide-react";

// Growth CRM dashboard card that opens the dedicated Client Consultation
// Guide page (/admin/consultation-guide) rather than rendering the guide
// inline - the guide has 10 sections, far too long for the dashboard
// itself, same reasoning as the Quick Call Script card living on its own
// section rather than the guide's full script text being inlined here.
export default function ConsultationGuideCard() {
  return (
    <Link
      href="/admin/consultation-guide"
      className="mt-6 flex items-center gap-4 rounded-2xl border border-[var(--crm-accent,#3e7ef7)]/25 bg-[var(--crm-surface)] p-5 shadow-[0_1px_2px_rgba(0,0,0,0.06)] transition hover:-translate-y-0.5 hover:border-[var(--crm-accent,#3e7ef7)]/50 hover:shadow-lg"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--crm-accent,#3e7ef7)] shadow-sm">
        <ClipboardCheck className="h-5 w-5 text-white" strokeWidth={2.25} />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-[15px] font-bold text-slate-900">Client Consultation Guide</h2>
        <p className="mt-0.5 text-[13px] text-slate-600">
          Use during prospect consultations to capture goals, campaign requirements, qualification criteria, and next steps.
        </p>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-[var(--crm-accent,#3e7ef7)]" />
    </Link>
  );
}
