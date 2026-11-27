import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import SalesBonusAdminSection from "@/components/payroll/SalesBonusAdminSection";
import SalesBonusAgentSection from "@/components/payroll/SalesBonusAgentSection";
import PayrollCostSummary from "@/components/payroll/PayrollCostSummary";
import type { AgentSalesBonusRow, SalesBonusRow } from "@/lib/sales-bonus";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/sales-bonus-actions", () => ({
  approveSalesBonusAction: vi.fn(),
  markSalesBonusPaidAction: vi.fn(),
  recordSalesBonusClientPaymentAction: vi.fn(),
  voidSalesBonusAction: vi.fn(),
}));

const row = (o: Partial<SalesBonusRow>): SalesBonusRow => ({
  id: "b", created_at: "2026-10-20T12:00:00Z", appointment_id: "a", lead_id: "l", client_id: "c", agent_id: "ag", agent_name: "Henry Agent", agent_email: "h@x.com",
  client_name: "Teknokraft Canada Inc.", business_name: "Roofing Co", appointment_date: "2026-10-20", funding_model: "client_funded", accounting_treatment: "client_receivable",
  bonus_amount: "50.00", currency: "CAD", sale_confirmed_by_name: "Admin", sale_confirmed_at: "2026-10-21T12:00:00Z", sale_notes: null,
  client_payment_status: "receivable", client_payment_date: null, client_payment_reference: null, agent_payment_status: "pending", approved_by_name: null, approved_at: null,
  payroll_payday: null, paid_by_name: null, paid_at: null, payment_date: null, payment_reference: null, void_reason: null, ...o,
});

describe("payroll dashboard bonus section", () => {
  const html = renderToStaticMarkup(
    <SalesBonusAdminSection
      paydays={["2026-11-06"]}
      rows={[
        row({ id: "1" }),
        row({ id: "2", client_name: "Hidebrandt Web Services", funding_model: "winsalot_funded", accounting_treatment: "winsalot_bonus_expense", client_payment_status: "not_applicable", agent_payment_status: "approved", payroll_payday: "2026-11-06", approved_by_name: "Admin", approved_at: "2026-10-22T00:00:00Z" }),
        row({ id: "3", agent_payment_status: "paid", payment_date: "2026-10-28", payment_reference: "E-TRF-1", payroll_payday: "2026-11-06" }),
      ]}
    />
  );
  it("shows pending, approved and paid bonuses with client receivable and bonus expense totals", () => {
    expect(html).toContain("Pending approval");
    expect(html).toContain("Approved, unpaid");
    expect(html).toContain("Paid to agents");
    expect(html).toContain("Client receivable (Teknokraft)");
    expect(html).toContain("Winsalot bonus expense (Hidebrandt)");
    expect(html).toContain("CA$50.00");
    expect(html).toContain("E-TRF-1");
  });
  it("offers Approve only when pending and Mark paid only when approved", () => {
    expect(html.match(/>Approve</g)).toHaveLength(1);
    expect(html.match(/>Mark paid</g)).toHaveLength(1);
  });
  it("tracks the client leg separately", () => {
    expect(html).toContain("Client receivable outstanding");
    expect(html).toContain("No client leg");
  });
});

describe("agent bonus view", () => {
  const bonuses: AgentSalesBonusRow[] = [
    { id: "1", sale_confirmed_at: "2026-10-21T12:00:00Z", business_name: "Roofing Co", client_name: "Teknokraft Canada Inc.", appointment_date: "2026-10-20", bonus_amount: "50.00", currency: "CAD", agent_payment_status: "approved", payroll_payday: "2026-11-06", payment_date: null, payment_reference: null },
  ];
  it("shows the agent's earned bonus and status but nothing about client billing", () => {
    const html = renderToStaticMarkup(<SalesBonusAgentSection bonuses={bonuses} />);
    expect(html).toContain("Roofing Co");
    expect(html).toContain("CA$50.00");
    expect(html).toContain("Approved - awaiting payment");
    expect(html).not.toMatch(/receivable|funded|expense/i);
  });
  it("has a friendly empty state", () => {
    expect(renderToStaticMarkup(<SalesBonusAgentSection bonuses={[]} />)).toContain("No sales conversion bonuses yet");
  });
});

describe("payroll cost summary", () => {
  it("adds bonuses to the combined cost without changing employee payroll", () => {
    const html = renderToStaticMarkup(<PayrollCostSummary employeeTotals={{ NGN: 100 }} subcontractorTotals={{}} salesBonusTotals={{ CAD: 150 }} />);
    expect(html).toContain("Sales Conversion Bonuses");
    expect(html).toContain("CAD");
    const without = renderToStaticMarkup(<PayrollCostSummary employeeTotals={{ NGN: 100 }} subcontractorTotals={{}} />);
    expect(without).toContain("Employee / Agent Payroll");
    expect(without).not.toContain(">CAD<");
  });
});
