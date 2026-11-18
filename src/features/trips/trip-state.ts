import type { MissingFact, TripFacts, TripState } from "./contracts";

/** Today's date, `YYYY-MM-DD`, in a time zone. UTC when the zone is unknown. */
export function todayIn(timeZone: string | null, now = new Date()): string {
  try {
    // en-CA formats a date as YYYY-MM-DD.
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timeZone ?? "UTC",
    }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/**
 * Planning until the traveller marks the plan finished, then upcoming until
 * the last day, then past (TB-HOM-05).
 */
export function tripState(
  trip: { planFinished: boolean; endDate: string | null },
  today: string,
): TripState {
  if (!trip.planFinished) return "planning";
  return trip.endDate && today > trip.endDate ? "past" : "upcoming";
}

/** The facts a plan cannot start without, in the order they are asked. */
export function missingFacts(facts: TripFacts): MissingFact[] {
  const missing: MissingFact[] = [];
  if (facts.cities.length === 0) missing.push("where");
  if (!facts.startDate && !(facts.lengthNights && facts.timeOfYear)) {
    missing.push("when");
  }
  if (!facts.adults) missing.push("who");
  if (!facts.budgetAmount) missing.push("budget");
  return missing;
}
