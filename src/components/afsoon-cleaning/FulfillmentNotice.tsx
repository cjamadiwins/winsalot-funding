import { businessConfig } from "@/config/business";

export default function FulfillmentNotice({
  variant = "full",
}: {
  variant?: "full" | "compact";
}) {
  const { statement, responsibilities } = businessConfig.fulfillmentPartner;

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
      <p>{statement}</p>
      {variant === "full" && (
        <ul className="mt-3 list-disc space-y-1 pl-5">
          {responsibilities.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
