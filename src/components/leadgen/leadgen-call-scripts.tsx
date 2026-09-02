// Single source of truth for the Brent's Essentials and Mantra Collab call
// scripts. Both the Training section (BrentsEssentialsTrainingContent /
// MantraCollabTrainingContent) and the agent dashboard's "Current Campaign
// Call Script" section (CampaignCallScriptSection) render these same
// components so the two places can never drift apart. `agentFullName` is
// the only thing that changes between the two callers - Training shows a
// literal "[Agent Full Name]" placeholder, the dashboard substitutes the
// signed-in agent's real name.

function CollapsibleCompleteScript({ children }: { children: React.ReactNode }) {
  return (
    <details className="group rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
      <summary className="cursor-pointer text-base font-bold text-slate-900 marker:content-none">
        <span className="inline-flex items-center gap-2">
          <span className="inline-block transition group-open:rotate-90">▶</span>
          Complete Call Script
        </span>
      </summary>
      <div className="mt-3 space-y-4">{children}</div>
    </details>
  );
}

export function BrentsEssentialsCallScript({ agentFullName }: { agentFullName: string }) {
  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-sky-200 bg-sky-50 p-4 sm:p-5">
        <h3 className="text-[14px] font-bold uppercase tracking-wide text-slate-800 sm:text-[15px]">Step 1 — Identify the Business</h3>
        <p className="mt-2">
          &ldquo;Good morning/afternoon. May I please confirm that I&apos;m speaking with <strong>[Business Name]</strong>?&rdquo;
        </p>
        <p className="mt-1 italic text-slate-600">(Wait for confirmation.)</p>

        <h3 className="mt-5 text-[14px] font-bold uppercase tracking-wide text-slate-800 sm:text-[15px]">Step 2 — Introduce Yourself</h3>
        <p className="mt-2">
          &ldquo;My name is <strong>{agentFullName}</strong>, and I&apos;m calling on behalf of <strong>Brent&apos;s Essentials</strong>.&rdquo;
        </p>
      </section>

      <CollapsibleCompleteScript>
        <div>
          <p className="font-semibold text-slate-900">Goal</p>
          <p className="mt-1.5 rounded-lg border border-sky-200 bg-[var(--crm-surface)] p-3.5">
            Your goal is <strong>not to sell on the call.</strong> Your goal is to encourage the business owner to click the{" "}
            <strong>FREE 15-Minute Consultation</strong> link and book a convenient time.
          </p>
        </div>

        <div>
          <p className="font-semibold text-slate-900">Purpose &amp; Qualifying Conversation</p>
          <div className="mt-1.5 space-y-3 rounded-lg border border-sky-200 bg-[var(--crm-surface)] p-3.5">
            <p>
              We&apos;re reaching out to local businesses because Brent is offering a <strong>FREE 15-minute consultation</strong> to
              discuss practical ways to <strong>improve your current operations while generating more leads and creating a stronger
              workflow</strong> for your business.
            </p>
            <p>
              There&apos;s <strong>no obligation</strong> and no cost for the consultation. If you&apos;re interested, I&apos;ll send
              you a booking link where you can choose a time that works best for you.
            </p>
          </div>
        </div>

        <div>
          <p className="font-semibold text-slate-900">If They Agree</p>
          <p className="mt-1.5 rounded-lg border border-sky-200 bg-[var(--crm-surface)] p-3.5">
            &ldquo;Excellent! I&apos;ll send the <strong>FREE Consultation</strong> link right away. Simply click the link, choose a
            convenient time, and Brent will meet with you to discuss opportunities for your business.&rdquo;
          </p>
        </div>

        <div>
          <p className="font-semibold text-slate-900">Request to Book</p>
          <p className="mt-1.5 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 font-bold text-sky-800">
            &ldquo;Please click the FREE Consultation link and book your preferred time.&rdquo;
          </p>
        </div>

        <div>
          <p className="font-semibold text-slate-900">Objection: &ldquo;I&apos;m Busy&rdquo;</p>
          <p className="mt-1.5 rounded-lg border border-sky-200 bg-[var(--crm-surface)] p-3.5">
            &ldquo;I completely understand. It only takes a few seconds to book. I&apos;ll send you the consultation link now, and you
            can choose any available time that&apos;s convenient for you.&rdquo;
          </p>
        </div>

        <div>
          <p className="font-semibold text-slate-900">Before Ending the Call</p>
          <p className="mt-1.5 rounded-lg border border-sky-200 bg-[var(--crm-surface)] p-3.5 font-bold">
            &ldquo;Once you receive the email, please click the booking link today to reserve your preferred time before the available
            slots fill up.&rdquo;
          </p>
        </div>

        <div>
          <p className="font-semibold text-slate-900">Remember</p>
          <ul className="mt-1.5 list-disc space-y-1.5 rounded-lg border border-sky-200 bg-[var(--crm-surface)] p-3.5 pl-8">
            <li>Confirm the business name first.</li>
            <li>Be friendly and professional.</li>
            <li>Don&apos;t pressure the prospect.</li>
            <li>
              Emphasize that the consultation is <strong>FREE</strong> and <strong>no obligation</strong>.
            </li>
            <li>
              Explain that Brent will discuss ways to <strong>improve operations, generate more leads, and create a better
              workflow</strong>.
            </li>
            <li>
              Your objective is to get the business owner to <strong>click the booking link and schedule the consultation</strong>.
            </li>
          </ul>
        </div>

        <div>
          <p className="font-semibold text-slate-900">Helping Businesses Book Their Free Consultation</p>
          <div className="mt-1.5 space-y-3 rounded-lg border border-sky-200 bg-[var(--crm-surface)] p-3.5">
            <p>
              <strong>Step 1 - Confirm the Business:</strong> &ldquo;Hi, am I speaking with the owner or manager of{" "}
              <strong>[Business Name]</strong>?&rdquo;
            </p>
            <p>
              <strong>Step 2 - Explain the Purpose:</strong> &ldquo;We&apos;re offering a free 15-minute consultation where our
              specialist will show you practical ways AI can help your business attract more customers, generate more qualified leads,
              automate customer follow-up, save time, and improve sales opportunities.&rdquo;
            </p>
            <p>
              <strong>Step 3 - Guide Them to the Email:</strong> &ldquo;I&apos;ve just sent you an email. Could you please open it while
              we&apos;re on the phone?&rdquo;
            </p>
            <p>
              <strong>Step 4 - Help Them Find the Button:</strong> &ldquo;You should see a blue button that says &apos;BOOK A FREE
              15-MINUTE CONSULTATION.&apos; Please click that button.&rdquo;
            </p>
            <p>
              <strong>Step 5 - Help Them Complete the Appointment Form:</strong> Guide the business owner to select a convenient date,
              choose an available time, enter their name, email address, and phone number, review the information, and click the final
              confirmation button to book the appointment.
            </p>
            <p>
              <strong>Step 6 - Confirm the Appointment:</strong> Ask &ldquo;Did you receive the appointment confirmation?&rdquo; If yes:
              &ldquo;Excellent. Our specialist will speak with you at the scheduled time. We look forward to helping your business
              grow.&rdquo; If no: confirm the form was submitted, ask them to check their Spam or Junk folder, verify the email address
              is correct, and resend the consultation email if necessary.
            </p>
          </div>
        </div>

        <div>
          <p className="font-semibold text-slate-900">Important Reminders</p>
          <ul className="mt-1.5 list-disc space-y-1.5 rounded-lg border border-sky-200 bg-[var(--crm-surface)] p-3.5 pl-8">
            <li>Do not pressure the business owner.</li>
            <li>Speak calmly, slowly, and professionally.</li>
            <li>Stay on the phone while they complete the booking whenever possible.</li>
            <li>Never ask for passwords or sensitive information.</li>
            <li>Answer basic questions clearly and confidently.</li>
            <li>Thank them for their time, even if they decide not to book.</li>
          </ul>
        </div>
      </CollapsibleCompleteScript>
    </div>
  );
}

export function MantraCollabCallScript({ agentFullName }: { agentFullName: string }) {
  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-sky-200 bg-sky-50 p-4 sm:p-5">
        <h3 className="text-[14px] font-bold uppercase tracking-wide text-slate-800 sm:text-[15px]">Step 1 — Identify the Business</h3>
        <p className="mt-2">
          &ldquo;Good morning/afternoon. May I please confirm that I&apos;m speaking with <strong>[Business Name]</strong>?&rdquo;
        </p>
        <p className="mt-1 italic text-slate-600">(Wait for confirmation.)</p>

        <h3 className="mt-5 text-[14px] font-bold uppercase tracking-wide text-slate-800 sm:text-[15px]">Step 2 — Introduce Yourself</h3>
        <p className="mt-2">
          &ldquo;My name is <strong>{agentFullName}</strong>, and I&apos;m calling on behalf of <strong>Mantra Collab</strong>.&rdquo;
        </p>

        <h3 className="mt-5 text-[14px] font-bold uppercase tracking-wide text-slate-800 sm:text-[15px]">Step 3 - Give the Reason for Calling</h3>
        <p className="mt-2">
          &ldquo;We help businesses improve or redesign their website so it better showcases their work, builds credibility, and helps
          turn visitors into customer inquiries.&rdquo;
        </p>

        <h3 className="mt-5 text-[14px] font-bold uppercase tracking-wide text-slate-800 sm:text-[15px]">Step 4 - Request the Appointment</h3>
        <p className="mt-2">
          &ldquo;I would like to schedule a short appointment for you to learn how Mantra Collab can help your business. Would{" "}
          <strong>[Day and Time]</strong> work for you?&rdquo;
        </p>
      </section>

      <CollapsibleCompleteScript>
        <p>
          &ldquo;Good morning/afternoon. May I please confirm that I&apos;m speaking with <strong>[Business Name]</strong>? (Wait for
          confirmation.) My name is <strong>{agentFullName}</strong>, and I&apos;m calling on behalf of{" "}
          <strong>Mantra Collab</strong>. We help businesses improve or redesign their website so it better showcases their work,
          builds credibility, and helps turn visitors into customer inquiries. I would like to schedule a short appointment for you to
          learn how Mantra Collab can help your business. Would <strong>[Day and Time]</strong> work for you?&rdquo;
        </p>
      </CollapsibleCompleteScript>

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
              &ldquo;Mantra Collab helps businesses improve or redesign their website so it better showcases their work, builds
              credibility, and helps turn visitors into customer inquiries. The consultation will explain the available
              options.&rdquo;
            </p>
            <p className="mt-1.5 italic text-slate-600">Then ask: &ldquo;Would [Day and Time] work for a short appointment?&rdquo;</p>
          </div>

          <div>
            <p className="font-semibold text-slate-900">&ldquo;Send me information.&rdquo;</p>
            <p className="mt-1.5 rounded-lg border border-sky-200 bg-[var(--crm-surface)] p-3.5">&ldquo;Certainly. May I confirm your email address?&rdquo;</p>
            <p className="mt-1.5 italic text-slate-600">
              After confirming: &ldquo;I will send the information. Can I also schedule a short appointment for you to speak with the
              Mantra Collab team?&rdquo;
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
        <p className="font-semibold text-slate-900">Information to Confirm</p>
        <ul className="mt-1.5 list-disc space-y-1.5 pl-5">
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
        <p className="font-semibold text-slate-900">Closing Statement</p>
        <p className="mt-2 font-bold text-sky-800">
          &ldquo;Thank you, <strong>[Contact Name]</strong>. Your appointment is booked for{" "}
          <strong>[Day, Date and Time]</strong>. You will receive a confirmation email shortly. Have a great day.&rdquo;
        </p>
      </section>
    </div>
  );
}
