export type ApprovedVoicemailRole = string | null | undefined;

const PHONE_BY_EMAIL: Record<string, string> = {
  "agent@winsalotcorp.com": "647-692-9444",
  "agent1@winsalotcorp.com": "647-692-9444",
  "agent2@winsalotcorp.com": "647-499-3706",
  "info@winsalotcorp.com": "647-557-9186",
};

const PHONE_BY_EXACT_NAME: Record<string, string> = {
  "henry osuji": "647-692-9444",
  "goodness ugbana": "647-499-3706",
  "c.j. amadi": "647-557-9186",
  "c.j amadi": "647-557-9186",
  "cj amadi": "647-557-9186",
};

export function getApprovedVoicemailPhone({
  email,
  fullName,
  role,
}: {
  email?: string | null;
  fullName?: string | null;
  role?: ApprovedVoicemailRole;
}): string | null {
  if (role === "admin") return "647-557-9186";

  const normalizedEmail = email?.trim().toLowerCase();
  const mappedByEmail = normalizedEmail ? PHONE_BY_EMAIL[normalizedEmail] : undefined;
  if (mappedByEmail) return mappedByEmail;

  const normalizedName = fullName?.trim().replace(/\s+/g, " ").toLowerCase();
  return normalizedName ? PHONE_BY_EXACT_NAME[normalizedName] ?? null : null;
}

export function buildApprovedVoicemailScript(name: string, phone: string): string {
  return `Hi, this is ${name} calling from Winsalot Corp.\n\nI was reaching out regarding your business and wanted to briefly connect with you.\n\nWhen you have a moment, please feel free to return my call at ${phone}.\n\nAgain, this is ${name} with Winsalot Corp. Thank you, and have a great day.`;
}
