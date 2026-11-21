// Dates arrive as YYYY-MM-DD wall-clock values, so they are formatted in UTC
// and never shifted by the reader's own time zone.
const part = (date: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00Z`),
  );

/** "Mon 10 May 2027" */
export function dayLabel(date: string): string {
  return part(date, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).replace(",", "");
}

/** "Sat 11 Jul" */
export function shortDayLabel(date: string): string {
  return part(date, { weekday: "short", day: "numeric", month: "short" });
}

/** "10–12 May 2027", "28 Apr – 3 May 2027", "From 10 May 2027" or "Dates to be set". */
export function dateRange(start: string | null, end: string | null): string {
  if (!start) return "Dates to be set";
  const full = { day: "numeric", month: "short", year: "numeric" } as const;
  if (!end) return `From ${part(start, full)}`;
  if (start === end) return part(start, full);
  if (start.slice(0, 7) === end.slice(0, 7)) {
    return `${part(start, { day: "numeric" })}–${part(end, full)}`;
  }
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  return `${part(start, sameYear ? { day: "numeric", month: "short" } : full)} – ${part(end, full)}`;
}

/** "Saturday" */
export function weekdayName(date: string): string {
  return part(date, { weekday: "long" });
}

/** The month and day of a date, as a calendar leaf shows them: "JUL", "10". */
export function leafOf(date: string): { month: string; day: string } {
  return {
    month: part(date, { month: "short" }).toUpperCase(),
    day: part(date, { day: "numeric" }),
  };
}
