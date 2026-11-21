import {
  placeWordFor,
  SLOT_WORDS,
  type PlanDay,
  type PlanEntry,
  type PlanView,
  type TravelLeg,
} from "@/features/itinerary/contracts";
import { walkWords } from "@/features/places/contracts";
import type { CardDto } from "@/features/recommendations/contracts";

import type { ReactNode } from "react";

import { BackADay, EarlierClock } from "./back-a-day";
import { DayStamp } from "./day-stamp";
import { dayLabel, shortDayLabel, weekdayName } from "./format";
import { ItineraryRow } from "./itinerary-row";
import { MoveMenu } from "./move-menu";
import { eyebrow, field, quiet } from "./styles";
import { TicketStub } from "./ticket-stub";

export const slotWord = SLOT_WORDS;
const meansWord = { walk: "Walk", transit: "Transit", drive: "Drive" };
const meansPhrase = {
  walk: "on foot",
  transit: "by public transport",
  drive: "by car",
};
const kindWord = {
  TRANSPORT: "Transport",
  STAY: "Stay",
  RESERVATION: "Reservation",
  MUST_SEE: "Must-see",
  OTHER: "Already decided",
};

/**
 * The dotted line of travel between two rows: the time by the traveller's
 * means, then the walk when the hop is short, then the directions. One line.
 * An estimate, and said as one.
 */
function TravelLine({ leg }: { leg: TravelLeg }) {
  return (
    <p className="relative py-2 pl-[5.6rem] font-sans text-xs text-muted before:absolute before:inset-y-0 before:left-[2.45rem] before:border-l-[1.5px] before:border-dotted before:border-ink/25">
      about {leg.minutes} min {meansPhrase[leg.means]}
      {leg.walk && ` · or ${walkWords(leg.walk)} on foot`}
      {leg.directions && (
        <>
          {" · "}
          <a
            href={leg.directions}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Directions, opens in a new tab"
            className="font-medium text-ink underline decoration-ink/25 decoration-[1.5px] underline-offset-4 transition-colors duration-150 ease-settle hover:text-terracotta hover:decoration-terracotta"
          >
            Directions
          </a>
        </>
      )}
    </p>
  );
}

type SlotEntry = Extract<PlanEntry, { type: "open" | "place" }>;
const isSlot = (entry: PlanEntry): entry is SlotEntry =>
  entry.type === "open" || entry.type === "place";

/** "Day 2 · 09:30 Morning" */
export function slotLabel(day: number, entry: SlotEntry): string {
  return `Day ${day} · ${entry.start} ${slotWord[entry.kind]}`;
}

/** Every slot a place could go into, for the "move to" and "place in" menus. */
export function slotOptions(view: PlanView, except?: string) {
  return view.days.flatMap((day) =>
    day.entries
      .filter(isSlot)
      .filter((entry) => entry.slotId !== except)
      .map((entry) => ({
        value: entry.slotId,
        label: slotLabel(day.day, entry),
      })),
  );
}

const hours = (minutes: number) =>
  minutes < 90
    ? `${minutes} min`
    : `${Math.round((minutes / 60) * 2) / 2} h`.replace(".5", "½");

// An allowance is a planner's round figure, so a whole hour reads "1 h", not "60 min".
const allowed = (minutes: number) =>
  minutes % 60 === 0 ? `${minutes / 60} h` : hours(minutes);

/**
 * The live itinerary (PRD 9.1): one section per day, with scheduled places,
 * travel between them, time to wander, booked items as ticket stubs, open
 * slots and travel between cities.
 */
export function PlanItinerary({
  view,
  chosen,
  focusSlotId,
  transit,
  readOnly,
  onFocus,
  onMove,
  onRemove,
  onLook,
  onMinutes,
  onTransfer,
}: {
  view: PlanView;
  chosen: Record<string, CardDto>;
  focusSlotId: string | null;
  /** A just-picked card and the slot it is travelling to. */
  transit: { placeId: string; slotId: string } | null;
  readOnly: boolean;
  onFocus: (slotId: string) => void;
  onMove: (fromSlotId: string, toSlotId: string) => void;
  onRemove: (slotId: string) => void;
  onLook: (placeId: string) => void;
  onMinutes: (slotId: string, minutes: number | null) => void;
  onTransfer: (day: number, start: string) => void;
}) {
  return (
    <div data-qa="live-itinerary" className="space-y-9">
      {view.unplaced.length > 0 && (
        <div className="rounded-lg border-[1.5px] border-dashed border-stamp/50 px-4 py-3">
          <p className="font-sans text-[13px] font-medium text-stamp">
            Still to fit in
          </p>
          <ul className="mt-1 space-y-1 text-[15px]">
            {view.unplaced.map((item) => (
              <li key={item.commitmentId}>
                <span className="[overflow-wrap:anywhere]">{item.title}</span>
                <span className="block font-sans text-xs text-muted">
                  {item.reason}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {view.days.map((day) => {
        const row = (entry: PlanEntry, index: number) => {
          if (entry.type === "commitment") {
            return (
              <li
                key={`c-${entry.commitmentId}`}
                className={entry.travelIn ? "" : "mt-2.5 first:mt-0"}
              >
                {entry.travelIn && <TravelLine leg={entry.travelIn} />}
                <TicketStub
                  time={entry.start ?? "—"}
                  title={entry.title}
                  note={
                    entry.ticket && entry.start
                      ? [
                          `Leaves ${entry.start} ${entry.ticket.from} time`,
                          entry.ticket.arrives &&
                            `arrives ${entry.ticket.arrivesOn ? `${shortDayLabel(entry.ticket.arrivesOn)} ` : ""}${entry.ticket.arrives} ${entry.ticket.to} time`,
                          entry.minutes
                            ? hours(entry.minutes)
                            : "length unknown",
                        ]
                          .filter(Boolean)
                          .join(" · ")
                      : [
                          kindWord[entry.commitmentKind],
                          entry.start
                            ? entry.minutes
                              ? hours(entry.minutes)
                              : null
                            : "time to be set, I plan around it",
                        ]
                          .filter(Boolean)
                          .join(" · ")
                  }
                />
                {entry.ticket?.arrivesOn &&
                  entry.ticket.arrivesOn < day.date && (
                    <BackADay left={day.date} lands={entry.ticket.arrivesOn} />
                  )}
                {entry.ticket &&
                  !entry.ticket.arrivesOn &&
                  entry.ticket.arrives &&
                  entry.start &&
                  entry.ticket.arrives < entry.start && (
                    <EarlierClock lands={entry.ticket.arrives} />
                  )}
              </li>
            );
          }
          if (entry.type === "transfer") {
            return (
              <li key={`t-${index}`} className="mt-2.5 first:mt-0">
                <ItineraryRow
                  time={entry.start}
                  title={`Travel from ${entry.from} to ${entry.to} · about ${hours(entry.minutes)} · assumed, not booked${entry.arriveLocal ? ` · you arrive about ${entry.arriveLocal}, ${entry.to} time` : ""}`}
                  variant="wander"
                >
                  {!readOnly && (
                    <form
                      className="flex basis-full flex-wrap items-center gap-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const start = String(
                          new FormData(event.currentTarget).get("start"),
                        );
                        if (start) onTransfer(day.day, start);
                      }}
                    >
                      <label className="font-sans text-xs text-muted">
                        Leave at{" "}
                        <input
                          name="start"
                          type="time"
                          defaultValue={entry.start}
                          className={`${field} ml-1`}
                        />
                      </label>
                      <button type="submit" className={quiet}>
                        Set
                      </button>
                    </form>
                  )}
                </ItineraryRow>
              </li>
            );
          }
          if (entry.type === "breakfast-at-stay") {
            return (
              <li key={`b-${index}`} className="mt-2.5 first:mt-0">
                <ItineraryRow
                  time={entry.start}
                  title="Breakfast where you stay"
                  variant="wander"
                />
              </li>
            );
          }
          if (entry.type === "allowance") {
            const place = placeWordFor(entry.mode);
            const long = allowed(entry.minutes);
            return (
              <li key={`a-${index}`} className="mt-2.5 first:mt-0">
                <ItineraryRow
                  time={entry.start}
                  title={
                    place === null
                      ? entry.way === "from"
                        ? `After you arrive, about ${long} allowed`
                        : `Before you leave, ${long} allowed, from ${entry.start}`
                      : entry.way === "from"
                        ? `From the ${place}, about ${long} allowed`
                        : `To the ${place} and check-in, ${long} allowed, from ${entry.start}`
                  }
                  variant="wander"
                >
                  <p className="basis-full font-sans text-[13px] leading-6 text-muted">
                    {place === null
                      ? "Check the transfer time for this journey"
                      : `Check the transfer time for your ${place}`}
                  </p>
                </ItineraryRow>
              </li>
            );
          }
          if (entry.type === "return") {
            return (
              <li key={`r-${index}`} className="mt-2.5 first:mt-0">
                <ItineraryRow
                  time={entry.start}
                  title={`Back to ${entry.stay} · ${meansWord[entry.travel.means]} · about ${entry.travel.minutes} min (estimate)`}
                  variant="wander"
                />
              </li>
            );
          }
          if (entry.type === "wander") {
            return (
              <li key={`w-${index}`} className="mt-2.5 first:mt-0">
                <ItineraryRow
                  time={entry.start}
                  title={`Time to wander${entry.area ? ` around ${entry.area}` : ""} · ${hours(entry.minutes)}`}
                  variant="wander"
                />
              </li>
            );
          }

          const active = focusSlotId === entry.slotId;
          const card =
            entry.type === "place" ? chosen[entry.placeId] : undefined;
          return (
            <li
              key={entry.slotId}
              className={
                entry.type === "place" && entry.travelIn
                  ? ""
                  : "mt-2.5 first:mt-0"
              }
              style={
                transit?.slotId === entry.slotId &&
                entry.type === "place" &&
                entry.placeId === transit.placeId
                  ? { viewTransitionName: "picked-card" }
                  : undefined
              }
              draggable={entry.type === "place" && !readOnly}
              onDragStart={(event) =>
                event.dataTransfer.setData("text/plain", entry.slotId)
              }
              onDragOver={(event) => !readOnly && event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const from = event.dataTransfer.getData("text/plain");
                if (from && from !== entry.slotId) {
                  onMove(from, entry.slotId);
                }
              }}
            >
              {entry.type === "place" && entry.travelIn && (
                <TravelLine leg={entry.travelIn} />
              )}
              {entry.type === "place" ? (
                <ItineraryRow
                  time={entry.start}
                  title={card?.name ?? "A place"}
                  variant="item"
                  flag={
                    entry.flags.length > 0
                      ? entry.flags
                          .map((flag) =>
                            [flag.message, flag.fix].filter(Boolean).join(" "),
                          )
                          .join(" ")
                      : null
                  }
                >
                  <span className="flex basis-full flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-sans text-xs text-muted">
                      {hours(entry.minutes)}
                      {entry.minutesEstimated ? " (estimate)" : ""}
                    </span>
                    <button
                      type="button"
                      className={quiet}
                      aria-label={`Details for ${card?.name}`}
                      onClick={() => onLook(entry.placeId)}
                    >
                      Details
                    </button>
                    {!readOnly && (
                      <>
                        <button
                          type="button"
                          className={quiet}
                          aria-label={`Swap ${card?.name}`}
                          aria-pressed={active}
                          onClick={() => onFocus(entry.slotId)}
                        >
                          {active ? "Choosing a swap" : "Swap"}
                        </button>
                        <MoveMenu
                          label={`Move ${card?.name} to…`}
                          placeholder="Move to…"
                          action="Move"
                          actionLabel={`Move ${card?.name} to the chosen slot`}
                          options={slotOptions(view, entry.slotId)}
                          onChoose={(to) => onMove(entry.slotId, to)}
                        />
                        <MoveMenu
                          label={`Visit length for ${card?.name}`}
                          placeholder="Length…"
                          action="Set"
                          actionLabel={`Set the visit length for ${card?.name}`}
                          options={[
                            { value: "0", label: "Usual length" },
                            ...[30, 45, 60, 90, 120, 180, 240].map((m) => ({
                              value: String(m),
                              label: hours(m),
                            })),
                          ]}
                          onChoose={(value) =>
                            onMinutes(
                              entry.slotId,
                              value === "0" ? null : Number(value),
                            )
                          }
                        />
                        <button
                          type="button"
                          className={quiet}
                          aria-label={`Remove ${card?.name}`}
                          onClick={() => onRemove(entry.slotId)}
                        >
                          Remove
                        </button>
                      </>
                    )}
                  </span>
                </ItineraryRow>
              ) : (
                <ItineraryRow
                  time={entry.start}
                  title={slotWord[entry.kind]}
                  variant="open"
                  active={active}
                >
                  {!active && !readOnly && (
                    <button
                      type="button"
                      className={quiet}
                      aria-label={`Choose ${slotLabel(day.day, entry)}`}
                      onClick={() => onFocus(entry.slotId)}
                    >
                      Choose
                    </button>
                  )}
                </ItineraryRow>
              )}
            </li>
          );
        };
        return (
          <section
            key={day.day}
            aria-label={`Day ${day.day}, ${dayLabel(day.date)}`}
          >
            <div className="mb-4 flex items-center justify-between gap-2">
              <h3 className={eyebrow}>
                Day {day.day} · {dayLabel(day.date).slice(0, -5)}
              </h3>
              <DayStamp city={day.city} day={day.day} />
            </div>
            <DayRows day={day} row={row} />
            {day.stayNote && (
              <p className="mt-3 font-sans text-[13px] leading-6 text-muted">
                {day.stayNote}
              </p>
            )}
            {day.returnNote && (
              <p className="mt-3 font-sans text-[13px] leading-6 text-muted">
                {day.returnNote}
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}

/** Whether a row belongs to the journey between cities, not to either city. */
const isJourney = (entry: PlanEntry) =>
  entry.type === "allowance" ||
  entry.type === "transfer" ||
  (entry.type === "commitment" && entry.commitmentKind === "TRANSPORT");

/**
 * A day's rows. On a day that changes city they sit in one group per city,
 * with the tickets and the time allowed around them between the groups
 * (TB-ITN-25). Any other day is one plain list.
 */
function DayRows({
  day,
  row,
}: {
  day: PlanDay;
  row: (entry: PlanEntry, index: number) => ReactNode;
}) {
  if (new Set(day.entries.map((entry) => entry.city)).size < 2) {
    return <ol>{day.entries.map(row)}</ol>;
  }
  const blocks: { journey: boolean; city: string; at: number[] }[] = [];
  day.entries.forEach((entry, index) => {
    const journey = isJourney(entry);
    const last = blocks.at(-1);
    if (
      last &&
      last.journey === journey &&
      (journey || last.city === entry.city)
    ) {
      last.at.push(index);
    } else {
      blocks.push({ journey, city: entry.city, at: [index] });
    }
  });
  // The city a back-a-day ticket lands in repeats its date: say so in its heading.
  const repeated = new Map<number, string>();
  blocks.forEach((block, index) => {
    for (const at of block.at) {
      const entry = day.entries[at];
      const landed =
        entry.type === "commitment" ? entry.ticket?.arrivesOn : null;
      if (landed && landed < day.date && blocks[index + 1]) {
        repeated.set(index + 1, landed);
      }
    }
  });
  return (
    <div className="space-y-3.5">
      {blocks.map((block, blockIndex) => {
        const rows = (
          <ol>{block.at.map((index) => row(day.entries[index], index))}</ol>
        );
        if (!block.journey) {
          return (
            <div
              key={block.at[0]}
              data-qa="city-group"
              className="ml-0.5 border-l-[3px] border-terracotta pl-3"
            >
              <h4 className="mb-2 font-serif text-[22px] leading-tight tracking-[-0.02em]">
                {block.city}
                {repeated.has(blockIndex) && (
                  <span className="ml-2 font-sans text-[13px] tracking-normal text-terracotta-deep">
                    {shortDayLabel(repeated.get(blockIndex)!)} · second{" "}
                    {weekdayName(repeated.get(blockIndex)!)}
                  </span>
                )}
              </h4>
              {rows}
            </div>
          );
        }
        const from = day.entries[block.at[0]].city;
        const to = day.entries[block.at[block.at.length - 1]].city;
        return (
          <div
            key={block.at[0]}
            data-qa="journey-strip"
            className="ml-0.5 rounded-xl bg-tint p-3"
          >
            {from !== to && (
              <p className="mb-2.5 flex items-center gap-2 font-mono text-[11px] font-medium tracking-[0.12em] text-terracotta-deep uppercase">
                {from}
                <i
                  aria-hidden
                  className="flex-1 border-t-[1.5px] border-dashed border-terracotta opacity-60"
                />
                {to}
              </p>
            )}
            {rows}
          </div>
        );
      })}
    </div>
  );
}
