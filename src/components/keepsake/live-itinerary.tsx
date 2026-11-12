import type { PlanningState, SampleTrip } from "@/features/prototype/types";

import { DayStamp } from "./day-stamp";
import { ItineraryRow } from "./itinerary-row";
import { MoveMenu } from "./move-menu";
import { pill } from "./styles";
import { TicketStub } from "./ticket-stub";

export function LiveItinerary({
  trip,
  state,
  transit,
  onActivate,
  onMove,
  onRemove,
  onLook,
}: {
  trip: SampleTrip;
  state: PlanningState;
  /** A just-picked card and the slot it is travelling to. */
  transit: { placeId: string; slotId: string } | null;
  onActivate: (slotId: string) => void;
  onMove: (fromSlotId: string, toSlotId: string) => void;
  onRemove: (slotId: string) => void;
  onLook: (placeId: string) => void;
}) {
  const entryFor = (slotId: string) =>
    state.entries.find((e) => e.slotId === slotId)!;
  const isLocked = (slotId: string) => {
    const entry = entryFor(slotId);
    return entry.type === "item" && entry.locked;
  };
  const slotLabel = (slotId: string) => {
    const slot = trip.slots.find((s) => s.id === slotId)!;
    return `Day ${slot.day} · ${slot.start} ${slot.label}`;
  };

  return (
    <div data-qa="live-itinerary" className="space-y-6">
      {trip.days.map((day) => (
        <section key={day.day} aria-label={`Day ${day.day}, ${day.date}`}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="font-sans text-xs font-bold tracking-widest uppercase">
              Day {day.day} · {day.date}
            </h3>
            <DayStamp city={day.city} day={day.day} />
          </div>
          <ol className="mt-2 space-y-2">
            {trip.slots
              .filter((slot) => slot.day === day.day)
              .map((slot) => {
                const entry = entryFor(slot.id);
                const locked = isLocked(slot.id);
                const active = state.activeSlotId === slot.id;
                const place =
                  entry.type === "item" ? trip.places[entry.placeId] : null;
                return (
                  <li
                    key={slot.id}
                    style={
                      transit?.slotId === slot.id &&
                      entry.type === "item" &&
                      entry.placeId === transit.placeId
                        ? { viewTransitionName: "picked-card" }
                        : undefined
                    }
                    draggable={entry.type === "item" && !locked}
                    onDragStart={(event) =>
                      event.dataTransfer.setData("text/plain", slot.id)
                    }
                    onDragOver={(event) => !locked && event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      onMove(event.dataTransfer.getData("text/plain"), slot.id);
                    }}
                  >
                    {slot.travelIn && (
                      <p className="mb-1 ml-14 text-xs opacity-75">
                        {slot.travelIn.means} · {slot.travelIn.minutes} min
                      </p>
                    )}
                    {entry.type === "item" && place && locked && (
                      <TicketStub
                        time={slot.start}
                        title={place.name}
                        note={place.essentials}
                      />
                    )}
                    {entry.type === "item" && place && !locked && (
                      <ItineraryRow
                        time={slot.start}
                        title={place.name}
                        variant="item"
                        flag={entry.flag}
                      >
                        <span className="flex basis-full flex-wrap items-center gap-2">
                          <button
                            type="button"
                            className={pill}
                            aria-label={`Details for ${place.name}`}
                            onClick={() => onLook(place.id)}
                          >
                            Details
                          </button>
                          <button
                            type="button"
                            className={pill}
                            aria-label={`Swap ${place.name}`}
                            aria-pressed={active}
                            onClick={() => onActivate(slot.id)}
                          >
                            {active ? "Choosing a swap" : "Swap"}
                          </button>
                          <MoveMenu
                            label={`Move ${place.name} to…`}
                            placeholder="Move to…"
                            action="Move"
                            actionLabel={`Move ${place.name} to the chosen slot`}
                            options={trip.slots
                              .filter(
                                (s) => s.id !== slot.id && !isLocked(s.id),
                              )
                              .map((s) => ({
                                value: s.id,
                                label: slotLabel(s.id),
                              }))}
                            onChoose={(toSlotId) => onMove(slot.id, toSlotId)}
                          />
                          <button
                            type="button"
                            className={pill}
                            aria-label={`Remove ${place.name}`}
                            onClick={() => onRemove(slot.id)}
                          >
                            Remove
                          </button>
                        </span>
                      </ItineraryRow>
                    )}
                    {entry.type === "wander" && (
                      <ItineraryRow
                        time={slot.start}
                        title={`Time to wander${entry.area ? ` around ${entry.area}` : ""} · ${entry.minutes} min`}
                        variant="wander"
                      />
                    )}
                    {entry.type === "open" && (
                      <ItineraryRow
                        time={slot.start}
                        title={slot.label}
                        variant="open"
                        active={active}
                      >
                        {!active && (
                          <button
                            type="button"
                            className={pill}
                            aria-label={`Choose ${slotLabel(slot.id)}`}
                            onClick={() => onActivate(slot.id)}
                          >
                            Choose
                          </button>
                        )}
                      </ItineraryRow>
                    )}
                  </li>
                );
              })}
          </ol>
        </section>
      ))}
    </div>
  );
}
