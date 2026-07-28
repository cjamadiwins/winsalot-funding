"use client";

import { useState, useTransition } from "react";
import { LEADGEN_ROLES, type LeadgenClientRow, type LeadgenRole, type LeadgenUserRow } from "@/lib/leadgen-types";
import { inviteLeadgenUserAction, removeLeadgenUserAction, updateLeadgenUserAction } from "../actions";

const inputClass = "w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-[14px] text-slate-900";

type Performance = { leads: number; calls: number; appointments: number; completed: number };

export default function AgentsClient({
  users,
  clients,
  performanceByAgent,
}: {
  users: LeadgenUserRow[];
  clients: LeadgenClientRow[];
  performanceByAgent: Record<string, Performance>;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteRole, setInviteRole] = useState<LeadgenRole>("agent");
  const [editingId, setEditingId] = useState<string | null>(null);

  const clientById = new Map(clients.map((c) => [c.id, c]));

  function runAction(fn: () => Promise<{ error?: string } | void>, onSuccess?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result && "error" in result && result.error) setError(result.error);
      else onSuccess?.();
    });
  }

  return (
    <div>
      <div className="mt-6 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">All Users ({users.length})</h2>
        <button type="button" onClick={() => setShowInvite((v) => !v)} className="rounded-full bg-sky-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-sky-700">
          {showInvite ? "Cancel" : "+ Invite User"}
        </button>
      </div>

      {error && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {showInvite && (
        <form
          action={(formData) => runAction(() => inviteLeadgenUserAction(formData), () => setShowInvite(false))}
          className="mt-4 grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-2"
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-slate-600">Full Name</span>
            <input name="full_name" required className={inputClass} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-slate-600">Email</span>
            <input name="email" type="email" required className={inputClass} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-slate-600">Role</span>
            <select name="role" value={inviteRole} onChange={(e) => setInviteRole(e.target.value as LeadgenRole)} className={inputClass}>
              {LEADGEN_ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </label>
          {inviteRole === "client" && (
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold text-slate-600">Client Workspace</span>
              <select name="client_id" required className={inputClass} defaultValue="">
                <option value="" disabled>
                  Select a client…
                </option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <p className="text-[12.5px] text-slate-500 sm:col-span-2">
            An invite email is sent immediately - the recipient sets their own password via that link.
          </p>
          <button type="submit" disabled={isPending} className="rounded-full bg-sky-600 px-5 py-2.5 text-[14px] font-semibold text-white hover:bg-sky-700 sm:col-span-2 sm:w-fit">
            {isPending ? "Sending Invite…" : "Send Invite"}
          </button>
        </form>
      )}

      <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[760px] text-left text-[13.5px]">
          <thead>
            <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase text-slate-500">
              <th className="p-3">Name</th>
              <th className="p-3">Email</th>
              <th className="p-3">Role</th>
              <th className="p-3">Client</th>
              <th className="p-3">Performance</th>
              <th className="p-3">Status</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const perf = performanceByAgent[user.id];
              return (
                <tr key={user.id} className="border-b border-slate-100">
                  <td className="p-3 font-medium text-slate-900">
                    {editingId === user.id ? (
                      <form
                        id={`edit-${user.id}`}
                        action={(formData) => runAction(() => updateLeadgenUserAction(user.id, formData), () => setEditingId(null))}
                      >
                        <input name="full_name" defaultValue={user.full_name} className="w-full rounded border border-slate-300 px-2 py-1 text-[13px]" />
                      </form>
                    ) : (
                      user.full_name
                    )}
                  </td>
                  <td className="p-3 text-slate-600">{user.email}</td>
                  <td className="p-3 capitalize text-slate-600">{user.role}</td>
                  <td className="p-3 text-slate-600">{user.client_id ? clientById.get(user.client_id)?.name ?? "—" : "—"}</td>
                  <td className="p-3 text-slate-600">
                    {user.role === "agent" && perf
                      ? `${perf.leads} leads · ${perf.calls} calls · ${perf.appointments} appts`
                      : "—"}
                  </td>
                  <td className="p-3">
                    {editingId === user.id ? (
                      <label className="flex items-center gap-1.5 text-[12.5px]">
                        <input type="checkbox" form={`edit-${user.id}`} name="active" defaultChecked={user.active} />
                        Active
                      </label>
                    ) : (
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${user.active ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"}`}>
                        {user.active ? "Active" : "Inactive"}
                      </span>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex gap-2.5">
                      {editingId === user.id ? (
                        <>
                          <button type="submit" form={`edit-${user.id}`} disabled={isPending} className="text-[12px] font-semibold text-sky-600">
                            Save
                          </button>
                          <button type="button" onClick={() => setEditingId(null)} className="text-[12px] font-semibold text-slate-500">
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button type="button" onClick={() => setEditingId(user.id)} className="text-[12px] font-semibold text-sky-600">
                            Edit
                          </button>
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => {
                              if (confirm(`Remove ${user.full_name}'s login? This cannot be undone.`)) {
                                runAction(() => removeLeadgenUserAction(user.id));
                              }
                            }}
                            className="text-[12px] font-semibold text-rose-600"
                          >
                            Remove
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
