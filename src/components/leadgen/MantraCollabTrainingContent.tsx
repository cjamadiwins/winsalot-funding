import { MantraCollabCallScript } from "./leadgen-call-scripts";

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
    <div id="mantra-collab" className="scroll-mt-6 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5 sm:p-6">
      <h1 className="text-2xl font-bold text-slate-900">Mantra Collab Call Training</h1>
      <p className="mt-2 text-sm text-slate-600">Read-only training material for live calls. Keep this page open while calling Mantra Collab prospects.</p>

      <div className="mt-6 space-y-6 text-[14px] leading-7 text-slate-700 sm:text-[15px]">
        <section>
          <h2 className="text-base font-bold text-slate-900">Objective</h2>
          <p className="mt-2">Book a short consultation appointment for Mantra Collab.</p>
        </section>

        <MantraCollabCallScript agentFullName="[Agent Full Name]" />
      </div>
    </div>
  );
}
