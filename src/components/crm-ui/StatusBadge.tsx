// Small color-coded pill used for email delivery status (and reusable
// anywhere else a single-word status needs the same treatment). Callers
// own the label/className pair - this component is purely presentational
// so each domain (crm-types.ts, leadgen-types.ts, ...) keeps its own
// status -> {label, className} map instead of this component knowing
// about every status that exists across the app.
export default function StatusBadge({ label, className }: { label: string; className: string }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ${className}`}>
      {label}
    </span>
  );
}
