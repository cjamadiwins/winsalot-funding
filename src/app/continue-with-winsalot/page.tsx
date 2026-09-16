import ContinueWithWinsalotClient from "./ContinueWithWinsalotClient";

export const dynamic = "force-dynamic";

// Public, unauthenticated Winsalot Growth CRM "next step" page -
// https://growth.winsalotcorp.com/continue-with-winsalot. For a prospect
// who already had a consultation and wants to move forward into client
// onboarding. Deliberately never renders any protected client data and
// never requires a session - a prospect isn't a CRM user yet. Link-ready
// for a future consultation follow-up email CTA (not wired up yet - see
// buildWinsalotFollowUpEmail in winsalot-consultation-emails.ts, left
// untouched in this change).
export default function ContinueWithWinsalotPage() {
  return <ContinueWithWinsalotClient />;
}
