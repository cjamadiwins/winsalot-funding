import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import ClientServicesModal from "@/components/leadgen/client-services/ClientServicesModal";
import ClientServicesButton from "@/components/leadgen/client-services/ClientServicesButton";
import ClientServicesAdminPanel from "@/components/leadgen/client-services/ClientServicesAdminPanel";
import type { ClientServiceRow } from "@/lib/leadgen-client-services";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const base = {
  client_id: "hide",
  entry_type: "service",
  description: null,
  plus_taxes: true,
  price_condition: null,
  included: [],
  additional_costs: [],
  technical_notes: null,
  sales_notes: null,
  is_active: true,
  created_at: "2026-10-02T00:00:00Z",
  created_by: null,
  updated_at: "2026-10-02T00:00:00Z",
  updated_by: null,
  currency: "CAD",
} as const;
const row = (o: Partial<ClientServiceRow>) => ({ ...base, id: o.name, sort_order: 10, pricing_type: null, price_amount: null, ...o }) as unknown as ClientServiceRow;

const hidebrandt: ClientServiceRow[] = [
  row({ name: "Brochure-Style Website", pricing_type: "starting_at", price_amount: 465, sort_order: 10, included: ["Up to 15 pages"] }),
  row({ name: "E-commerce Website", pricing_type: "starting_at", price_amount: 1395, sort_order: 20, additional_costs: ["Plugins", "Payment-provider integrations", "Shipping-provider integrations"] }),
  row({ name: "Website Hosting", pricing_type: "monthly", price_amount: 10, sort_order: 30, price_condition: "Two-year signup" }),
  row({ name: "Domain + SSL", pricing_type: "annual", price_amount: 50, sort_order: 40 }),
  row({ name: "Custom Development / Custom Work", pricing_type: "hourly", price_amount: 46.5, sort_order: 50 }),
  row({ name: "Old Service", pricing_type: "fixed", price_amount: 99, sort_order: 60, is_active: false }),
];

describe("agent read-only modal", () => {
  const html = renderToStaticMarkup(<ClientServicesModal clientName="Hidebrandt Web Services" services={hidebrandt} onClose={vi.fn()} />);
  it("shows exact price strings and the Starting-at reminder", () => {
    for (const s of ["Starting at CA$465 + applicable taxes", "Starting at CA$1,395 + applicable taxes", "CA$10/month + applicable taxes", "CA$50/year + applicable taxes", "CA$46.50/hour + applicable taxes"]) expect(html).toContain(s);
    expect(html).toContain("don’t promise a final price");
    expect(html).toContain("Payment-provider integrations");
  });
  it("has no inputs or edit controls and hides inactive entries", () => {
    expect(html).not.toMatch(/<input|<textarea|<select/);
    expect(html).not.toMatch(/Deactivate|Edit|Save/);
    expect(html).not.toContain("Old Service");
  });
});

describe("button", () => {
  it("renders nothing for a client with no active entries", () => {
    expect(renderToStaticMarkup(<ClientServicesButton clientName="Teknokraft" services={[]} />)).toBe("");
    expect(renderToStaticMarkup(<ClientServicesButton clientName="X" services={[hidebrandt[5]]} />)).toBe("");
  });
  it("renders the action when entries exist", () => {
    expect(renderToStaticMarkup(<ClientServicesButton clientName="H" services={hidebrandt} />)).toContain("View Client Services");
  });
});

describe("admin panel", () => {
  const actions = { save: vi.fn(), setActive: vi.fn(), move: vi.fn() };
  it("lists every entry including inactive, with prices", () => {
    const html = renderToStaticMarkup(<ClientServicesAdminPanel clientId="hide" services={hidebrandt} history={[]} userNames={{}} actions={actions} />);
    expect(html).toContain("Starting at CA$465 + applicable taxes");
    expect(html).toContain("CA$46.50/hour + applicable taxes");
    expect(html).toContain("Old Service");
    expect(html).toMatch(/Deactivate/);
  });
  it("shows an empty state for a client with no entries", () => {
    const html = renderToStaticMarkup(<ClientServicesAdminPanel clientId="tek" services={[]} history={[]} userNames={{}} actions={actions} />);
    expect(html).not.toContain("CA$465");
  });
});
