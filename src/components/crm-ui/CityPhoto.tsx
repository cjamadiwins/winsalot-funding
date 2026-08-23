"use client";

import { useEffect, useState } from "react";
import NextImage from "next/image";
import vancouverPhoto from "./city-photos/vancouver.png";
import northAmericaPhoto from "./city-photos/north-america.png";

// Real skyline photographs for the Client Local Time cards, keyed by the
// exact `${country}-${regionCode}-${city}` seed built in
// ClientLocalTimePanel.tsx - Vancouver (one of the two default cities) gets
// its own recognizable shot, every other CA/US city a user can pick via
// "Edit Locations" gets the generic North America skyline. Toronto (the
// other default city) instead rotates through TORONTO_PHOTOS below - see
// TorontoPhotoRotation. Static imports so next/image can infer
// width/height and serve resized, modern-format (WebP/AVIF) variants
// automatically.
const CITY_PHOTOS = {
  "CA-BC-Vancouver": vancouverPhoto,
} as const;

const TORONTO_SEED = "CA-ON-Toronto";

// The 8 Toronto shots living in `public/`, referenced by their exact
// on-disk filenames (encodeURI escapes the spaces for a valid <img> src).
// Rotation order is arbitrary - any order satisfies "cycle through all 8".
const TORONTO_PHOTOS = [
  "Toronto Harbourfront with CN Tower.png",
  "Toronto Islands Skyline with CN Tower.png",
  "Nathan Phillips Square reflections in Toronto.png",
  "Elegant Toronto Yorkville Streetscape in Toronto.png",
  "Sunny Kensington Market street scene in Toronto.png",
  "Market in Toronto.png",
  "Scarborough Bluffs by Lake Ontario in Toronto.png",
  "Scarborough Bluffs by Lake Ontario.png",
].map((filename) => encodeURI(`/${filename}`));

// How long each Toronto photo stays on screen before the next one fades in.
const TORONTO_PHOTO_INTERVAL_MS = 60 * 1000;

// Cross-fades through all of TORONTO_PHOTOS, looping back to the first
// after the last. All 8 images are mounted at once, stacked in the same
// spot via `fill`, with only the current one at full opacity - the CSS
// opacity transition below is what makes the change a fade instead of a
// hard cut. A single setInterval (cleared on unmount) advances the index;
// nothing here touches the clock/weather state one level up.
function TorontoPhotoRotation({ alt, priority }: { alt: string; priority?: boolean }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setIndex((current) => (current + 1) % TORONTO_PHOTOS.length);
    }, TORONTO_PHOTO_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      {TORONTO_PHOTOS.map((src, i) => (
        <NextImage
          key={src}
          src={src}
          alt={alt}
          fill
          priority={priority && i === 0}
          className={`object-cover object-center transition-opacity duration-1000 ease-in-out ${
            i === index ? "opacity-100" : "opacity-0"
          }`}
          sizes="(min-width: 640px) 45vw, 90vw"
        />
      ))}
    </>
  );
}

// Fixed aspect ratio for every card's photo, whatever the source photo's own
// dimensions happen to be (the underlying shots are all different sizes) -
// so every city card, Toronto/Vancouver's own shot or the North America
// fallback, occupies exactly the same width/height/ratio and the two cards
// in a row line up evenly. `fill` + `object-cover` (bound to this
// fixed-ratio wrapper, not the image's intrinsic size) crops to fill that
// box without stretching, centered on both axes.
export default function CityPhoto({
  seed,
  alt,
  priority,
  className,
}: {
  seed: string;
  alt: string;
  priority?: boolean;
  className?: string;
}) {
  return (
    <div className={`relative aspect-[16/9] w-full overflow-hidden ${className ?? ""}`}>
      {seed === TORONTO_SEED ? (
        <TorontoPhotoRotation alt={alt} priority={priority} />
      ) : (
        <NextImage
          src={CITY_PHOTOS[seed as keyof typeof CITY_PHOTOS] ?? northAmericaPhoto}
          alt={alt}
          fill
          priority={priority}
          className="object-cover object-center"
          sizes="(min-width: 640px) 45vw, 90vw"
        />
      )}
    </div>
  );
}
