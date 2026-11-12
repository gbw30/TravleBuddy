import { MoveMenu } from "./move-menu";
import { eyebrow } from "./styles";
import type { CardPlace } from "./types";

export function Shelf({
  places,
  openSlots,
  onPlace,
  onLook,
}: {
  places: CardPlace[];
  openSlots: { value: string; label: string }[];
  onPlace: (placeId: string, slotId: string) => void;
  onLook: (placeId: string) => void;
}) {
  return (
    <section data-qa="shelf" aria-labelledby="shelf-heading">
      <h2 id="shelf-heading" className={eyebrow}>
        Saved for later
      </h2>
      {places.length === 0 ? (
        <p className="mt-1 text-sm italic">
          Nothing saved yet. Use Save for later on any card.
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {places.map((place) => (
            <li
              key={place.id}
              className="flex flex-wrap items-center gap-2 rounded-md border border-row-edge bg-row px-3 py-2 text-sm"
            >
              <button
                type="button"
                onClick={() => onLook(place.id)}
                className="min-w-0 flex-1 text-left font-bold underline [overflow-wrap:anywhere]"
              >
                {place.name}
              </button>
              <MoveMenu
                label={`Place ${place.name} in…`}
                placeholder="Place in…"
                options={openSlots}
                onChoose={(slotId) => onPlace(place.id, slotId)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
