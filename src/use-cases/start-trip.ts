import { ticketLength } from "@/features/itinerary/contracts";
import { findCities } from "@/features/places";
import type { City } from "@/features/places/contracts";
import { createTrip, factsFromTickets } from "@/features/trips";
import {
  LANDS_BEFORE_LEAVING,
  NEW_TRIP_TITLE,
  type StartTripInput,
} from "@/features/trips/contracts";

import { ticketZones } from "./ticket-zones";

// Starting a trip spans two services: Places turns the ticket destinations
// into cities, and Trips saves the trip.

const list = new Intl.ListFormat("en", { type: "conjunction" });

/**
 * Creates a trip from the start screen's answers. Booked tickets become fixed
 * commitments and set the dates and cities (TB-STA-03). A destination the
 * lookup cannot match is left for the traveller to set in the trip's facts.
 */
export async function startTrip(
  userId: string,
  input: StartTripInput,
): Promise<{ id: string } | { refused: string }> {
  const fromTickets = factsFromTickets(input.tickets);

  const cities: { city: City; nights: number | null }[] = [];
  // One at a time: the lookup allows a single request a second.
  for (const stop of fromTickets.stops) {
    const found = await findCities(stop.place);
    const city = found.status === "ok" ? found.cities[0] : undefined;
    if (city) cities.push({ city, nights: stop.nights });
  }

  const zoneOf = ticketZones(cities.map(({ city }) => city));
  const tickets = [];
  for (const ticket of input.tickets) {
    tickets.push({
      ...ticket,
      fromZone: await zoneOf(ticket.from),
      toZone: await zoneOf(ticket.to),
    });
  }

  // Both clocks decide whether a ticket lands after it leaves (TB-ITN-26).
  const landsBefore = tickets.some((t) => {
    const length = ticketLength({
      date: t.departDate,
      startTime: t.departTime,
      endDate: t.arriveDate,
      endTime: t.arriveTime,
      originZone: t.fromZone,
      destinationZone: t.toZone,
    });
    return length !== null && length <= 0;
  });
  if (landsBefore) return { refused: LANDS_BEFORE_LEAVING };

  const names = cities.length
    ? cities.map(({ city }) => city.name)
    : fromTickets.stops.map((stop) => stop.place);

  return createTrip(userId, {
    title: names.length ? `Trip to ${list.format(names)}` : NEW_TRIP_TITLE,
    planningMode: input.planningMode,
    startDate: fromTickets.startDate,
    endDate: fromTickets.endDate,
    cities,
    tickets,
  });
}
