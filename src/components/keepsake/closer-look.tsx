"use client";

import { useEffect, useRef } from "react";

import { PlaceArt } from "./place-art";
import { priceLabel, ratingLabel } from "./postcard";
import { eyebrow, pillPrimary } from "./styles";
import type { CardPlace } from "./types";

const look = {
  // As if the postcard had been picked up: white border, slight tilt.
  enlarged: "max-w-md -rotate-1 bg-card p-3 pb-5",
  overlay: "max-w-2xl rounded-xl bg-stamp-paper p-6",
};

export function CloserLook({
  place,
  variant,
  showPhoto,
  onClose,
}: {
  place: CardPlace | null;
  variant: "enlarged" | "overlay";
  showPhoto: boolean;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (place && !dialog.open) dialog.showModal();
    if (!place && dialog.open) dialog.close();
  }, [place]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="closer-look-title"
      data-variant={variant}
      className={`m-auto max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto font-serif text-ink shadow-2xl backdrop:bg-black/50 ${look[variant]}`}
    >
      {place && (
        <>
          <PlaceArt place={place} showPhoto={showPhoto} className="h-56" />
          {showPhoto && place.photoCredit && (
            <p className="mt-1 font-sans text-[10px] opacity-75">
              {place.photoCredit}
            </p>
          )}
          <h2
            id="closer-look-title"
            className="mt-3 text-2xl font-bold [overflow-wrap:anywhere]"
          >
            {place.name}
          </h2>
          <p className="text-sm opacity-75">{place.essentials}</p>
          <p className="mt-3">{place.summary}</p>
          <p className={`${eyebrow} mt-4`}>Why it suits you</p>
          <p className="italic">{place.reason}</p>
          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="font-bold">Address</dt>
            <dd>{place.address}</dd>
            <dt className="font-bold">Hours</dt>
            <dd>{place.hours ?? "Hours unknown"}</dd>
            <dt className="font-bold">Price</dt>
            <dd>{priceLabel(place.priceLevel)}</dd>
            <dt className="font-bold">Rating</dt>
            <dd>{ratingLabel(place.rating)}</dd>
          </dl>
          <form method="dialog" className="mt-5">
            <button type="submit" autoFocus className={pillPrimary}>
              Close
            </button>
          </form>
        </>
      )}
    </dialog>
  );
}
