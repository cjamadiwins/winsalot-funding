import Link from "next/link";
import type {
  WorkspaceCampaign,
  loadCampaignWorkspace,
} from "@/lib/leadgen-campaign-workspace";
import { WEBSITE_OPPORTUNITY_LABELS } from "@/lib/leadgen-website-opportunity";
import AgentCallLogClient from "@/components/call-log/AgentCallLogClient";
import type { CallLogRow } from "@/lib/call-log";

type Props = {
  campaigns: WorkspaceCampaign[];
  data: Awaited<ReturnType<typeof loadCampaignWorkspace>>;
  admin?: boolean;
  logCallAction?: (formData: FormData) => Promise<{ error?: string }>;
};
export default function CampaignWorkspace({
  campaigns,
  data,
  admin = false,
  logCallAction,
}: Props) {
  const base = admin ? "/leadgen/admin" : "/leadgen/agent";
  const labels: [keyof typeof data.stats, string][] = [
    ["total", "Assigned leads"],
    ["rebranding", "Leads with websites"],
    ["new_website", "Verified without websites"],
    ["verification_needed", "Website verification needed"],
    ["calls", "Calls made"],
    ["reached", "Contacts reached"],
    ["appointments", "Appointments booked"],
    ["followups", "Follow-ups due"],
    ["interested", "Interested prospects"],
  ];
  const names = new Map(campaigns.map((c) => [c.id, c.clientName]));
  const records = data.calls.map((c) => ({
    ...c,
    businessClient: names.get(c.campaign_id) ?? "Unknown client",
  })) as CallLogRow[];
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Campaign workspace</h1>
      <form className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 font-semibold" htmlFor="campaign">
          Client / Campaign
          <select
            id="campaign"
            name="campaign"
            defaultValue={data.selected?.id ?? ""}
            className="max-w-full rounded-lg border p-2"
          >
            <option value="">All authorized campaigns</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.clientName} — {c.name}
              </option>
            ))}
          </select>
        </label>
        <button className="rounded-lg bg-purple-700 px-4 py-2 font-semibold text-white">
          Open campaign
        </button>
      </form>
      <p className="text-sm text-slate-600">
        {data.selected
          ? `${data.selected.clientName} — ${data.selected.name}`
          : "Combined activity across authorized campaigns"}
        . Totals cover all recorded activity. Contacts reached counts distinct
        phone numbers with a conversation outcome, including gatekeepers.
      </p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {labels.map(([key, label]) => (
          <div key={key} className="rounded-xl border bg-white p-4">
            <p className="text-sm text-slate-600">{label}</p>
            <p className="text-2xl font-bold">{data.stats[key]}</p>
          </div>
        ))}
      </div>
      <section>
        <h2 className="text-lg font-bold">Assigned call lists</h2>
        <ul className="mt-2 space-y-2">
          {data.lists.map((s) => (
            <li key={s.id}>
              <Link
                className="text-purple-700 underline"
                href={`${base}/call-list-segments/${s.id}`}
              >
                {s.name}
              </Link>
            </li>
          ))}
        </ul>
        {!data.lists.length && (
          <p>No deployed call lists for this selection.</p>
        )}
      </section>
      <section>
        <h2 className="text-lg font-bold">
          Prospects and website opportunities
        </h2>
        <p className="text-sm text-slate-600">
          A supplied website is a redesign / SEO prospect, not a confirmed
          website defect. Blank or uncertain website fields require
          verification.
        </p>
        <div className="mt-3 max-h-96 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className="p-2">Business</th>
                <th className="p-2">Opportunity</th>
                <th className="p-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.leads.slice(0, 500).map((l) => (
                <tr key={l.id} className="border-t">
                  <td className="p-2">
                    <Link
                      className="text-purple-700 underline"
                      href={
                        l.leadId
                          ? `${base}/leads/${l.leadId}`
                          : `${base}/call-list-segments/${l.segmentId}`
                      }
                    >
                      {l.name}
                    </Link>
                  </td>
                  <td className="p-2">
                    {WEBSITE_OPPORTUNITY_LABELS[l.opportunity]}
                  </td>
                  <td className="p-2">{l.status ?? "New"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.leads.length > 500 && (
            <p className="p-2 text-sm text-slate-600">
              Showing the first 500 of {data.leads.length} leads. Open a call
              list above to see every lead.
            </p>
          )}
        </div>
      </section>
      <section>
        <h2 className="text-lg font-bold">Follow-ups due</h2>
        <ul>
          {data.followups.map((l) => (
            <li key={l.id} className="mt-2">
              <Link
                className="text-purple-700 underline"
                href={
                  l.leadId
                    ? `${base}/leads/${l.leadId}`
                    : `${base}/call-list-segments/${l.segmentId}`
                }
              >
                {l.name}
              </Link>{" "}
              — {l.callbackAt}
            </li>
          ))}
        </ul>
        {!data.followups.length && <p>No follow-ups due.</p>}
      </section>
      <section>
        <h2 className="text-lg font-bold">Appointments</h2>
        <div className="overflow-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className="p-2">Prospect / Contact</th>
                <th className="p-2">Date and time</th>
                <th className="p-2">Status / Notes</th>
              </tr>
            </thead>
            <tbody>
              {data.appointments.map((a) => (
                <tr key={a.id} className="border-t">
                  <td className="p-2">
                    {a.business_name}
                    <br />
                    {a.contact_name}
                    <br />
                    {a.phone}
                    <br />
                    {a.email}
                  </td>
                  <td className="p-2">
                    {a.appointment_date} {a.appointment_time}
                  </td>
                  <td className="whitespace-pre-wrap p-2">
                    {a.status}
                    <br />
                    {a.appointment_notes}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Link
          className="text-purple-700 underline"
          href={`${base}/appointments${data.selected ? `?client=${data.selected.client_id}&campaign=${data.selected.id}` : ""}`}
        >
          Manage appointments
        </Link>
      </section>
      {!admin && logCallAction && data.selected ? (
        <AgentCallLogClient
          key={data.selected.id}
          crmLabel={`${data.selected.clientName} — ${data.selected.name}`}
          records={records}
          createAction={logCallAction}
          businessClientField={{
            mode: "select",
            options: [
              { id: data.selected.client_id, name: data.selected.clientName },
            ],
            defaultId: data.selected.client_id,
          }}
        />
      ) : (
        <section>
          <h2 className="text-lg font-bold">Call activity</h2>
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th className="p-2">Business</th>
                  <th className="p-2">Result</th>
                  <th className="p-2">Saved at</th>
                  <th className="p-2">Notes</th>
                </tr>
              </thead>
              <tbody>
                {data.calls.map((c) => (
                  <tr key={c.id} className="border-t">
                    <td className="p-2">{c.business_name}</td>
                    <td className="p-2">{c.outcome}</td>
                    <td className="p-2">{c.created_at}</td>
                    <td className="p-2">{c.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
