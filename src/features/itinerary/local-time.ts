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

/**
 * How long a ticket lasts, measured with the clock of each end. Null when
 * either end's zone, or the arrival, is not known, or the answer is not
 * a length of time.
 */
export function ticketMinutes(c: CommitmentDto): number | null {
  const t = c.transport;
  if (!t?.originZone || !t.destinationZone) return null;
  if (!c.date || !c.startTime || !c.endTime) return null;
  const arriveDate = c.endDate ?? c.date;
  const leaves = clockMinutes(c.startTime);
  const lands = clockMinutes(c.endTime);
  const instant = (date: string, minutes: number, zone: string) =>
    Date.parse(`${date}T00:00:00Z`) / 60_000 +
    minutes -
    offsetAt(zone, date, minutes);
  const length =
    instant(arriveDate, lands, t.destinationZone) -
    instant(c.date, leaves, t.originZone);
  return length > 0 ? length : null;
}
