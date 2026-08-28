"use client";

import Link from "next/link";
import type { AgentProgressListRow } from "@/lib/crm-training-data";
import TrainingProgressBar from "./TrainingProgressBar";

function formatDate(value: string | null): string {
  if (!value) return "Never";
  return new Date(value).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default function AdminTrainingProgressListClient({ agents }: { agents: AgentProgressListRow[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--color-border)] bg-[var(--crm-surface)]">
      <table className="min-w-full divide-y divide-[var(--color-border)] text-sm">
        <thead>
          <tr className="text-left text-xs font-medium uppercase tracking-wide text-slate-500">
            <th className="px-4 py-3">Agent</th>
            <th className="px-4 py-3">Required Progress</th>
            <th className="px-4 py-3">Completed</th>
            <th className="px-4 py-3">Last Activity</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-border)]">
          {agents.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                No active agents yet.
              </td>
            </tr>
          )}
          {agents.map((agent) => (
            <tr key={agent.userId}>
              <td className="px-4 py-3 font-medium text-[var(--color-ink-strong)]">
                <div>{agent.fullName}</div>
                <div className="text-[11.5px] font-normal text-slate-500">{agent.email}</div>
              </td>
              <td className="px-4 py-3">
                <div className="w-40">
                  <TrainingProgressBar percent={agent.percentComplete} />
                </div>
              </td>
              <td className="px-4 py-3">
                {agent.completedRequired} / {agent.totalRequired} ({agent.percentComplete}%)
              </td>
              <td className="px-4 py-3 text-slate-500">{formatDate(agent.lastActivityAt)}</td>
              <td className="px-4 py-3 text-right">
                <Link href={`/admin/crm/winsalot-training/progress/${agent.userId}`} className="text-[12px] font-semibold text-sky-600 hover:text-sky-700">
                  View Record
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
