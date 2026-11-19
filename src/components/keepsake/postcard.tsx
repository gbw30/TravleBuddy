"use client";

import { useId, useState } from "react";

import { PlaceArt } from "./place-art";
import { button, quiet } from "./styles";
import { placeKind, type CardPlace } from "./types";

export function priceLabel(level: CardPlace["priceLevel"]): string {
  return level === null ? "Price unknown" : "¥".repeat(level);
}

export function ratingLabel(rating: number | null): string {
  return rating === null ? "No rating yet" : `${rating} rating`;
}

// The article is the white print; the photo and caption turn over inside it.
const face = "[grid-area:1/1] block min-w-0 [backface-visibility:hidden]";

export function Postcard({
  place,
  showPhoto,
  onPick,
  onSave,
  onCloserLook,
}: {
  place: CardPlace;
  showPhoto: boolean;
  onPick?: () => void;
  onSave?: () => void;
  onCloserLook?: () => void;
}) {
  const [flipped, setFlipped] = useState(false);
  const frontId = useId();
  const backId = useId();

  return (
    <article
      data-qa="postcard"
      className="relative flex h-full min-w-0 flex-col rounded-[4px] bg-card p-2.5 shadow-print transition-[translate,box-shadow] duration-300 ease-settle hover:-translate-y-1 hover:shadow-lift motion-reduce:transition-[box-shadow] motion-reduce:hover:translate-y-0"
    >
      <button
        type="button"
        aria-pressed={flipped}
        aria-label={`${place.name}. Flip card`}
        aria-describedby={flipped ? backId : frontId}
        onClick={() => setFlipped((value) => !value)}
        className="block w-full flex-1 cursor-pointer text-left text-ink [perspective:1000px]"
      >
        <span
          className={`grid h-full transition-transform duration-500 [transform-style:preserve-3d] motion-reduce:transition-none ${flipped ? "[transform:rotateY(180deg)]" : ""}`}
        >
          <span aria-hidden={flipped} className={`${face} relative bg-card`}>
            <PlaceArt
              place={place}
              showPhoto={showPhoto}
              className="aspect-[4/3]"
            />
            {/* The postage stamp names the kind of place. */}
            <span
              aria-hidden
              className="absolute top-2 right-2 grid h-[2.8rem] min-w-10 max-w-[5rem] sm:top-2.5 sm:right-2.5 sm:h-[3.2rem] sm:min-w-11 sm:max-w-[5.5rem] rotate-3 place-items-center border-[3px] border-dotted border-card bg-card bg-clip-padding px-1 text-center font-mono text-[8px] leading-tight tracking-[0.04em] text-terracotta uppercase shadow-[0_1px_3px_rgb(0_0_0/0.25)]"
            >
              {placeKind(place)}
            </span>
            <span className="block px-1.5 pt-4 pb-2">
              <span className="block font-serif text-[23px] leading-[1.1] tracking-[-0.02em] [overflow-wrap:anywhere]">
                {place.name}
              </span>
              <span
                id={frontId}
                className="mt-1.5 block font-sans text-[13px] text-muted [overflow-wrap:anywhere]"
              >
                {place.essentials} · {priceLabel(place.priceLevel)}
              </span>
              <span className="mt-3 block font-sans text-[10.5px] font-medium tracking-[0.14em] text-terracotta uppercase">
                Turn over for why
              </span>
            </span>
          </span>
          <span
            aria-hidden={!flipped}
            className={`${face} rounded-[2px] bg-stamp-paper bg-[repeating-linear-gradient(180deg,transparent_0_27px,rgb(29_26_22/0.1)_27px_28px)] [transform:rotateY(180deg)]`}
          >
            <span
              id={backId}
              className="block p-3 text-[15px] leading-7 [overflow-wrap:anywhere]"
            >
              <span className="block">{place.summary}</span>
              <span className="mt-3 block font-sans text-[10.5px] font-medium tracking-[0.14em] text-terracotta uppercase">
                Why it suits you
              </span>
              <span className="block font-serif text-[16px] italic">
                {place.reason}
              </span>
            </span>
          </span>
        </span>
      </button>
      {/* The flip button's label hides its contents from screen readers, so the back is announced here. */}
      <span aria-live="polite" className="sr-only">
        {flipped ? `${place.summary} Why it suits you: ${place.reason}` : ""}
      </span>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1.5 pt-2 pb-2">
        {onPick && (
          <button
            type="button"
            onClick={onPick}
            aria-label={`Pick ${place.name}`}
            className={button}
          >
            Pick
          </button>
        )}
        {onSave && (
          <button
            type="button"
            onClick={onSave}
            aria-label={`Save ${place.name} for later`}
            className={quiet}
          >
            Save
          </button>
        )}
        {onCloserLook && (
          <button
            type="button"
            onClick={onCloserLook}
            aria-label={`Closer look at ${place.name}`}
            className={quiet}
          >
            Closer look
          </button>
        )}
      </div>
    </article>
  );
}
