"use client";

import { useState, useTransition } from "react";
import type { CrmUserRow } from "@/lib/crm-types";
import type { AgentOnboardingAdminRow } from "@/lib/crm-onboarding-types";
import { inviteAgentAction, removeAgentAction, resendAgentAccessEmailAction, reviewAgentOnboardingAction, updateAgentAction } from "./actions";

const inputClasses =
  "w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100";
const buttonClasses =
  "rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60";

export default function AgentsClient({
  agents,
  onboardingRows,
  currentUserId,
}: {
  agents: CrmUserRow[];
  onboardingRows: AgentOnboardingAdminRow[];
  currentUserId: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showAddAgent, setShowAddAgent] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [invitedEmail, setInvitedEmail] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  function runAction(fn: () => Promise<{ error?: string }>, onDone?: () => void) {
    setError(null);
    setSuccessMessage(null);
    startTransition(async () => {
      try {
        const result = await fn();
        if (result?.error) {
          setError(result.error);
          return;
        }
        onDone?.();
      } catch (err) {
        // Belt-and-suspenders: the actions this calls all return { error }
        // now instead of throwing (see the comment in actions.ts on why),
        // but this stays as a fallback for anything that throws
        // unexpectedly - Next.js redacts the message to a generic one in
        // production, which is still better than an unhandled rejection.
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  return (
    <div>
      {error && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {successMessage && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {successMessage}
        </div>
      )}

      {invitedEmail && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Invitation sent to {invitedEmail}. They can follow the link in that email to set a
          password and sign in.
        </div>
      )}

      <button
        type="button"
        onClick={() => setShowAddAgent((v) => !v)}
        className={buttonClasses}
      >
        {showAddAgent ? "Cancel" : "+ Add Agent"}
      </button>

      {showAddAgent && (
        <form
          action={(formData) => {
            const email = String(formData.get("email") ?? "");
            setInvitedEmail(null);
            runAction(
              () => inviteAgentAction(formData),
              () => {
                setShowAddAgent(false);
                setInvitedEmail(email);
              }
            );
          }}
          className="mt-4 space-y-3 rounded-2xl border border-slate-200 bg-[var(--crm-surface)] p-6"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input name="full_name" placeholder="Full name" required className={inputClasses} />
            <input name="email" type="email" placeholder="Email" required className={inputClasses} />
          </div>
          <p className="text-xs text-slate-500">
            Sends an email invitation with a secure link for the agent to set their own
            password — no password is set here. They&apos;ll automatically get the Agent role.
          </p>
          <button type="submit" disabled={isPending} className={buttonClasses}>
            Send Invitation
          </button>
        </form>
      )}

      <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200 bg-[var(--crm-surface)]">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Onboarding</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {agents.map((agent) => {
              const onboarding = onboardingRows.find((row) => row.agent_id === agent.id);
              return (
              <tr key={agent.id} className="border-b border-slate-100 last:border-0 align-top">
                {editingId === agent.id ? (
                  <td colSpan={6} className="px-4 py-4">
                    <form
                      action={(formData) =>
                        runAction(
                          () => updateAgentAction(agent.id, formData),
                          () => setEditingId(null)
                        )
                      }
                      className="flex flex-wrap items-center gap-3"
                    >
                      <input
                        name="full_name"
                        defaultValue={agent.full_name}
                        required
                        className={`${inputClasses} max-w-[200px]`}
                      />
                      <select name="role" defaultValue={agent.role} className={`${inputClasses} max-w-[140px]`}>
                        <option value="agent">Agent</option>
                        <option value="admin">Admin</option>
                      </select>
                      <label className="flex items-center gap-2 text-sm text-slate-700">
                        <input type="checkbox" name="active" defaultChecked={agent.active} />
                        Active
                      </label>
                      <button type="submit" disabled={isPending} className={buttonClasses}>
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="text-sm font-medium text-slate-500 hover:text-slate-700"
                      >
                        Cancel
                      </button>
                    </form>
                  </td>
                ) : (
                  <>
                    <td className="px-4 py-3 font-medium text-slate-900">{agent.full_name}</td>
                    <td className="px-4 py-3 text-slate-600">{agent.email}</td>
                    <td className="px-4 py-3 text-slate-600 capitalize">{agent.role}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                          agent.active ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {agent.active ? "Active" : "Deactivated"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {onboarding ? (
                        <div className="space-y-1">
                          <span className="font-semibold capitalize">{onboarding.status.replaceAll("_", " ")}</span>
                          <div>{onboarding.completed_required}/{onboarding.total_required} training</div>
                          {onboarding.quiz_score !== null && <div>Quiz: {onboarding.quiz_score}%</div>}
                        </div>
                      ) : <span>Existing account</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-3">
                        {onboarding?.status === "submitted" && (
                          <>
                            <button type="button" disabled={isPending} onClick={() => runAction(() => reviewAgentOnboardingAction(agent.id, "approved"), () => setSuccessMessage(`${agent.full_name} now has full CRM access.`))} className="text-xs font-semibold text-emerald-700">Approve</button>
                            <button type="button" disabled={isPending} onClick={() => { const note = prompt("What should the agent update?"); if (note) runAction(() => reviewAgentOnboardingAction(agent.id, "changes_requested", note), () => setSuccessMessage("Changes requested.")); }} className="text-xs font-semibold text-amber-700">Request changes</button>
                          </>
                        )}
                        {agent.role === "agent" && onboarding && onboarding.status !== "approved" && (
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => runAction(
                              () => resendAgentAccessEmailAction(agent.id),
                              () => setSuccessMessage(`A new access email was sent to ${agent.email}.`)
                            )}
                            className="text-xs font-semibold text-violet-700 hover:text-violet-800 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Resend access email
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setEditingId(agent.id)}
                          className="text-xs font-semibold text-sky-600 hover:text-sky-700"
                        >
                          Edit
                        </button>
                        {agent.id !== currentUserId && (
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => {
                              const name = agent.full_name || agent.email;
                              if (
                                !confirm(
                                  `Permanently remove ${name}'s login? Their leads and activity history will be kept but unassigned.`
                                )
                              ) {
                                return;
                              }
                              runAction(
                                () => removeAgentAction(agent.id),
                                () => setSuccessMessage(`${name} was removed.`)
                              );
                            }}
                            className="text-xs font-semibold text-rose-600 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </td>
                  </>
                )}
              </tr>
            );})}

            {agents.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  No agents yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
