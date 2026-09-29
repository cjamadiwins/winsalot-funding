import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../supabase-admin", () => ({ getSupabaseAdmin: () => ({}) }));

import { pickAttributionClient } from "../leadgen-agent-active-client";
import { formatStatusLabel } from "../leadgen-types";

const teknokraft = { id: "cl-tek", name: "Teknokraft Canada Inc." };
const hidebrandt = { id: "cl-hid", name: "Hidebrandt Web Services" };

describe("attribution hierarchy: explicit call list -> agent active client -> none", () => {
  it("an explicit call-list client always wins over the agent's active client", () => {
    // Henry's Agent Client Status says Teknokraft, but he opens a Hidebrandt list.
    expect(pickAttributionClient(hidebrandt, teknokraft)).toEqual({ source: "call_list", client: hidebrandt });
  });

  it("falls back to the agent's active client only when the list has no client", () => {
    expect(pickAttributionClient(null, teknokraft)).toEqual({ source: "agent_default", client: teknokraft });
    expect(pickAttributionClient(undefined, teknokraft)).toEqual({ source: "agent_default", client: teknokraft });
  });

  it("never guesses when neither exists", () => {
    expect(pickAttributionClient(null, null)).toEqual({ source: "none", client: null });
  });
});

describe("formatStatusLabel", () => {
  it("capitalizes stored statuses for display only", () => {
    expect(formatStatusLabel("active")).toBe("Active");
    expect(formatStatusLabel("paused")).toBe("Paused");
    expect(formatStatusLabel("not_started")).toBe("Not Started");
    expect(formatStatusLabel(null)).toBe("");
  });
});
