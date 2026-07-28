import Link from "next/link";

type Props = {
  dashboardHref: string;
};

export default function BrentsEssentialsTrainingContent({ dashboardHref }: Props) {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <h1 className="text-2xl font-bold text-slate-900">Brent&apos;s Essentials - Agent Call Script</h1>
        <p className="mt-2 text-sm text-slate-600">Read-only training material for live calls. Keep this page open while calling prospects.</p>

        <div className="mt-6 space-y-6 text-[14px] leading-7 text-slate-700 sm:text-[15px]">
          <section>
            <h2 className="text-base font-bold text-slate-900">Goal</h2>
            <p className="mt-2">
              Your goal is <strong>not to sell on the call.</strong> Your goal is to encourage the business owner to click the <strong>FREE 15-Minute Consultation</strong> link and book a convenient time.
            </p>
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
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
        This Training section is <strong className="text-slate-800">read-only</strong>. To return to your main CRM dashboard, go back to{" "}
        <Link href={dashboardHref} className="font-semibold text-sky-600 hover:text-sky-700">
          Dashboard
        </Link>
        .
      </div>
    </div>
  );
}