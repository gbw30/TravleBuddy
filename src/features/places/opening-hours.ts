// Opening hours in OpenStreetMap's notation, for the common forms only.
// Anything this cannot read is "unknown": hours are flagged, never guessed
// (PRD 9.3 rule 2). Pure: safe to import in the browser.

/** Minutes from midnight. An end past 1440 runs into the next day. */
type Interval = [start: number, end: number];
/** Open intervals for each weekday, Monday first. */
export type WeeklyHours = Interval[][];

const DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const DAY_MINUTES = 1440;
const allWeek = () => DAYS.map((_, index) => index);

function minutes(clock: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(clock);
  if (!match) return null;
  const value = Number(match[1]) * 60 + Number(match[2]);
  return value <= DAY_MINUTES ? value : null;
}

/** "Mo-Fr,Su" as weekday numbers, or null when it is not a plain list of days. */
function parseDays(text: string): number[] | null {
  const days = new Set<number>();
  for (const part of text.split(",")) {
    const [from, to, extra] = part.split("-").map((day) => DAYS.indexOf(day));
    if (from === -1 || to === -1 || extra !== undefined) return null;
    if (to === undefined) {
      days.add(from);
      continue;
    }
    // "Sa-Mo" wraps round the end of the week.
    for (let day = from; ; day = (day + 1) % 7) {
      days.add(day);
      if (day === to) break;
    }
  }
  return [...days];
}

/** "09:00-12:00,13:00-17:00" as intervals, or null when it is anything else. */
function parseTimes(text: string): Interval[] | null {
  const intervals: Interval[] = [];
  for (const part of text.split(",")) {
    const [from, to, extra] = part.split("-");
    const start = minutes(from ?? "");
    const end = minutes(to ?? "");
    if (start === null || end === null || extra !== undefined) return null;
    // "22:00-02:00" closes after midnight.
    intervals.push([start, end > start ? end : end + DAY_MINUTES]);
  }
  return intervals;
}

/**
 * Reads forms such as `Mo-Fr 09:00-17:00; Sa 10:00-14:00; Su off` and `24/7`.
 * Returns null, meaning unknown, for no text and for anything else: public
 * holidays, months, sunrise, comments and the rest of the full notation.
 */
export function parseOpeningHours(
  text: string | null | undefined,
): WeeklyHours | null {
  const rules = (text ?? "")
    .split(";")
    .map((rule) => rule.trim())
    .filter(Boolean);
  if (rules.length === 0) return null;

  const week: WeeklyHours = DAYS.map(() => []);
  for (const rule of rules) {
    if (rule === "24/7") {
      for (const day of allWeek()) week[day] = [[0, DAY_MINUTES]];
      continue;
    }
    const parts = rule.split(/\s+/);
    if (parts.length > 2) return null;
    // A rule with no days, such as "10:00-18:00", holds every day.
    const [dayText, timeText] = parts.length === 2 ? parts : [null, parts[0]];
    const days = dayText === null ? allWeek() : parseDays(dayText);
    if (!days) return null;

    const closed = timeText === "off" || timeText === "closed";
    const intervals = closed ? [] : parseTimes(timeText);
    if (!intervals) return null;
    // A later rule replaces an earlier one for the days it names.
    for (const day of days) week[day] = intervals;
  }
  return week;
}

/** Monday is 0. The date is a wall-clock `YYYY-MM-DD`. */
function weekday(date: string): number {
  return (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
}

/**
 * Whether a place is open for the whole of a visit that starts at `start`
 * (`HH:MM`) on `date` and lasts `visit` minutes.
 */
export function isOpenFor(
  hours: WeeklyHours | null,
  date: string,
  start: string,
  visit: number,
): "open" | "closed" | "unknown" {
  const from = minutes(start);
  if (!hours || from === null || Number.isNaN(Date.parse(date))) {
    return "unknown";
  }
  const to = from + visit;
  const today = weekday(date);
  const covers = (day: number, shift: number) =>
    hours[day].some(
      ([opens, closes]) => opens <= from + shift && to + shift <= closes,
    );
  // Yesterday's hours count when they run past midnight into today.
  return covers(today, 0) || covers((today + 6) % 7, DAY_MINUTES)
    ? "open"
    : "closed";
}

/** Hours last judged on the map more than this many months ago are in doubt. */
export const STALE_MONTHS = 12;

/** `YYYY-MM-DD`, or `YYYY-MM` for the first of that month; an edit time adds its clock. */
const DATE = /^\d{4}-\d{2}(-\d{2})?(?=T|$)/;

/**
 * A quiet line for hours that may not be true, or null when there is no
 * reason to doubt them. For a map place the hours are judged by the date
 * they were checked, else the date of the last edit. `today` is `YYYY-MM-DD`.
 */
export function hoursDoubt(
  place: {
    origin: "OSM" | "SAMPLE" | "USER";
    openingHours: string | null;
    tags: Record<string, string>;
    lastEditedAt: string | null;
  },
  today: string,
): string | null {
  if (!parseOpeningHours(place.openingHours)) {
    return "Hours not known. Check before you go.";
  }
  if (place.origin !== "OSM") return null;
  const dated = [
    place.tags["check_date:opening_hours"],
    place.tags.check_date,
    place.lastEditedAt,
  ].find((value) => value && DATE.test(value));
  if (!dated) {
    return "Not known when these hours were last checked. Worth a check.";
  }
  const checked = dated.match(DATE)![0].padEnd(10, "-01");
  const cutoff = monthsAgo(today);
  return checked < cutoff
    ? `Last updated on the map in ${checked.slice(0, 4)}. Worth a check.`
    : null;
}

/** `today` moved back STALE_MONTHS months, as `YYYY-MM-DD`. */
function monthsAgo(today: string): string {
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() - STALE_MONTHS);
  return date.toISOString().slice(0, 10);
}
