"use client";

import { useState } from "react";
import type { WinsalotIncentiveCrm } from "@/lib/agent-incentive-shared";

const GENERAL_RULES = [
  "The incentive is separate from the agent's regular ₦150,000 monthly salary.",
  "An agent earns ₦5,000 for every completed week in which the required weekly quota is achieved.",
  "Weeks run from Monday at 12:00 a.m. through Sunday at 11:59 p.m. using the America/Toronto timezone.",
  "Weekly performance resets every Monday, but historical results remain available.",
  "The maximum incentive is ₦25,000 per agent per calendar month.",
  "No partial incentive is awarded for missing the weekly quota.",
  "Reaching more than the required quota does not increase that week's ₦5,000 bonus.",
  "Extra qualifying results may not be transferred or carried forward into another week.",
  "All incentives require admin verification and approval.",
  "Calculated or pending amounts are not considered payable until approved by admin.",
  "The same result cannot be counted more than once.",
  "Deleted, duplicate, fabricated, test, cancelled, invalid or unqualified records must not count.",
  "If an agent works in both CRMs, their combined approved incentive cannot exceed ₦25,000 in the same calendar month.",
  "The incentive program may be reviewed or adjusted by management, but rule changes apply prospectively and never silently alter previously approved incentives.",
];

const LEADGEN_COUNTS_WHEN = [
  "It was booked during the displayed incentive week.",
  "The prospect clearly agreed to a specific meeting date and time.",
  "The appointment is recorded on the correct CRM lead and booking calendar.",
  "The business matches the client's target industry, location and service requirements.",
  "The person attending is the owner, decision-maker or an appropriate authorized contact.",
  "The business name, contact name, telephone number and email address are valid.",
  "The appointment is genuine and can be verified.",
  "Admin reviews and marks it as Qualified.",
];

const LEADGEN_DOES_NOT_COUNT = [
  "The prospect did not clearly agree to the meeting.",
  "There is no confirmed date or time.",
  "It is only a callback or follow-up reminder.",
  "It is duplicated from an existing appointment.",
  "It involves incorrect or false contact information.",
  "The prospect is outside the client's qualification criteria.",
  "It is a test or fabricated appointment.",
  "It is cancelled before admin approval.",
  "It is marked Invalid, Duplicate, Unqualified, Cancelled or Deleted.",
];

const CRM_COUNTS_WHEN = [
  "It was booked during the displayed incentive week.",
  "The prospect clearly agreed to a specific consultation date and time.",
  "The appointment is recorded on the correct CRM opportunity and appointment record.",
  "The prospect is a genuine, contactable business - not a test or placeholder entry.",
  "The person attending is the owner, decision-maker or an appropriate authorized contact.",
  "The business name, contact name, phone number and email address are valid.",
  "The consultation is genuine and can be verified.",
  "Admin reviews and marks it as Qualified.",
];

const CRM_DOES_NOT_COUNT = [
  "The prospect did not clearly agree to the consultation.",
  "There is no confirmed date or time.",
  "It is only a callback or follow-up reminder, not a booked consultation.",
  "It is duplicated from an existing appointment.",
  "It involves incorrect or false contact information.",
  "It is a test or fabricated appointment.",
  "It is cancelled before admin approval.",
  "It is marked Invalid, Duplicate, Unqualified or Cancelled.",
];

const ADMIN_RESPONSIBILITIES = [
  "Review every qualifying appointment before approving the weekly incentive.",
  "Confirm that all four records satisfy the applicable qualification rules.",
  "Approve only one ₦5,000 incentive per agent per week.",
  "Confirm that approval will not exceed the agent's ₦25,000 monthly cap.",
  "Reject invalid records using a required reason.",
  "Provide a required written reason for any manual adjustment.",
  "Never edit an agent's result merely to make them reach or miss the quota.",
  "Keep a complete audit trail of verification, approval, rejection, adjustment and payment actions.",
  "Only authorized admins may approve or mark incentives as Paid.",
  "An admin cannot remove or change an already-paid incentive without recording a correction reason and audit entry.",
];

function RuleList({ items, ordered }: { items: string[]; ordered?: boolean }) {
  const Tag = ordered ? "ol" : "ul";
  return (
    <Tag className={`mt-2 space-y-1 pl-5 text-[13px] text-slate-700 ${ordered ? "list-decimal" : "list-disc"}`}>
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </Tag>
  );
}

// "How the Incentive Works" (agent dashboards) / "Admin Incentive Rules"
// (admin incentive pages) - a collapsible panel behind a "View Incentive
// Rules" button, shared by both CRMs so the general rules text can never
// drift between them; only the CRM-specific qualifying-record rules
// differ. Purely informational - renders no data of its own and changes
// no incentive calculation.
export default function IncentiveRulesPanel({ crm, audience }: { crm: WinsalotIncentiveCrm; audience: "agent" | "admin" }) {
  const [open, setOpen] = useState(false);
  const title = audience === "agent" ? "How the Incentive Works" : "Admin Incentive Rules";
  const explanation =
    crm === "leadgen"
      ? "Book at least 4 qualified appointments between Monday and Sunday to earn a ₦5,000 weekly incentive."
      : "Book at least 4 qualified consultation appointments with genuine prospective customers between Monday and Sunday to earn a ₦5,000 weekly incentive.";

  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold text-slate-900">{title}</h2>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-full border border-slate-300 px-3.5 py-1.5 text-[12.5px] font-semibold text-slate-700 hover:border-sky-400 hover:text-sky-600"
        >
          {open ? "Hide Incentive Rules" : "View Incentive Rules"}
        </button>
      </div>

      {!open ? (
        <p className="mt-2 text-[13px] text-slate-500">{explanation}</p>
      ) : (
        <div className="mt-4 space-y-5">
          <p className="rounded-lg border border-sky-100 bg-sky-50 px-3.5 py-2.5 text-[13.5px] font-semibold text-sky-800">{explanation}</p>

          <div>
            <h3 className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">General Rules (Both CRMs)</h3>
            <RuleList items={GENERAL_RULES} />
          </div>

          {audience === "agent" ? (
            <>
              <div>
                <h3 className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">
                  {crm === "leadgen" ? "An appointment counts only when" : "A consultation appointment counts only when"}
                </h3>
                <RuleList items={crm === "leadgen" ? LEADGEN_COUNTS_WHEN : CRM_COUNTS_WHEN} ordered />
              </div>
              <div>
                <h3 className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">
                  {crm === "leadgen" ? "An appointment does not count when" : "A consultation appointment does not count when"}
                </h3>
                <RuleList items={crm === "leadgen" ? LEADGEN_DOES_NOT_COUNT : CRM_DOES_NOT_COUNT} />
              </div>
              <p className="rounded-lg border border-amber-100 bg-amber-50 px-3.5 py-2.5 text-[12.5px] text-amber-800">
                {crm === "leadgen" ? "An appointment" : "A consultation appointment"} that is cancelled after the weekly bonus has been approved is
                flagged for admin review. Money already paid is never automatically deducted - admin documents any adjustment.
              </p>
            </>
          ) : (
            <>
              <div>
                <h3 className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">
                  {crm === "leadgen" ? "An appointment counts only when" : "A consultation appointment counts only when"}
                </h3>
                <RuleList items={crm === "leadgen" ? LEADGEN_COUNTS_WHEN : CRM_COUNTS_WHEN} ordered />
              </div>
              <div>
                <h3 className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">
                  {crm === "leadgen" ? "An appointment does not count when" : "A consultation appointment does not count when"}
                </h3>
                <RuleList items={crm === "leadgen" ? LEADGEN_DOES_NOT_COUNT : CRM_DOES_NOT_COUNT} />
              </div>
              <div>
                <h3 className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">Admin Rules &amp; Responsibilities</h3>
                <RuleList items={ADMIN_RESPONSIBILITIES} ordered />
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
