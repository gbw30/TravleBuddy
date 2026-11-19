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
