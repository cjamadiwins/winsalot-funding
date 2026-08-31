// Mantra Collab's own Call Training module inside the shared Training
// Zone (leadgen/{admin,agent}/training/page.tsx) - a separate,
// clearly-labeled section alongside BrentsEssentialsTrainingContent,
// never merged into it. Both training pages already render for every
// admin and every agent (no per-client gating exists on this page
// today), so this module is available to both roles the same way
// Brent's Essentials training already is, and a Mantra Collab agent
// sees it without any extra setup.
export default function MantraCollabTrainingContent() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5 sm:p-6">
      <h1 className="text-2xl font-bold text-slate-900">Mantra Collab Call Training</h1>
      <p className="mt-2 text-sm text-slate-600">Read-only training material for live calls. Keep this page open while calling Mantra Collab prospects.</p>

      <div className="mt-6 space-y-6 text-[14px] leading-7 text-slate-700 sm:text-[15px]">
        <section>
          <h2 className="text-base font-bold text-slate-900">Objective</h2>
          <p className="mt-2">Book a short consultation appointment for Mantra Collab.</p>
        </section>

        <section className="rounded-xl border border-sky-200 bg-sky-50 p-4 sm:p-5">
          <h2 className="text-base font-bold text-slate-900">Simple Call Flow</h2>

          <h3 className="mt-4 text-[14px] font-bold uppercase tracking-wide text-slate-800 sm:text-[15px]">Step 1 - Identify the Business</h3>
          <p className="mt-1">&ldquo;Hello, is this <strong>[Business Name]</strong>?&rdquo;</p>
          <p className="mt-2 italic text-slate-600">If yes:</p>
          <p className="mt-1">
            &ldquo;Great. My name is <strong>[Agent Name]</strong>, calling on behalf of <strong>Mantra Collab</strong>.&rdquo;
          </p>

          <h3 className="mt-5 text-[14px] font-bold uppercase tracking-wide text-slate-800 sm:text-[15px]">Step 2 - Give the Reason for Calling</h3>
          <p className="mt-1">&ldquo;We help businesses improve or redesign their website so it better showcases their work, builds credibility, and helps turn visitors into customer inquiries.&rdquo;</p>

          <h3 className="mt-5 text-[14px] font-bold uppercase tracking-wide text-slate-800 sm:text-[15px]">Step 3 - Request the Appointment</h3>
          <p className="mt-1">
            &ldquo;I would like to schedule a short appointment for you to learn how Mantra Collab can help your business. Would <strong>[Day and Time]</strong> work for you?&rdquo;
          </p>
        </section>

        <details className="group rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
          <summary className="cursor-pointer text-base font-bold text-slate-900 marker:content-none">
            <span className="inline-flex items-center gap-2">
              <span className="inline-block transition group-open:rotate-90">▶</span>
              Complete Call Script
            </span>
          </summary>
          <div className="mt-3 rounded-lg border border-sky-200 bg-[var(--crm-surface)] p-4 text-slate-700">
            <p>
              &ldquo;Hello, is this <strong>[Business Name]</strong>? Great. My name is <strong>[Agent Name]</strong>, calling on behalf of <strong>Mantra Collab</strong>. We help businesses improve or redesign their website so it better showcases their work, builds credibility, and helps turn visitors into customer inquiries. I would like to schedule a short appointment for you to learn how we can help your business. Would <strong>[Day and Time]</strong> work for you?&rdquo;
            </p>
          </div>
        </details>

        <details className="group rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
          <summary className="cursor-pointer text-base font-bold text-slate-900 marker:content-none">
            <span className="inline-flex items-center gap-2">
              <span className="inline-block transition group-open:rotate-90">▶</span>
              Objection Responses
            </span>
          </summary>
          <div className="mt-3 space-y-5">
            <div>
              <p className="font-semibold text-slate-900">&ldquo;What does Mantra Collab do?&rdquo;</p>
              <p className="mt-1.5 rounded-lg border border-sky-200 bg-[var(--crm-surface)] p-3.5">
                &ldquo;Mantra Collab helps businesses improve or redesign their website so it better showcases their work, builds credibility, and helps turn visitors into customer inquiries. The consultation will explain the available options.&rdquo;
              </p>
              <p className="mt-1.5 italic text-slate-600">Then ask: &ldquo;Would [Day and Time] work for a short appointment?&rdquo;</p>
            </div>

            <div>
              <p className="font-semibold text-slate-900">&ldquo;Send me information.&rdquo;</p>
              <p className="mt-1.5 rounded-lg border border-sky-200 bg-[var(--crm-surface)] p-3.5">&ldquo;Certainly. May I confirm your email address?&rdquo;</p>
              <p className="mt-1.5 italic text-slate-600">
                After confirming: &ldquo;I will send the information. Can I also schedule a short appointment for you to speak with the Mantra Collab team?&rdquo;
              </p>
            </div>

            <div>
              <p className="font-semibold text-slate-900">&ldquo;I&apos;m busy.&rdquo;</p>
              <p className="mt-1.5 rounded-lg border border-sky-200 bg-[var(--crm-surface)] p-3.5">
                &ldquo;I understand. What day and time would be more convenient for a short appointment?&rdquo;
              </p>
            </div>

            <div>
              <p className="font-semibold text-slate-900">&ldquo;Not interested.&rdquo;</p>
              <p className="mt-1.5 rounded-lg border border-sky-200 bg-[var(--crm-surface)] p-3.5">&ldquo;No problem. Thank you for your time. Have a great day.&rdquo;</p>
            </div>
          </div>
        </details>

        <section>
          <h2 className="text-base font-bold text-slate-900">Information to Confirm</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5">
            <li>Contact name</li>
            <li>Business name</li>
            <li>Email address</li>
            <li>Phone number</li>
            <li>Appointment date</li>
            <li>Appointment time</li>
            <li>Business service or industry</li>
          </ul>
        </section>

        <details className="group rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
          <summary className="cursor-pointer text-base font-bold text-slate-900 marker:content-none">
            <span className="inline-flex items-center gap-2">
              <span className="inline-block transition group-open:rotate-90">▶</span>
              Agent Rules
            </span>
          </summary>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5">
            <li>Always identify and confirm the business name first.</li>
            <li>Keep the explanation short.</li>
            <li>Do not argue with or pressure the business owner.</li>
            <li>Always request the appointment.</li>
            <li>Repeat the appointment date and time before ending the call.</li>
            <li>Record the correct call outcome in the CRM.</li>
          </ol>
        </details>

        <section className="rounded-xl border border-sky-200 bg-sky-50 p-4 sm:p-5">
          <h2 className="text-base font-bold text-slate-900">Closing Statement</h2>
          <p className="mt-2 font-bold text-sky-800">
            &ldquo;Thank you, <strong>[Contact Name]</strong>. Your appointment is booked for <strong>[Day, Date and Time]</strong>. You will receive a confirmation email shortly. Have a great day.&rdquo;
          </p>
        </section>
      </div>
    </div>
  );
}
