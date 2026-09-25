export type LeadgenNormalizedRole = "admin" | "agent" | "client";

export function normalizeLeadgenRole(value: unknown): LeadgenNormalizedRole | null {
  if (typeof value !== "string") return null;
  const role = value.trim().toLowerCase();
  return role === "admin" || role === "agent" || role === "client" ? role : null;
}

export function leadgenHomeForRole(role: LeadgenNormalizedRole): string {
  switch (role) {
    case "admin": return "/leadgen/admin";
    case "agent": return "/leadgen/agent";
    case "client": return "/client/dashboard";
  }
}
