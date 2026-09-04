// Generic, non-campaign Call Log training, shown alongside the Connect ->
// Propose -> Close course on both the agent and admin Training pages -
// this is process/CRM training rather than a client script, so it lives
// here instead of inside BrentsEssentialsTrainingContent/
// MantraCollabTrainingContent.
export default function CallLogTrainingContent() {
  return (
    <div id="call-logs" className="scroll-mt-6 space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5 sm:p-6">
        <h1 className="text-2xl font-bold text-slate-900">Call Logs — How and Why to Use Them</h1>
        <p className="mt-2 text-sm text-slate-600">
          Call Logs are required for tracking agent activity and call outcomes, especially for
          calls that do not become a lead. Use one whenever a call is not already captured by the
          normal lead workflow.
        </p>

        <div className="mt-6 space-y-6 text-[14px] leading-7 text-slate-700 sm:text-[15px]">
          <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
            <h2 className="text-base font-bold text-slate-900">How to log a call</h2>
            <ul className="mt-2 list-disc space-y-1.5 pl-5">
              <li>Log every relevant outbound call when it is not already captured as a lead.</li>
              <li>
                Use the correct Business / Client - in the Lead Generation CRM, select the actual
                client you are working for (for example Brent&apos;s Essentials or Mantra
                Collab).
              </li>
              <li>Enter or copy the correct business name and phone number being called.</li>
              <li>
                Select the correct quick outcome: No Answer, Voicemail, Gatekeeper, Not
                Interested, or Callback.
              </li>
              <li>Add a short note when useful.</li>
            </ul>
          </section>

          <section className="rounded-xl border border-sky-200 bg-[var(--crm-surface)] p-4 sm:p-5">
            <h2 className="text-base font-bold text-slate-900">Why Call Logs Are Important</h2>
            <p className="mt-2">Call Logs help Winsalot:</p>
            <ul className="mt-2 list-disc space-y-1.5 pl-5">
              <li>measure real agent activity</li>
              <li>see how many businesses were actually contacted</li>
              <li>understand call outcomes</li>
              <li>identify excessive short calls or low-quality activity</li>
              <li>track callbacks</li>
              <li>compare performance by agent</li>
              <li>compare performance by client</li>
              <li>coach agents using real activity data</li>
              <li>create more accurate performance reports</li>
              <li>maintain accountability without forcing every call to become a lead</li>
            </ul>
          </section>

          <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 sm:p-5">
            <p className="font-semibold text-amber-900">
              Call Logs do not replace Leads or Opportunities.
            </p>
            <p className="mt-1 text-amber-900">
              If a business becomes interested, qualified, or needs follow-up as a real prospect,
              still use the normal Lead/Opportunity workflow for it.
            </p>
          </section>

          <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
            <p className="font-semibold text-slate-900">Example</p>
            <p className="mt-2">
              You call ABC Plumbing for Brent&apos;s Essentials. Nobody answers. Create a Call
              Log, select Brent&apos;s Essentials as the Business/Client, enter ABC Plumbing and
              the phone number, and select &ldquo;No Answer.&rdquo;
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
