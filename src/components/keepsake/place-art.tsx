import { placeKind, type CardPlace } from "./types";

/**
 * A place's photo. Where there is none, the back of a postcard: a postmark and
 * ruled lines, never a made-up picture.
 */
export function PlaceArt({
  place,
  showPhoto,
  className = "",
}: {
  place: Pick<CardPlace, "name" | "essentials" | "photo">;
  showPhoto: boolean;
  className?: string;
}) {
  if (showPhoto && place.photo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- static sample photos; no optimisation needed
      <img
        src={place.photo}
        alt={place.name}
        className={`block w-full rounded-[2px] object-cover outline outline-1 -outline-offset-1 outline-black/10 ${className}`}
      />
    );
  }

  const kind = placeKind(place);
  const longest = Math.max(...kind.split(" ").map((word) => word.length));

  return (
    <span
      data-qa="postcard-back"
      role="img"
      aria-label={`${place.name}. No photo yet`}
      className={`relative block w-full overflow-hidden rounded-[2px] bg-stamp-paper ${className}`}
    >
      <span className="absolute inset-x-[12%] bottom-[16%] h-px bg-ink/15 shadow-[0_10px_0_rgb(29_26_22/0.15),0_-10px_0_rgb(29_26_22/0.15)]" />
      <span className="absolute top-1/2 left-[44%] sm:left-1/2 aspect-square h-[46%] max-h-24 min-h-9 -translate-x-1/2 -translate-y-[62%] -rotate-12 rounded-full border-[1.5px] border-stamp/70 text-stamp/80 outline outline-1 outline-offset-2 outline-stamp/60 [container-type:size]">
        {/* Sized from the longest word so it stays inside the ring (about 70% of the ring). */}
        <span
          className="grid h-full place-items-center px-[14%] text-center font-mono leading-tight tracking-[0.06em] uppercase"
          style={{
            fontSize: `min(10px, ${(70 / (longest * 0.66)).toFixed(1)}cqw)`,
          }}
        >
          {kind}
        </span>
      </span>
    </span>
  );
}
