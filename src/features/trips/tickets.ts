import type { TicketInput } from "./contracts";

export type TicketFacts = {
  startDate: string | null;
  endDate: string | null;
  /** The places the trip stays in, in order. `place` is the text the traveller typed. */
  stops: { place: string; nights: number | null }[];
};

/** "Tokyo (HND)" and " tokyo " are the same place. */
export function placeKey(place: string): string {
  return placeName(place).toLowerCase();
}

/** The place without an airport or station code in brackets. */
export function placeName(place: string): string {
  return place
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const nightsBetween = (from: string, to: string) =>
  Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86_400_000,
  );

/**
 * What booked tickets already decide (TB-STA-03): the trip starts when the
 * first one arrives, visits each destination in order, and ends when the last
 * one leaves for home.
 */
export function factsFromTickets(tickets: TicketInput[]): TicketFacts {
  if (tickets.length === 0)
    return { startDate: null, endDate: null, stops: [] };

  const ordered = [...tickets].sort((a, b) =>
    `${a.departDate}T${a.departTime}`.localeCompare(
      `${b.departDate}T${b.departTime}`,
    ),
  );
  const home = placeKey(ordered[0].from);
  const last = ordered[ordered.length - 1];
  const returnsHome = ordered.length > 1 && placeKey(last.to) === home;
  const legs = returnsHome ? ordered.slice(0, -1) : ordered;

  const stops = legs.map((ticket, index) => {
    const next = ordered[index + 1];
    const nights = next
      ? nightsBetween(ticket.arriveDate, next.departDate)
      : null;
    return {
      place: placeName(ticket.to),
      nights: nights !== null && nights > 0 ? nights : null,
    };
  });

  return {
    startDate: ordered[0].arriveDate,
    endDate: returnsHome ? last.departDate : null,
    stops,
  };
}

const modeWord: Record<TicketInput["mode"], string> = {
  FLIGHT: "Flight",
  TRAIN: "Train",
  BUS: "Bus",
  FERRY: "Ferry",
};

/** "Flight · New York (JFK) → Tokyo (HND)" */
export function ticketTitle(ticket: Pick<TicketInput, "mode" | "from" | "to">) {
  return `${modeWord[ticket.mode]} · ${ticket.from} → ${ticket.to}`;
}
