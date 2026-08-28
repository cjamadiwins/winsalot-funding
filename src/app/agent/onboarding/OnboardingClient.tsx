"use client";

import { useState, useTransition } from "react";
import type { CrmAgentOnboardingRow } from "@/lib/crm-onboarding-types";
import type { CrmTrainingModuleWithContent, CrmTrainingProgressRow, TrainingProgressSummary } from "@/lib/crm-training-types";
import { isModuleCompletedForUser } from "@/lib/crm-training-types";
import {
  acknowledgePoliciesAction,
  completeOnboardingModuleAction,
  saveOnboardingProfileAction,
  signAndSubmitOnboardingAction,
  submitOnboardingQuizAction,
} from "./actions";

type Result = { error?: string; message?: string };
const input = "mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100";
const button = "rounded-full bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50";

export default function OnboardingClient({ user, onboarding, modules, progressByModuleId, trainingProgress }: {
  user: { fullName: string; email: string };
  onboarding: CrmAgentOnboardingRow;
  modules: CrmTrainingModuleWithContent[];
  progressByModuleId: Record<string, CrmTrainingProgressRow>;
  trainingProgress: TrainingProgressSummary;
}) {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const locked = onboarding.status === "submitted";

  function run(action: () => Promise<Result>) {
    setFeedback(null);
    startTransition(async () => {
      const result = await action();
      if (result?.error) setFeedback({ kind: "error", text: result.error });
      else if (result?.message) setFeedback({ kind: "success", text: result.message });
    });
  }

  return (
    <main className="crm-theme min-h-screen bg-[var(--color-bg)] px-4 py-8 text-slate-900 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <header className="rounded-3xl bg-slate-950 px-6 py-7 text-white shadow-xl sm:px-9">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-sky-300">Winsalot Growth CRM</p>
          <div className="mt-3 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div><h1 className="text-3xl font-bold">Agent onboarding</h1><p className="mt-2 text-sm text-slate-300">Welcome, {user.fullName}. Complete each step to unlock your CRM workspace.</p></div>
            <span className="w-fit rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold capitalize">{onboarding.status.replaceAll("_", " ")}</span>
          </div>
          <div className="mt-6 h-2 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-sky-400" style={{ width: `${trainingProgress.percentComplete}%` }} /></div>
          <p className="mt-2 text-xs text-slate-300">Training: {trainingProgress.completedRequired} of {trainingProgress.totalRequired} required modules</p>
        </header>

        {feedback && <div className={`mt-5 rounded-xl border px-4 py-3 text-sm ${feedback.kind === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{feedback.text}</div>}
        {onboarding.review_note && <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"><strong>Admin note:</strong> {onboarding.review_note}</div>}
        {locked && <div className="mt-5 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">Your onboarding is awaiting admin approval. You’ll receive full CRM access after approval.</div>}

        <div className="mt-6 space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold">1. Your profile</h2><p className="mt-1 text-sm text-slate-500">We’ll use this information for work communication and emergencies.</p>
            <form action={(fd) => run(() => saveOnboardingProfileAction(fd))} className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium">Full name<input value={user.fullName} disabled className={`${input} bg-slate-50`} /></label>
              <label className="text-sm font-medium">Email<input value={user.email} disabled className={`${input} bg-slate-50`} /></label>
              <label className="text-sm font-medium">Phone<input name="phone" defaultValue={onboarding.phone ?? ""} required disabled={locked} className={input} /></label>
              <label className="text-sm font-medium">Time zone<select name="timezone" defaultValue={onboarding.timezone} disabled={locked} className={input}><option>America/Toronto</option><option>America/New_York</option><option>America/Chicago</option><option>America/Edmonton</option><option>America/Vancouver</option></select></label>
              <label className="text-sm font-medium">Emergency contact<input name="emergency_contact_name" defaultValue={onboarding.emergency_contact_name ?? ""} required disabled={locked} className={input} /></label>
              <label className="text-sm font-medium">Emergency contact phone<input name="emergency_contact_phone" defaultValue={onboarding.emergency_contact_phone ?? ""} required disabled={locked} className={input} /></label>
              {!locked && <button disabled={pending} className={`${button} sm:col-span-2 sm:w-fit`}>Save profile</button>}
            </form>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold">2. Policies, schedule and attendance</h2>
            <div className="mt-4 space-y-3 text-sm text-slate-600"><p>Be ready to work at your assigned start time, use the CRM attendance controls accurately, take only approved breaks, and notify your manager promptly if you will be late or absent.</p><p>Keep client, prospect, business and account information confidential. Use CRM data only for authorized Winsalot work.</p><p>Communicate professionally, record outcomes accurately, and follow the approved process and training.</p></div>
            <form action={(fd) => run(() => acknowledgePoliciesAction(fd))} className="mt-5 space-y-3">
              {[['policies','I have read and agree to follow Winsalot workplace policies.', onboarding.policies_acknowledged_at],['attendance','I understand the schedule, break and attendance expectations.', onboarding.attendance_acknowledged_at],['confidentiality','I agree to protect confidential CRM and client information.', onboarding.confidentiality_acknowledged_at]].map(([name,label,checked]) => <label key={String(name)} className="flex gap-3 text-sm"><input type="checkbox" name={String(name)} defaultChecked={Boolean(checked)} disabled={locked} className="mt-1" /><span>{label}</span></label>)}
              {!locked && <button disabled={pending} className={button}>Save acknowledgements</button>}
            </form>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold">3. Winsalot training</h2><p className="mt-1 text-sm text-slate-500">Open each module, read it fully, then mark it complete.</p>
            <div className="mt-5 space-y-3">{modules.map((module) => {
              const complete = isModuleCompletedForUser(module, progressByModuleId[module.id]);
              return <details key={module.id} className="rounded-xl border border-slate-200 p-4"><summary className="cursor-pointer list-none font-semibold"><span className={`mr-2 inline-flex rounded-full px-2 py-0.5 text-xs ${complete ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{complete ? "Complete" : "Required"}</span>{module.title}</summary><div className="mt-4 space-y-4 text-sm text-slate-600"><p><strong>Objective:</strong> {module.content.learningObjective}</p><p className="whitespace-pre-line">{module.content.explanation}</p>{module.content.steps.length > 0 && <ol className="list-decimal space-y-1 pl-5">{module.content.steps.map((step) => <li key={step}>{step}</li>)}</ol>}{module.content.keyReminders.length > 0 && <div><strong>Key reminders</strong><ul className="mt-1 list-disc space-y-1 pl-5">{module.content.keyReminders.map((item) => <li key={item}>{item}</li>)}</ul></div>}{!complete && !locked && <button type="button" disabled={pending} onClick={() => run(() => completeOnboardingModuleAction(module.id))} className={button}>Mark module complete</button>}</div></details>;
            })}</div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold">4. Knowledge check</h2><p className="mt-1 text-sm text-slate-500">A score of 80% is required. Current score: {onboarding.quiz_score ?? "Not attempted"}{onboarding.quiz_score !== null ? "%" : ""}</p>
            <form action={(fd) => run(() => submitOnboardingQuizAction(fd))} className="mt-5 space-y-5">
              <Quiz name="q1" question="What should you confirm first on an outbound business call?" options={[['business_name','The business name'],['budget','Their budget'],['owner','The owner’s home address']]} />
              <Quiz name="q2" question="Where should work activity and outcomes be recorded?" options={[['notes','Personal notes only'],['crm','The Growth CRM'],['memory','From memory at week end']]} />
              <Quiz name="q3" question="How should an agent communicate with prospects?" options={[['professional','Professionally and accurately'],['pressure','With pressure at all costs'],['casual','Without following the approved process']]} />
              <Quiz name="q4" question="What should you do about assigned schedules and breaks?" options={[['follow_schedule','Follow and record them accurately'],['ignore','Ignore them when calling'],['edit','Change them without approval']]} />
              <Quiz name="q5" question="How should CRM and client information be handled?" options={[['share','Share it with friends'],['download','Copy it for personal use'],['protect_data','Protect it and use it only for authorized work']]} />
              {!locked && <button disabled={pending} className={button}>Submit quiz</button>}
            </form>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold">5. Sign and submit</h2><p className="mt-1 text-sm text-slate-500">Typing your full name confirms that the information is accurate and you agree to follow the training and policies.</p>
            <form action={(fd) => run(() => signAndSubmitOnboardingAction(fd))} className="mt-5"><label className="text-sm font-medium">Type “{user.fullName}”<input name="acknowledgement_name" defaultValue={onboarding.acknowledgement_name ?? ""} disabled={locked} required className={input} /></label>{!locked && <button disabled={pending} className={`${button} mt-4`}>Submit for approval</button>}</form>
          </section>
        </div>
      </div>
    </main>
  );
}

function Quiz({ name, question, options }: { name: string; question: string; options: [string,string][] }) {
  return <fieldset><legend className="text-sm font-semibold">{question}</legend><div className="mt-2 space-y-2">{options.map(([value,label]) => <label key={value} className="flex gap-2 text-sm text-slate-600"><input type="radio" name={name} value={value} required />{label}</label>)}</div></fieldset>;
}
