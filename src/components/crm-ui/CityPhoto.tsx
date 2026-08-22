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
    <NextImage
      src={photo}
      alt={alt}
      priority={priority}
      className={className}
      sizes="(min-width: 640px) 45vw, 90vw"
    />
  );
}
