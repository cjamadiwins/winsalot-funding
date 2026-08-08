import Link from "next/link";

type Props = {
  dashboardHref: string;
};

export default function BrentsEssentialsTrainingContent({ dashboardHref }: Props) {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5 sm:p-6">
        <h1 className="text-2xl font-bold text-slate-900">Brent&apos;s Essentials - Agent Call Script</h1>
        <p className="mt-2 text-sm text-slate-600">Read-only training material for live calls. Keep this page open while calling prospects.</p>

        <div className="mt-6 space-y-6 text-[14px] leading-7 text-slate-700 sm:text-[15px]">
          <section>
            <h2 className="text-base font-bold text-slate-900">Goal</h2>
            <p className="mt-2">
              Your goal is <strong>not to sell on the call.</strong> Your goal is to encourage the business owner to click the <strong>FREE 15-Minute Consultation</strong> link and book a convenient time.
            </p>
          </section>

          <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
            <h2 className="text-base font-bold text-slate-900">Brent&apos;s AI Services — 15-Minute Consultation Script</h2>
            <p className="mt-3 font-semibold text-slate-900">Opening Script</p>
            <div className="mt-2 rounded-lg border border-sky-200 bg-[var(--crm-surface)] p-4 text-slate-700">
              <p>
                &ldquo;Hi, this is Brent&apos;s Essentials. I&apos;m not calling to sell you anything today. We help businesses improve operations, generate more leads, and save time with practical AI solutions. I&apos;d love to offer you a free 15-minute consultation. Would you be open to booking a time?&rdquo;
              </p>
            </div>

            <p className="mt-4 font-semibold text-slate-900">Training Notes</p>
            <ul className="mt-2 list-disc space-y-1.5 pl-5">
              <li>Be friendly and confident.</li>
              <li>Speak naturally without rushing.</li>
              <li>Focus on the value, not the technology.</li>
              <li>The goal is to book the free 15-minute consultation.</li>
              <li>If the prospect is interested, send the consultation booking email directly from the CRM.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-slate-900">Call Script</h2>
            <p className="mt-2 font-semibold text-slate-900">Agent:</p>
            <div className="mt-2 space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
              <p>&ldquo;Good morning/afternoon. May I please confirm that I&apos;m speaking with <strong>[Business Name]</strong>?&rdquo;</p>
              <p className="italic text-slate-600">(Wait for confirmation.)</p>
              <p>
                &ldquo;Great. My name is <strong>[Agent Name]</strong>, calling on behalf of <strong>Brent&apos;s Essentials</strong>.
              </p>
              <p>
                We&apos;re reaching out to local businesses because Brent is offering a <strong>FREE 15-minute consultation</strong> to discuss practical ways to <strong>improve your current operations while generating more leads and creating a stronger workflow</strong> for your business.
              </p>
              <p>
                There&apos;s <strong>no obligation</strong> and no cost for the consultation. If you&apos;re interested, I&apos;ll send you a booking link where you can choose a time that works best for you.&rdquo;
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-base font-bold text-slate-900">If They Agree</h2>
            <p className="mt-2">
              &ldquo;Excellent! I&apos;ll send the <strong>FREE Consultation</strong> link right away. Simply click the link, choose a convenient time, and Brent will meet with you to discuss opportunities for your business.&rdquo;
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-slate-900">Call to Action</h2>
            <p className="mt-2 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 font-bold text-sky-800">
              &ldquo;Please click the FREE Consultation link and book your preferred time.&rdquo;
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-slate-900">If They&apos;re Busy</h2>
            <p className="mt-2">
              &ldquo;I completely understand. It only takes a few seconds to book. I&apos;ll send you the consultation link now, and you can choose any available time that&apos;s convenient for you.&rdquo;
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-slate-900">Before Ending the Call</h2>
            <p className="mt-2 font-bold">
              &ldquo;Once you receive the email, please click the booking link today to reserve your preferred time before the available slots fill up.&rdquo;
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-slate-900">Remember</h2>
            <ul className="mt-2 list-disc space-y-1.5 pl-5">
              <li>Confirm the business name first.</li>
              <li>Be friendly and professional.</li>
              <li>Don&apos;t pressure the prospect.</li>
              <li>
                Emphasize that the consultation is <strong>FREE</strong> and <strong>no obligation</strong>.
              </li>
              <li>
                Explain that Brent will discuss ways to <strong>improve operations, generate more leads, and create a better workflow</strong>.
              </li>
              <li>
                Your objective is to get the business owner to <strong>click the booking link and schedule the consultation</strong>.
              </li>
            </ul>
          </section>

          <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
            <h2 className="text-base font-bold text-slate-900">HELPING BUSINESSES BOOK THEIR FREE CONSULTATION</h2>

            <h3 className="mt-4 text-[14px] font-bold uppercase tracking-wide text-slate-800 sm:text-[15px]">Goal</h3>
            <p className="mt-2">The agent&apos;s goal is to help the business owner successfully book their FREE 15-minute AI Business Growth Consultation.</p>

            <h3 className="mt-5 text-[14px] font-bold uppercase tracking-wide text-slate-800 sm:text-[15px]">Step 1 - Confirm the Business</h3>
            <p className="mt-2 font-semibold text-slate-900">Agent Script:</p>
            <p className="mt-1">&ldquo;Hi, am I speaking with the owner or manager of [Business Name]?&rdquo;</p>

            <h3 className="mt-5 text-[14px] font-bold uppercase tracking-wide text-slate-800 sm:text-[15px]">Step 2 - Explain the Purpose</h3>
            <p className="mt-2 font-semibold text-slate-900">Agent Script:</p>
            <p className="mt-1">
              &ldquo;We&apos;re offering a free 15-minute consultation where our specialist will show you practical ways AI can help your business attract more customers, generate more qualified leads, automate customer follow-up, save time, and improve sales opportunities.&rdquo;
            </p>

            <h3 className="mt-5 text-[14px] font-bold uppercase tracking-wide text-slate-800 sm:text-[15px]">Step 3 - Guide Them to the Email</h3>
            <p className="mt-2 font-semibold text-slate-900">Agent Script:</p>
            <p className="mt-1">&ldquo;I&apos;ve just sent you an email. Could you please open it while we&apos;re on the phone?&rdquo;</p>

            <h3 className="mt-5 text-[14px] font-bold uppercase tracking-wide text-slate-800 sm:text-[15px]">Step 4 - Help Them Find the Button</h3>
            <p className="mt-2 font-semibold text-slate-900">Agent Script:</p>
            <p className="mt-1">&ldquo;You should see a blue button that says &apos;BOOK A FREE 15-MINUTE CONSULTATION.&apos; Please click that button.&rdquo;</p>

            <h3 className="mt-5 text-[14px] font-bold uppercase tracking-wide text-slate-800 sm:text-[15px]">Step 5 - Help Them Complete the Appointment Form</h3>
            <p className="mt-2">Guide the business owner to:</p>
            <ul className="mt-2 list-disc space-y-1.5 pl-5">
              <li>Select a convenient date.</li>
              <li>Choose an available time.</li>
              <li>Enter their name, email address, and phone number.</li>
              <li>Review the information.</li>
              <li>Click the final confirmation button to book the appointment.</li>
            </ul>

            <h3 className="mt-5 text-[14px] font-bold uppercase tracking-wide text-slate-800 sm:text-[15px]">Step 6 - Confirm the Appointment</h3>
            <p className="mt-2 font-semibold text-slate-900">Ask:</p>
            <p className="mt-1">&ldquo;Did you receive the appointment confirmation?&rdquo;</p>
            <p className="mt-3 font-semibold text-slate-900">If YES, say:</p>
            <p className="mt-1">&ldquo;Excellent. Our specialist will speak with you at the scheduled time. We look forward to helping your business grow.&rdquo;</p>
            <p className="mt-3 font-semibold text-slate-900">If NO:</p>
            <ul className="mt-1 list-disc space-y-1.5 pl-5">
              <li>Confirm the form was submitted.</li>
              <li>Ask them to check their Spam or Junk folder.</li>
              <li>Verify the email address is correct.</li>
              <li>Resend the consultation email if necessary.</li>
            </ul>

            <h3 className="mt-5 text-[14px] font-bold uppercase tracking-wide text-slate-800 sm:text-[15px]">Important Reminders</h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-5">
              <li>Do not pressure the business owner.</li>
              <li>Speak calmly, slowly, and professionally.</li>
              <li>Stay on the phone while they complete the booking whenever possible.</li>
              <li>Never ask for passwords or sensitive information.</li>
              <li>Answer basic questions clearly and confidently.</li>
              <li>Thank them for their time, even if they decide not to book.</li>
            </ul>
          </section>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5 sm:p-6">
        <h1 className="text-2xl font-bold text-slate-900">CTA (Call to Action) — How to Move a Prospect to the Next Step</h1>

        <div className="mt-6 space-y-6 text-[14px] leading-7 text-slate-700 sm:text-[15px]">
          <section>
            <h2 className="text-base font-bold text-slate-900">What is a CTA?</h2>
            <p className="mt-2">
              CTA means &ldquo;Call to Action.&rdquo; It is the specific next action we want the prospect to take after speaking with us. For this campaign, the CTA is <strong>booking the free 15-minute consultation</strong> when applicable.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-slate-900">During the Call</h2>
            <p className="mt-2">
              Do not simply end the conversation by saying: &ldquo;Okay, we&apos;ll send you some information.&rdquo;
            </p>
            <p className="mt-2">Instead, clearly explain what the prospect should do next.</p>
            <div className="mt-2 rounded-lg border border-sky-200 bg-[var(--crm-surface)] p-4 text-slate-700">
              <p>
                &ldquo;Great. I&apos;ll send the consultation booking information now. Please check your email and follow the link/button to book your free 15-minute consultation.&rdquo;
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-base font-bold text-slate-900">Ask Them to Check Their Email</h2>
            <p className="mt-2">When appropriate, say:</p>
            <p className="mt-2 italic">&ldquo;Would you be able to check your email while I have you on the phone?&rdquo;</p>
            <p className="mt-2">If they can, guide them toward booking the consultation.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-slate-900">If They Say &ldquo;Send Me the Information&rdquo;</h2>
            <p className="mt-2">Say:</p>
            <p className="mt-2 italic">
              &ldquo;Absolutely. I&apos;ll send it over now. Please check your email for the link/button and follow it to book your free 15-minute consultation when you&apos;re ready.&rdquo;
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-slate-900">Follow-Up Call</h2>
            <p className="mt-2">If the prospect has not completed the CTA:</p>
            <p className="mt-2 italic">
              &ldquo;Hi, this is [Agent Name] following up on the information we sent. I just wanted to make sure you received it. Were you able to see the link?&rdquo;
            </p>
            <p className="mt-3">If they received it:</p>
            <p className="mt-2 italic">
              &ldquo;No problem. If you&apos;re still interested, you can use the link we sent to book your free 15-minute consultation.&rdquo;
            </p>
          </section>

          <section className="rounded-xl border border-sky-200 bg-sky-50 p-4 sm:p-5">
            <h2 className="text-base font-bold text-slate-900">Golden Rule</h2>
            <p className="mt-2">Before ending an interested conversation, ask yourself:</p>
            <p className="mt-2 font-bold text-sky-800">&ldquo;Does the prospect know exactly what I want them to do next?&rdquo;</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-slate-900">The Process</h2>
            <p className="mt-2">
              Create Interest &rarr; Explain Next Step &rarr; Send CTA &rarr; Follow Up &rarr; Get the Prospect to Complete the CTA.
            </p>
          </section>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-[var(--crm-surface)] p-4 text-sm text-slate-600">
        This Training section is <strong className="text-slate-800">read-only</strong>. To return to your main CRM dashboard, go back to{" "}
        <Link href={dashboardHref} className="font-semibold text-sky-600 hover:text-sky-700">
          Dashboard
        </Link>
        .
      </div>
    </div>
  );
}