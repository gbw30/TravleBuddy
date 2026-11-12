"use client";

import { useId, useState } from "react";

import { PlaceArt } from "./place-art";
import type { CardPlace } from "./types";

export function priceLabel(level: CardPlace["priceLevel"]): string {
  return level === null ? "Price unknown" : "¥".repeat(level);
}

export function ratingLabel(rating: number | null): string {
  return rating === null ? "No rating yet" : `${rating} rating`;
}

const face =
  "[grid-area:1/1] block min-w-0 p-2 shadow-[0_3px_10px_rgb(60_40_20/0.25)] [backface-visibility:hidden]";
const action =
  "rounded-full border border-terracotta-deep px-1 py-1 font-sans text-[11px] font-semibold whitespace-nowrap";

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
    <article data-qa="postcard" className="flex h-full min-w-0 flex-col gap-2">
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
          <span
            id={frontId}
            aria-hidden={flipped}
            className={`${face} relative bg-card`}
          >
            <PlaceArt place={place} showPhoto={showPhoto} className="h-32" />
            <span
              aria-hidden
              className="absolute top-3 right-3 grid h-8 w-7 place-items-center border-2 border-dotted border-terracotta bg-stamp-paper text-xs text-terracotta"
            >
              ✈
            </span>
            <span className="block px-1 py-2">
              <span className="block font-bold [overflow-wrap:anywhere]">
                {place.name}
              </span>
              <span className="block text-xs opacity-75 [overflow-wrap:anywhere]">
                {place.essentials} · {priceLabel(place.priceLevel)}
              </span>
            </span>
          </span>
          <span
            id={backId}
            aria-hidden={!flipped}
            className={`${face} bg-stamp-paper bg-[repeating-linear-gradient(180deg,transparent_0_23px,rgb(120_85_45/0.18)_23px_24px)] [transform:rotateY(180deg)]`}
          >
            <span className="block p-2 text-sm leading-6 [overflow-wrap:anywhere]">
              <span className="block">{place.summary}</span>
              <span className="mt-2 block font-sans text-[10px] font-bold tracking-widest text-terracotta uppercase">
                Why it suits you
              </span>
              <span className="block italic">{place.reason}</span>
            </span>
          </span>
        </span>
      </button>
      <div className="grid grid-cols-2 gap-1.5">
        {onPick && (
          <button
            type="button"
            onClick={onPick}
            className={`${action} col-span-2 bg-terracotta-deep text-white`}
          >
            Pick
          </button>
        )}
        {onSave && (
          <button
            type="button"
            onClick={onSave}
            className={`${action} text-terracotta-deep`}
          >
            Save for later
          </button>
        )}
        {onCloserLook && (
          <button
            type="button"
            onClick={onCloserLook}
            className={`${action} text-terracotta-deep`}
          >
            Closer look
          </button>
        )}
      </div>
    </article>
  );
}
