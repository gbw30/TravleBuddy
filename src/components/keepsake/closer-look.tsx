"use client";

import { useEffect, useRef } from "react";

import { PlaceArt } from "./place-art";
import { priceLabel, ratingLabel } from "./postcard";
import { eyebrow, button } from "./styles";
import type { CardPlace } from "./types";

const look = {
  // As if the postcard had been picked up: white border, slight tilt.
  enlarged: "max-w-md -rotate-1 rounded-[4px] bg-card p-3 pb-6",
  overlay: "max-w-2xl rounded-[14px] bg-card p-6 md:p-8",
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
      className={`m-auto max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto overscroll-contain font-serif text-ink shadow-2xl backdrop:bg-black/50 ${look[variant]}`}
    >
      {place && (
        <>
          <PlaceArt
            place={place}
            showPhoto={showPhoto}
            className="aspect-[4/3]"
          />
          {showPhoto && place.photoCredit && (
            <p className="mt-1.5 font-sans text-[11px] text-muted">
              {place.photoCredit}
            </p>
          )}
          <h2
            id="closer-look-title"
            className="mt-4 text-[32px] leading-[1.06] tracking-[-0.025em] [overflow-wrap:anywhere]"
          >
            {place.name}
          </h2>
          <p className="mt-1 font-sans text-[13px] text-muted">
            {place.essentials}
          </p>
          <p className="mt-3">{place.summary}</p>
          <p className={`${eyebrow} mt-5 text-terracotta`}>Why it suits you</p>
          <p className="font-serif text-[19px] leading-snug italic">
            {place.reason}
          </p>
          <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-5 gap-y-1.5 border-t border-ink/12 pt-4 text-[15px]">
            <dt className="font-sans text-[13px] leading-6 text-muted">
              Address
            </dt>
            <dd>{place.address}</dd>
            <dt className="font-sans text-[13px] leading-6 text-muted">
              Hours
            </dt>
            <dd>{place.hours ?? "Hours unknown"}</dd>
            <dt className="font-sans text-[13px] leading-6 text-muted">
              Price
            </dt>
            <dd>{priceLabel(place.priceLevel)}</dd>
            <dt className="font-sans text-[13px] leading-6 text-muted">
              Rating
            </dt>
            <dd>{ratingLabel(place.rating)}</dd>
          </dl>
          <form method="dialog" className="mt-5">
            <button type="submit" autoFocus className={button}>
              Close
            </button>
          </form>
        </>
      )}
    </dialog>
  );
}
