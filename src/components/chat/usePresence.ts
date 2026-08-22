"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

// A simple, accurate online indicator: every chat page tracks its own
// user's id on one shared Presence channel, and Presence's sync event
// always reflects exactly who currently has an open socket on it - no
// heuristics or "last seen N minutes ago" guessing, which is why this is
// safe to build ("show a simple online indicator only if it can be
// implemented accurately").
export function usePresenceOnlineUsers(supabase: SupabaseClient, userId: string, channelName: string): Set<string> {
  const [online, setOnline] = useState<Set<string>>(new Set());

  useEffect(() => {
    const channel = supabase.channel(channelName, {
      config: { presence: { key: userId } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        setOnline(new Set(Object.keys(channel.presenceState())));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ online_at: new Date().toISOString() });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, userId, channelName]);

  return online;
}
