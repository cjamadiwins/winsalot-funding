// Shared SMS consent notice text, shown beneath every "Book Appointment"
// button/link and booking form on both CRMs (public and staff-facing
// alike) now that there's no separate opt-in checkbox - booking with a
// valid phone number is itself the consent event, disclosed here.
// Deliberately NOT `import "server-only"` - both client components (the
// booking forms) and server code need this exact same string, and a
// server-only module can never be imported from a "use client" file.
export const SMS_CONSENT_NOTICE =
  "By booking an appointment, you agree to receive automated appointment reminder texts from Winsalot Corp. Message and data rates may apply. Reply STOP to opt out.";
