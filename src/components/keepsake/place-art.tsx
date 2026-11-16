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
        className={`block w-full rounded-[2px] object-cover outline outline-1 -outline-offset-1 outline-black/10 ${className}`}
      />
    );
  }

  return (
    <span
      data-qa="postcard-back"
      role="img"
      aria-label={`${place.name}. No photo yet`}
      className={`relative block w-full overflow-hidden rounded-[2px] bg-stamp-paper ${className}`}
    >
      <span className="absolute inset-x-[12%] bottom-[16%] h-px bg-ink/15 shadow-[0_10px_0_rgb(29_26_22/0.15),0_-10px_0_rgb(29_26_22/0.15)]" />
      <span className="absolute top-1/2 left-1/2 grid aspect-square h-[46%] max-h-24 min-h-9 -translate-x-1/2 -translate-y-[62%] -rotate-12 place-items-center rounded-full border-[1.5px] border-stamp/70 px-1 text-center font-mono text-[clamp(6px,0.6rem,10px)] leading-tight tracking-[0.1em] text-stamp/80 uppercase outline outline-1 outline-offset-2 outline-stamp/60">
        {placeKind(place)}
      </span>
    </span>
  );
}
