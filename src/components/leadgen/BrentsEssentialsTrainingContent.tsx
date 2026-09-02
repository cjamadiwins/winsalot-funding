import Link from "next/link";
import { BrentsEssentialsCallScript } from "./leadgen-call-scripts";

type Props = {
  dashboardHref: string;
};

export default function BrentsEssentialsTrainingContent({ dashboardHref }: Props) {
  return (
    <div id="brents-essentials" className="scroll-mt-6 space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5 sm:p-6">
        <h1 className="text-2xl font-bold text-slate-900">Brent&apos;s Essentials - Agent Call Script</h1>
        <p className="mt-2 text-sm text-slate-600">Read-only training material for live calls. Keep this page open while calling prospects.</p>

        <div className="mt-6 space-y-6 text-[14px] leading-7 text-slate-700 sm:text-[15px]">
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

          <BrentsEssentialsCallScript agentFullName="[Agent Full Name]" />
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