"use client";

// Renders the Canadian or U.S. flag as a real SVG, not a Unicode flag
// emoji - Windows' Chrome/Edge has no OS-level flag-emoji font and falls
// back to rendering the two-letter Unicode region indicator as plain text
// ("CA", "US") instead of a flag, so emoji can't be used here if the flag
// needs to look like a flag on every platform. `country-flag-icons` ships
// each flag as its own small, self-contained SVG source file (no network
// fetch, no external image host), so only the two flags actually used
// here (CA, US) end up in the client bundle.
import { CA, US } from "country-flag-icons/react/3x2";
import type { LocationCountry } from "@/lib/timezone-locations";

const FLAG_COMPONENTS: Record<LocationCountry, typeof CA> = { CA, US };
const FLAG_TITLES: Record<LocationCountry, string> = { CA: "Canada", US: "United States" };

export default function FlagIcon({ country, className }: { country: LocationCountry; className?: string }) {
  const Flag = FLAG_COMPONENTS[country];
  return (
    <Flag
      title={FLAG_TITLES[country]}
      className={`block shrink-0 rounded-[3px] ring-1 ring-black/10 ${className ?? ""}`}
    />
  );
}
