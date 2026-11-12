import type { ArtStyle, CardPlace } from "./types";

const ART: Record<ArtStyle, string> = {
  sunset:
    "linear-gradient(180deg, #f4b56a 0%, #e9825a 45%, #7a3f4f 46%, #4a2c45 100%)",
  sea: "linear-gradient(180deg, #9fd3d6 0%, #f3e2b8 55%, #3f7f6e 56%, #2b5a4f 100%)",
  brick:
    "linear-gradient(180deg, #f6d4a8 0%, #f09a6b 50%, #c2463c 51%, #7d2a2e 100%)",
};

export function PlaceArt({
  place,
  showPhoto,
  className = "",
}: {
  place: CardPlace;
  showPhoto: boolean;
  className?: string;
}) {
  if (showPhoto && place.photo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- static sample photos; no optimisation needed
      <img
        src={place.photo}
        alt={place.name}
        className={`block w-full object-cover ${className}`}
      />
    );
  }

  return <Art art={place.art} label={place.name} className={className} />;
}

/** The poster-style illustration used wherever there is no photo. */
export function Art({
  art,
  label,
  className = "",
}: {
  art: ArtStyle;
  label: string;
  className?: string;
}) {
  return (
    <span
      data-art={art}
      role="img"
      aria-label={label}
      className={`relative block w-full overflow-hidden ${className}`}
      style={{ background: ART[art] }}
    >
      <span className="absolute top-[22%] left-1/2 size-8 -translate-x-1/2 rounded-full bg-[rgb(255_244_214/0.9)]" />
    </span>
  );
}
