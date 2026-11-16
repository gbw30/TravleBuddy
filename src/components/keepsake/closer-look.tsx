"use client";

import { useEffect, useRef, useState } from "react";

import { PlaceArt } from "./place-art";
import { priceLabel, ratingLabel } from "./postcard";
import { eyebrow, button } from "./styles";
import type { CardPlace } from "./types";

// Matches the closing transition in globals.css.
const CLOSE_MS = 150;

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
  // The last place shown stays on the card while it closes.
  const [shown, setShown] = useState(place);
  if (place && place !== shown) setShown(place);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (place && !dialog.open) dialog.showModal();
    if (!place && dialog.open) dialog.close();
  }, [place]);

  // Let the card settle back down before it goes, in every browser.
  function close() {
    const dialog = ref.current;
    if (!dialog || dialog.dataset.closing) return;
    dialog.dataset.closing = "true";
    setTimeout(() => {
      delete dialog.dataset.closing;
      dialog.close();
    }, CLOSE_MS);
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      aria-labelledby="closer-look-title"
      data-variant={variant}
      className={`closer-look m-auto max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto overscroll-contain text-ink shadow-2xl ${look[variant]}`}
    >
      {shown && (
        <>
          <PlaceArt
            place={shown}
            showPhoto={showPhoto}
            className="aspect-[4/3]"
          />
          {showPhoto && shown.photoCredit && (
            <p className="mt-1.5 font-sans text-[11px] text-muted">
              {shown.photoCredit}
            </p>
          )}
          <h2
            id="closer-look-title"
            className="mt-4 text-[32px] leading-[1.06] tracking-[-0.025em] [overflow-wrap:anywhere]"
          >
            {shown.name}
          </h2>
          <p className="mt-1 font-sans text-[13px] text-muted">
            {shown.essentials}
          </p>
          <p className="mt-3">{shown.summary}</p>
          <p className={`${eyebrow} mt-5 text-terracotta`}>Why it suits you</p>
          <p className="font-serif text-[19px] leading-snug italic">
            {shown.reason}
          </p>
          <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-5 gap-y-1.5 border-t border-ink/12 pt-4 text-[15px]">
            <dt className="font-sans text-[13px] leading-6 text-muted">
              Address
            </dt>
            <dd>{shown.address}</dd>
            <dt className="font-sans text-[13px] leading-6 text-muted">
              Hours
            </dt>
            <dd>{shown.hours ?? "Hours unknown"}</dd>
            <dt className="font-sans text-[13px] leading-6 text-muted">
              Price
            </dt>
            <dd>{priceLabel(shown.priceLevel)}</dd>
            <dt className="font-sans text-[13px] leading-6 text-muted">
              Rating
            </dt>
            <dd>{ratingLabel(shown.rating)}</dd>
          </dl>
          <form
            method="dialog"
            className="mt-5"
            onSubmit={(event) => {
              event.preventDefault();
              close();
            }}
          >
            <button type="submit" autoFocus className={button}>
              Close
            </button>
          </form>
        </>
      )}
    </dialog>
  );
}
