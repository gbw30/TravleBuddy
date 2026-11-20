"use client";

import { useEffect, useRef, useState } from "react";

import { PlaceArt } from "./place-art";
import { priceLabel, ratingLabel } from "./postcard";
import { eyebrow, button, buttonSecond, quiet } from "./styles";
import type { CardPlace } from "./types";

// Matches the closing transition in globals.css.
const CLOSE_MS = 150;

const look = {
  // As if the postcard had been picked up: white border, slight tilt.
  enlarged: "max-w-md -rotate-1 rounded-[4px] bg-card p-3 pb-6",
  overlay: "max-w-2xl rounded-[14px] bg-card p-6 md:p-8",
};

/** What the confirm step says about the traveller's other trips that hold the place. */
export function alsoInSentence(titles: string[]): string {
  if (titles.length === 0) return "";
  const quoted = titles.map((title) => `"${title}"`);
  const list =
    quoted.length === 1
      ? quoted[0]
      : `${quoted.slice(0, -1).join(", ")} and ${quoted.at(-1)}`;
  return titles.length === 1
    ? `It is also in your trip ${list}. Removing it opens that slot too.`
    : `It is also in your trips ${list}. Removing it opens those slots too.`;
}

export function CloserLook({
  place,
  variant,
  showPhoto,
  onClose,
  onRemove,
  othersHolding,
}: {
  place: CardPlace | null;
  variant: "enlarged" | "overlay";
  showPhoto: boolean;
  onClose: () => void;
  /** Offered for a place the traveller added by hand, after a confirm step. */
  onRemove?: (placeId: string) => void;
  /** The titles of the traveller's other trips that hold the place. */
  othersHolding?: (placeId: string) => Promise<string[]>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  // The last place shown stays on the card while it closes.
  const [shown, setShown] = useState(place);
  if (place && place !== shown) setShown(place);
  const [confirming, setConfirming] = useState(false);
  const [others, setOthers] = useState<string[]>([]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (place && !dialog.open) dialog.showModal();
    if (!place && dialog.open) dialog.close();
    setConfirming(false);
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
            <dd>
              {shown.hours ?? "Not listed"}
              {shown.hoursDoubt && (
                <p className="font-sans text-[13px] leading-6 text-muted">
                  {shown.hoursDoubt}
                </p>
              )}
            </dd>
            <dt className="font-sans text-[13px] leading-6 text-muted">
              Price
            </dt>
            <dd>{priceLabel(shown.priceLevel)}</dd>
            <dt className="font-sans text-[13px] leading-6 text-muted">
              Rating
            </dt>
            <dd>{ratingLabel(shown.rating)}</dd>
            {shown.links && (
              <>
                <dt className="font-sans text-[13px] leading-6 text-muted">
                  Check it yourself
                </dt>
                <dd className="flex flex-wrap gap-x-4">
                  {[
                    [shown.links.website, "website", "Website"],
                    [shown.links.maps, "on Google Maps", "Google Maps"],
                    [shown.links.osm, "on OpenStreetMap", "OpenStreetMap"],
                  ].flatMap(([href, name, text]) =>
                    href
                      ? [
                          <a
                            key={href}
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`${shown.name} ${name}, opens in a new tab`}
                            className={quiet}
                          >
                            {text}
                          </a>,
                        ]
                      : [],
                  )}
                </dd>
              </>
            )}
          </dl>
          {onRemove && shown.own && (
            <div className="mt-5 border-t border-ink/12 pt-4">
              {confirming ? (
                <>
                  <p role="alert" className="text-[15px]">
                    Remove {shown.name}? Any slot that holds it reopens.{" "}
                    {alsoInSentence(others)}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <button
                      type="button"
                      className={buttonSecond}
                      onClick={() => onRemove(shown.id)}
                    >
                      Remove {shown.name}
                    </button>
                    <button
                      type="button"
                      className={quiet}
                      onClick={() => setConfirming(false)}
                    >
                      Keep it
                    </button>
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  className={quiet}
                  onClick={async () => {
                    setOthers((await othersHolding?.(shown.id)) ?? []);
                    setConfirming(true);
                  }}
                >
                  Remove this place
                </button>
              )}
            </div>
          )}
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
