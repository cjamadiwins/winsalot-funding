"use client";

import { useEffect, useState } from "react";
import NextImage, { type StaticImageData } from "next/image";
import vancouverPhoto from "./city-photos/vancouver.png";

// Real skyline photographs for the Client Local Time cards, keyed by the
// exact `${country}-${regionCode}-${city}` seed built in
// ClientLocalTimePanel.tsx - Toronto and Vancouver (the two default
// cities) each rotate through their own dedicated set of shots
// (TORONTO_PHOTOS / VANCOUVER_PHOTOS below, via PhotoRotation). Every
// other CA/US city a user can pick via "Edit Locations" has no dedicated
// collection, so it instead rotates through the generic
// NORTH_AMERICA_PHOTOS - the photo is purely decorative background and
// never implies a specific city; the city name shown under it always
// comes from the selected location itself, never from the photo.
const TORONTO_SEED = "CA-ON-Toronto";
const VANCOUVER_SEED = "CA-BC-Vancouver";

type PhotoSource = string | StaticImageData;

// The Toronto shots living in `public/`, referenced by their exact
// on-disk filenames (encodeURI escapes the spaces for a valid <img> src).
// Rotation order is arbitrary - any order satisfies "cycle through all of
// them".
const TORONTO_PHOTOS: PhotoSource[] = [
  "Toronto Harbourfront with CN Tower.png",
  "Toronto Islands Skyline with CN Tower.png",
  "Nathan Phillips Square reflections in Toronto.png",
  "Elegant Toronto Yorkville Streetscape in Toronto.png",
  "Sunny Kensington Market street scene in Toronto.png",
  "Market in Toronto.png",
  "Scarborough Bluffs by Lake Ontario in Toronto.png",
  "Scarborough Bluffs by Lake Ontario.png",
  "Casa Loma Gardens and Toronto Skyline.png",
  "Sunlit Toronto Distillery District.png",
].map((filename) => encodeURI(`/${filename}`));

// The original Vancouver static import stays first in the rotation, followed
// by the newly uploaded shots living in `public/` (same encodeURI handling
// as Toronto's, for the filenames with spaces).
const VANCOUVER_PHOTOS: PhotoSource[] = [
  vancouverPhoto,
  ...[
    "Beach in Vancouver.png",
    "Beach 2 in Vancouver.png",
    "Vancouver Skyline so nice.png",
    "Vancouver Skyline 2.png",
    "Vancouver Skyline from Queen Elizabeth Park.png",
    "Vancouver Again.png",
    "Vancouver Green land 1.png",
    "Vacouver Green land 2.png",
  ].map((filename) => encodeURI(`/${filename}`)),
];

// The 8 generic North America shots living in `public/`, shared by every
// selected CA/US city that has no dedicated collection of its own.
const NORTH_AMERICA_PHOTOS: PhotoSource[] = [
  "Montreal skyline from the Saint Lawrence.png",
  "North America 1.png",
  "North America 2.png",
  "North America 3.png",
  "North America 4.png",
  "North America 5.png",
  "North America 6.png",
  "North America 8.png",
].map((filename) => encodeURI(`/${filename}`));

// How long each photo stays on screen before the next one fades in.
const PHOTO_ROTATION_INTERVAL_MS = 60 * 1000;

// Cross-fades through a fixed list of photos, looping back to the first
// after the last. All photos are mounted at once, stacked in the same
// spot via `fill`, with only the current one at full opacity - the CSS
// opacity transition below is what makes the change a fade instead of a
// hard cut. A single setInterval (cleared on unmount) advances the index;
// nothing here touches the clock/weather state one level up. Shared by
// the Toronto, Vancouver, and North America rotations below.
function PhotoRotation({ photos, alt, priority }: { photos: PhotoSource[]; alt: string; priority?: boolean }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setIndex((current) => (current + 1) % photos.length);
    }, PHOTO_ROTATION_INTERVAL_MS);
    return () => clearInterval(id);
  }, [photos.length]);

  return (
    <>
      {photos.map((src, i) => (
        <NextImage
          key={typeof src === "string" ? src : src.src}
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
// so every city card, whichever rotation it's showing, occupies exactly the
// same width/height/ratio and the two cards in a row line up evenly. `fill`
// + `object-cover` (bound to this fixed-ratio wrapper, not the image's
// intrinsic size) crops to fill that box without stretching, centered on
// both axes.
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
        <PhotoRotation photos={TORONTO_PHOTOS} alt={alt} priority={priority} />
      ) : seed === VANCOUVER_SEED ? (
        <PhotoRotation photos={VANCOUVER_PHOTOS} alt={alt} priority={priority} />
      ) : (
        <PhotoRotation photos={NORTH_AMERICA_PHOTOS} alt={alt} priority={priority} />
      )}
    </div>
  );
}
