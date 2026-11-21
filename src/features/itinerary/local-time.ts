import type { CommitmentDto } from "@/features/trips/contracts";

/**
 * Minutes a time zone's clock is ahead of UTC at a wall-clock time there.
 * Zero when the zone is unknown, so nothing shifts for a city without one.
 */
export function offsetAt(
  timeZone: string | null,
  date: string,
  minutes: number,
): number {
  if (!timeZone) return 0;
  const wall = Date.parse(`${date}T00:00:00Z`) + minutes * 60_000;
  try {
    const format = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    // How far the zone's clock is ahead of UTC at one instant.
    const ahead = (instant: number) => {
      const part = Object.fromEntries(
        format
          .formatToParts(new Date(instant))
          .map((item) => [item.type, Number(item.value)]),
      );
      const shown = Date.UTC(
        part.year,
        part.month - 1,
        part.day,
        part.hour,
        part.minute,
      );
      return (shown - instant) / 60_000;
    };
    // The wall time read as UTC is off by the answer itself: correct once.
    return ahead(wall - ahead(wall) * 60_000);
  } catch {
    return 0;
  }
}

const clockMinutes = (clock: string) =>
  Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5));

type TicketTimes = {
  date: string | null;
  startTime: string | null;
  endDate: string | null;
  endTime: string | null;
  originZone: string | null;
  destinationZone: string | null;
};

/**
 * Minutes from leaving to landing, each end by the clock of its own zone, so
 * a landing on an earlier date or clock time is still after the departure.
 * Zero or less means the ticket lands before it leaves. Null when either
 * zone, or the arrival, is not known.
 */
export function ticketLength(t: TicketTimes): number | null {
  if (!t.originZone || !t.destinationZone) return null;
  if (!t.date || !t.startTime || !t.endTime) return null;
  const arriveDate = t.endDate ?? t.date;
  const leaves = clockMinutes(t.startTime);
  const lands = clockMinutes(t.endTime);
  const instant = (date: string, minutes: number, zone: string) =>
    Date.parse(`${date}T00:00:00Z`) / 60_000 +
    minutes -
    offsetAt(zone, date, minutes);
  return (
    instant(arriveDate, lands, t.destinationZone) -
    instant(t.date, leaves, t.originZone)
  );
}

/**
 * How long a ticket lasts, measured with the clock of each end. Null when
 * either end's zone, or the arrival, is not known, or the answer is not
 * a length of time.
 */
export function ticketMinutes(c: CommitmentDto): number | null {
  const t = c.transport;
  if (!t) return null;
  const length = ticketLength({
    date: c.date,
    startTime: c.startTime,
    endDate: c.endDate,
    endTime: c.endTime,
    originZone: t.originZone,
    destinationZone: t.destinationZone,
  });
  return length !== null && length > 0 ? length : null;
}
