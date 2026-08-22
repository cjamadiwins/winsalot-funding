import NextImage from "next/image";
import torontoPhoto from "./city-photos/toronto.png";
import vancouverPhoto from "./city-photos/vancouver.png";
import northAmericaPhoto from "./city-photos/north-america.png";

// Real skyline photographs for the Client Local Time cards, keyed by the
// exact `${country}-${regionCode}-${city}` seed built in
// ClientLocalTimePanel.tsx - Toronto and Vancouver (the two default
// cities) get their own recognizable shot, every other CA/US city a
// user can pick via "Edit Locations" gets the generic North America
// skyline. Static imports so next/image can infer width/height and serve
// resized, modern-format (WebP/AVIF) variants automatically.
const CITY_PHOTOS = {
  "CA-ON-Toronto": torontoPhoto,
  "CA-BC-Vancouver": vancouverPhoto,
} as const;

// Fixed aspect ratio for every card's photo, whatever the source photo's own
// dimensions happen to be (the three underlying shots are all different
// sizes) - so every city card, Toronto/Vancouver's own shot or the North
// America fallback, occupies exactly the same width/height/ratio and the
// two cards in a row line up evenly. `fill` + `object-cover` (bound to this
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
  const photo = CITY_PHOTOS[seed as keyof typeof CITY_PHOTOS] ?? northAmericaPhoto;
  return (
    <div className={`relative aspect-[16/9] w-full overflow-hidden ${className ?? ""}`}>
      <NextImage
        src={photo}
        alt={alt}
        fill
        priority={priority}
        className="object-cover object-center"
        sizes="(min-width: 640px) 45vw, 90vw"
      />
    </div>
  );
}
