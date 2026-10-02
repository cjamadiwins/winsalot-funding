import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/leadgen/admin/(dashboard)/appointments/prep-actions", () => ({}));
import AppointmentBriefEmailModal from "@/app/leadgen/admin/(dashboard)/appointments/AppointmentBriefEmailModal";

const preview = {
  clientName: "Hidebrandt Web Services",
  recipients: [{ email: "orstio@gmail.com", name: "Theodore" }],
  prospect: "Capital Painters",
  when: "Monday, October 5, 2026 at 2:30 PM (America/Toronto)",
  subject: "Appointment Brief – Capital Painters",
  body: "Hi Theodore,\n\nHere is the preparation brief for your upcoming appointment with Capital Painters.",
};

describe("Send Appointment Brief review step", () => {
  const html = renderToStaticMarkup(<AppointmentBriefEmailModal preview={preview} resend={false} onCancel={vi.fn()} onSend={vi.fn()} />);

  it("shows client, client email, prospect, appointment date/time, subject and an editable body", () => {
    for (const text of ["Hidebrandt Web Services", "Theodore &lt;orstio@gmail.com&gt;", "Capital Painters", "Monday, October 5, 2026 at 2:30 PM (America/Toronto)", "Appointment Brief – Capital Painters", "Hi Theodore,"]) {
      expect(html).toContain(text);
    }
    expect(html).toContain("<textarea");
    expect(html).toContain("<input");
  });

  it("has Send and Cancel, and says the confirmation/reminders are not re-sent", () => {
    expect(html).toMatch(/>Send<\/button>/);
    expect(html).toMatch(/>Cancel<\/button>/);
    expect(html).toContain("not re-sent");
  });

  it("labels a repeat send as a re-send", () => {
    expect(renderToStaticMarkup(<AppointmentBriefEmailModal preview={preview} resend onCancel={vi.fn()} onSend={vi.fn()} />)).toContain("Re-send Appointment Brief");
  });
});
