import { describe, expect, it } from "vitest";
import { fetchAllRows } from "../fetch-all-rows";

const table = Array.from({ length: 2500 }, (_, i) => ({ id: i }));
const page = (from: number, to: number) => Promise.resolve({ data: table.slice(from, to + 1), error: null });

describe("fetchAllRows", () => {
  it("returns every row past the 1000-row API cap", async () => {
    const { data, error } = await fetchAllRows<{ id: number }>(page);
    expect(error).toBeNull();
    expect(data).toHaveLength(2500);
    expect(new Set(data.map((r) => r.id)).size).toBe(2500);
  });

  it("stops cleanly when the last page is exactly full", async () => {
    const { data } = await fetchAllRows<{ id: number }>((from, to) => Promise.resolve({ data: table.slice(0, 2000).slice(from, to + 1), error: null }));
    expect(data).toHaveLength(2000);
  });

  it("surfaces an error instead of returning partial data as complete", async () => {
    const { error } = await fetchAllRows<{ id: number }>((from) =>
      from === 0 ? page(0, 999) : Promise.resolve({ data: null, error: { message: "boom" } })
    );
    expect(error?.message).toBe("boom");
  });
});
