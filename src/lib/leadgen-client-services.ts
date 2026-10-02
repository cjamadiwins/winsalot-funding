// Client "Products, Services & Pricing" (Lead Generation CRM): shared,
// framework-agnostic types, price formatting, input normalisation and ordering
// for the Admin client profile, the read-only agent view and the server actions
// (migration 20261002030000). No server-only / Supabase imports so everything
// here is unit-testable and usable from client components.

export const SERVICE_ENTRY_TYPES = ["service", "note"] as const;
export type ServiceEntryType = (typeof SERVICE_ENTRY_TYPES)[number];

export const PRICING_TYPES = ["starting_at", "fixed", "hourly", "monthly", "annual", "custom_quote"] as const;
export type PricingType = (typeof PRICING_TYPES)[number];

export const PRICING_TYPE_LABELS: Record<PricingType, string> = {
  starting_at: "Starting at",
  fixed: "Fixed price",
  hourly: "Hourly",
  monthly: "Monthly",
  annual: "Annual",
  custom_quote: "Custom quote",
};

export const SERVICE_CURRENCIES = ["CAD", "USD"] as const;

export type ClientServiceRow = {
  id: string;
  client_id: string;
  entry_type: ServiceEntryType;
  name: string;
  description: string | null;
  pricing_type: PricingType | null;
  price_amount: number | string | null;
  currency: string;
  plus_taxes: boolean;
  price_condition: string | null;
  included: string[];
  additional_costs: string[];
  technical_notes: string | null;
  sales_notes: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
};

export type ClientServiceHistoryRow = {
  id: string;
  service_id: string;
  change_type: "created" | "updated" | "price_changed" | "deactivated" | "reactivated";
  changed_at: string;
  changed_by: string | null;
  previous: Partial<ClientServiceRow> | null;
  snapshot: Partial<ClientServiceRow>;
};

export const HISTORY_LABELS: Record<ClientServiceHistoryRow["change_type"], string> = {
  created: "Created",
  updated: "Updated",
  price_changed: "Price changed",
  deactivated: "Deactivated",
  reactivated: "Reactivated",
};

// ---------------------------------------------------------------------
// Price display
// ---------------------------------------------------------------------
const CURRENCY_PREFIX: Record<string, string> = { CAD: "CA$", USD: "US$" };

export function formatMoneyAmount(amount: number | string, currency: string): string {
  const value = Number(amount);
  const hasCents = Math.round(value * 100) % 100 !== 0;
  const text = value.toLocaleString("en-US", { minimumFractionDigits: hasCents ? 2 : 0, maximumFractionDigits: 2 });
  const prefix = CURRENCY_PREFIX[currency] ?? `${currency} `;
  return `${prefix}${text}`;
}

// The ONE place a price is turned into text, so the Admin profile, the agent
// modal and every test show identical wording, e.g.
//   starting_at -> "Starting at CA$465 + applicable taxes"
//   monthly     -> "CA$10/month + applicable taxes"
export function formatServicePrice(service: Pick<ClientServiceRow, "entry_type" | "pricing_type" | "price_amount" | "currency" | "plus_taxes">): string | null {
  if (service.entry_type === "note" || !service.pricing_type) return null;
  if (service.pricing_type === "custom_quote") return "Custom quote";
  if (service.price_amount === null || service.price_amount === undefined || service.price_amount === "") return "Custom quote";
  const money = formatMoneyAmount(service.price_amount, service.currency);
  const suffix = { starting_at: "", fixed: "", hourly: "/hour", monthly: "/month", annual: "/year" }[service.pricing_type];
  const text = `${service.pricing_type === "starting_at" ? "Starting at " : ""}${money}${suffix}`;
  return service.plus_taxes ? `${text} + applicable taxes` : text;
}

// "Starting at" prices are never a final price - agents are reminded to say the
// final quote depends on scope.
export function isStartingAtPrice(service: Pick<ClientServiceRow, "pricing_type">): boolean {
  return service.pricing_type === "starting_at";
}

export const AGENT_PRICING_REMINDER =
  "Client-provided reference information. For “Starting at” services, don’t promise a final price: exact pricing depends on the scope and the client will provide the final quote.";

// ---------------------------------------------------------------------
// Ordering / filtering
// ---------------------------------------------------------------------
export function sortServices<T extends Pick<ClientServiceRow, "sort_order" | "created_at" | "name">>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at) || a.name.localeCompare(b.name));
}

export function activeServices<T extends Pick<ClientServiceRow, "is_active">>(rows: T[]): T[] {
  return rows.filter((row) => row.is_active);
}

// ---------------------------------------------------------------------
// Input normalisation (Admin form -> row fields)
// ---------------------------------------------------------------------
export type ServiceFormInput = {
  entry_type: string;
  name: string;
  description: string;
  pricing_type: string;
  price_amount: string;
  currency: string;
  plus_taxes: boolean;
  price_condition: string;
  included: string; // one per line
  additional_costs: string; // one per line
  technical_notes: string;
  sales_notes: string;
  is_active: boolean;
};

export type NormalizedService = {
  entry_type: ServiceEntryType;
  name: string;
  description: string | null;
  pricing_type: PricingType | null;
  price_amount: number | null;
  currency: string;
  plus_taxes: boolean;
  price_condition: string | null;
  included: string[];
  additional_costs: string[];
  technical_notes: string | null;
  sales_notes: string | null;
  is_active: boolean;
};

export const SERVICE_LIMITS = { name: 120, text: 2000, condition: 120, line: 300, lines: 30 } as const;

function trimmedOrNull(value: string, max: number): string | null {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, max) : null;
}

export function parseServiceLines(value: string): string[] {
  return String(value ?? "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter(Boolean)
    .slice(0, SERVICE_LIMITS.lines)
    .map((line) => line.slice(0, SERVICE_LIMITS.line));
}

export function normalizeServiceInput(input: ServiceFormInput): { error: string } | { value: NormalizedService } {
  const name = String(input.name ?? "").trim();
  if (!name) return { error: "A name is required." };
  if (name.length > SERVICE_LIMITS.name) return { error: `The name must be ${SERVICE_LIMITS.name} characters or fewer.` };

  const entryType = (SERVICE_ENTRY_TYPES as readonly string[]).includes(input.entry_type) ? (input.entry_type as ServiceEntryType) : null;
  if (!entryType) return { error: "Choose whether this is a service or a note." };

  const currency = String(input.currency ?? "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) return { error: "Enter a 3-letter currency code (e.g. CAD)." };

  let pricingType: PricingType | null = null;
  let amount: number | null = null;
  if (entryType === "service") {
    if (!(PRICING_TYPES as readonly string[]).includes(input.pricing_type)) return { error: "Choose a billing / pricing type." };
    pricingType = input.pricing_type as PricingType;
    if (pricingType !== "custom_quote") {
      const raw = String(input.price_amount ?? "").replace(/[$,\s]/g, "");
      if (!raw || !/^\d+(\.\d{1,2})?$/.test(raw)) return { error: "Enter the price as a number (e.g. 465 or 46.50)." };
      amount = Number(raw);
    }
  }

  return {
    value: {
      entry_type: entryType,
      name,
      description: trimmedOrNull(input.description, SERVICE_LIMITS.text),
      pricing_type: pricingType,
      price_amount: amount,
      currency,
      plus_taxes: Boolean(input.plus_taxes),
      price_condition: entryType === "service" ? trimmedOrNull(input.price_condition, SERVICE_LIMITS.condition) : null,
      included: parseServiceLines(input.included),
      additional_costs: parseServiceLines(input.additional_costs),
      technical_notes: trimmedOrNull(input.technical_notes, SERVICE_LIMITS.text),
      sales_notes: trimmedOrNull(input.sales_notes, SERVICE_LIMITS.text),
      is_active: Boolean(input.is_active),
    },
  };
}

export function serviceToFormInput(row?: ClientServiceRow | null): ServiceFormInput {
  return {
    entry_type: row?.entry_type ?? "service",
    name: row?.name ?? "",
    description: row?.description ?? "",
    pricing_type: row?.pricing_type ?? "starting_at",
    price_amount: row?.price_amount === null || row?.price_amount === undefined ? "" : String(Number(row.price_amount)),
    currency: row?.currency ?? "CAD",
    plus_taxes: row?.plus_taxes ?? true,
    price_condition: row?.price_condition ?? "",
    included: (row?.included ?? []).join("\n"),
    additional_costs: (row?.additional_costs ?? []).join("\n"),
    technical_notes: row?.technical_notes ?? "",
    sales_notes: row?.sales_notes ?? "",
    is_active: row?.is_active ?? true,
  };
}
