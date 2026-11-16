import { MoveMenu } from "./move-menu";
import { PlaceArt } from "./place-art";
import { eyebrow } from "./styles";
import type { CardPlace } from "./types";

export function Shelf({
  places,
  showPhoto,
  openSlots,
  onPlace,
  onLook,
}: {
  places: CardPlace[];
  showPhoto: boolean;
  openSlots: { value: string; label: string }[];
  onPlace: (placeId: string, slotId: string) => void;
  onLook: (placeId: string) => void;
}) {
  return (
    <section
      data-qa="shelf"
      aria-labelledby="shelf-heading"
      className="border-t border-ink/12 pt-7"
    >
      <h2 id="shelf-heading" className={eyebrow}>
        Saved for later
      </h2>
      {places.length === 0 ? (
        <p className="mt-2 text-[15px] text-muted italic">
          Nothing saved yet. Use Save for later on any card.
        </p>
      ) : (
        <ul className="mt-4 grid gap-4 sm:grid-cols-2">
          {places.map((place) => (
            <li
              key={place.id}
              className="grid grid-cols-[4.75rem_minmax(0,1fr)] items-center gap-4 rounded-[4px] bg-card p-2 shadow-[0_0_0_1px_rgb(29_26_22/0.12),0_4px_12px_rgb(29_26_22/0.05)]"
            >
              <PlaceArt
                place={place}
                showPhoto={showPhoto}
                className="aspect-square"
              />
              <div className="min-w-0 space-y-1.5 py-1 pr-2">
                <button
                  type="button"
                  onClick={() => onLook(place.id)}
                  className="block text-left text-base leading-tight font-medium underline decoration-ink/25 underline-offset-4 [overflow-wrap:anywhere]"
                >
                  {place.name}
                </button>
                <MoveMenu
                  label={`Place ${place.name} in…`}
                  placeholder="Place in…"
                  action="Place"
                  actionLabel={`Place ${place.name} in the chosen slot`}
                  options={openSlots}
                  onChoose={(slotId) => onPlace(place.id, slotId)}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
