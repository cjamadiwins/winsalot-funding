import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import BookingReviewQueue from "../../app/leadgen/admin/(dashboard)/appointments/BookingReviewQueue";

const campaigns = [
  { id: "tek-snow", client_id: "tek", name: "Toronto Snow Removal" },
  { id: "hid-win", client_id: "hid", name: "Winnipeg Pet Care" },
];

describe("Admin 'Needs review' panel", () => {
  it("renders nothing when there is nothing to review", () => {
    expect(renderToStaticMarkup(<BookingReviewQueue needsCampaign={[]} queueItems={[]} clientNameById={{}} campaigns={campaigns} />)).toBe("");
  });

  it("lists a campaign-less appointment with only its own client's campaigns to choose from", () => {
    const html = renderToStaticMarkup(
      <BookingReviewQueue
        needsCampaign={[{ id: "a1", client_id: "tek", business_name: "Paws & Co", contact_name: "Pat", email: "pat@pets.ca", appointment_date: "2026-10-20", appointment_time: "10:00:00", timezone: "America/Toronto" }]}
        queueItems={[]}
        clientNameById={{ tek: "Teknokraft Canada Inc." }}
        campaigns={campaigns}
      />
    );
    expect(html).toContain("Needs review (1)");
    expect(html).toContain("Paws &amp; Co");
    expect(html).toContain("Toronto Snow Removal");
    expect(html).not.toContain("Winnipeg Pet Care");
    expect(html).toContain("Select a campaign…");
    expect(html).toContain("Assign campaign");
  });

  it("lists an unmatched Calendly booking with resolve/dismiss controls", () => {
    const html = renderToStaticMarkup(
      <BookingReviewQueue
        needsCampaign={[]}
        queueItems={[{ id: "q1", created_at: "2026-10-13T16:00:00Z", reason: "client_not_matched", contact_name: "Pat", contact_email: "pat@pets.ca", contact_phone: null, business_name: "Paws", appointment_start: "2026-10-20T15:00:00Z", client_id: null }]}
        clientNameById={{}}
        campaigns={campaigns}
      />
    );
    expect(html).toContain("Could not be matched to a client");
    expect(html).toContain("Mark resolved");
    expect(html).toContain("Dismiss");
  });
});
