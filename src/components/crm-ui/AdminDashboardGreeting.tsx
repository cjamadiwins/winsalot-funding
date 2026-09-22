"use client";

import { useEffect, useState } from "react";

function greetingForCurrentLocalTime() {
  const hour = new Date().getHours();

  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
}

export default function AdminDashboardGreeting() {
  const [greeting, setGreeting] = useState("Good Morning");

  useEffect(() => {
    const updateGreeting = () => setGreeting(greetingForCurrentLocalTime());

    updateGreeting();
    const timer = window.setInterval(updateGreeting, 60_000);

    return () => window.clearInterval(timer);
  }, []);

  return <>{greeting}, Winsalot Corp.</>;
}
