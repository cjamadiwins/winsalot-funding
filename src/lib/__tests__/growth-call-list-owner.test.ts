import { describe, expect, it } from "vitest";
import { GROWTH_CALL_LIST_OWNER } from "@/lib/growth-call-list-owner";

describe("Growth CRM fixed call-list owner", () => {
  it("uses Winsalot Corp as its canonical owner label", () => {
    expect(GROWTH_CALL_LIST_OWNER).toBe("Winsalot Corp");
  });
});
