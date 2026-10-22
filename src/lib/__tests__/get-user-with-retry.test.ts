import { describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";
import { getUserWithRetry } from "../get-user-with-retry";

const user = { id: "u1" } as User;
const never = () => new Promise<never>(() => {});
const db = (...calls: Array<() => Promise<unknown>>) => {
  const getUser = vi.fn();
  calls.forEach((c) => getUser.mockImplementationOnce(c));
  return { auth: { getUser } } as never;
};

describe("getUserWithRetry", () => {
  it("returns the verified user without retrying", async () => {
    const client = db(async () => ({ data: { user } }));
    expect((await getUserWithRetry(client, "/x", 20, 2)).data.user).toBe(user);
    expect((client as never as { auth: { getUser: ReturnType<typeof vi.fn> } }).auth.getUser).toHaveBeenCalledTimes(1);
  });
  it("recovers when only the first attempt is slow", async () => {
    const client = db(never, async () => ({ data: { user } }));
    expect((await getUserWithRetry(client, "/x", 20, 2)).data.user).toBe(user);
  });
  it("recovers when the first attempt throws", async () => {
    const client = db(async () => { throw new Error("boom"); }, async () => ({ data: { user } }));
    expect((await getUserWithRetry(client, "/x", 20, 2)).data.user).toBe(user);
  });
  it("still fails closed when every attempt is slow or throws", async () => {
    const client = db(never, async () => { throw new Error("boom"); });
    expect((await getUserWithRetry(client, "/x", 20, 2)).data.user).toBeNull();
  });
  it("passes through a genuine signed-out result", async () => {
    const client = db(async () => ({ data: { user: null } }));
    expect((await getUserWithRetry(client, "/x", 20, 2)).data.user).toBeNull();
  });
});
