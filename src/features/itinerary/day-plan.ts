import {
  cityKeyOf,
  distanceKm,
  isMealKind,
  isOpenFor,
  parseOpeningHours,
  travelEstimate,
  visitMinutes,
  type City,
  type PlaceDto,
  type TravelMeans,
} from "@/features/places/contracts";
import type { CommitmentDto, TripFacts } from "@/features/trips/contracts";

import type {
  Pace,
  PlanBlocker,
  PlanDay,
  PlanEntry,
  PlanFlag,
  PlanState,
  PlanView,
  SlotKind,
} from "./contracts";
import { offsetAt } from "./local-time";

// Lays a plan out from the traveller's choices and the trip's facts, and
// checks it against the rules of PRD 9.3. Pure: no clock, no randomness, no
// database, so the same inputs always give the same plan (TB-ITN-17).

export type PlanContext = {
  facts: Pick<
    TripFacts,
    "cities" | "startDate" | "endDate" | "lengthNights" | "timeOfYear"
  >;
  /** In the order they should be fitted: by date, then time, then age. */
  commitments: CommitmentDto[];
  places: Record<string, PlaceDto>;
  /**
   * Minutes the whole day is moved by the traveller's "shape of the day":
   * earlier for early starts, later for late nights (PRD 9.4). Nothing
   * already decided moves with it.
   */
  dayShift?: number;
  /** The way of getting around the traveller named; legs are timed by it. */
  means?: TravelMeans;
  /** What the traveller said about breakfast; nothing said is none. */
  breakfast?: "included" | "suggest" | "none";
};

// The default day and the pace table of PRD 9.4.
const DAY_START = 9 * 60;
const DAY_END = 21 * 60 + 30;
const templates: Record<Pace, [SlotKind, number][]> = {
  relaxed: [
    ["morning", 600],
    ["lunch", 750],
    ["afternoon", 870],
    ["dinner", 1140],
  ],
  balanced: [
    ["morning", 570],
    ["lunch", 750],
    ["afternoon", 840],
    ["afternoon-2", 960],
    ["dinner", 1140],
  ],
  packed: [
    ["morning", 540],
    ["morning-2", 645],
    ["lunch", 750],
    ["afternoon", 840],
    ["afternoon-2", 960],
    ["dinner", 1140],
  ],
};
/** Minutes added to each travel leg, and minutes to wander or rest in a day. */
const paceRules: Record<Pace, { buffer: number; wander: number }> = {
  packed: { buffer: 10, wander: 0 },
  balanced: { buffer: 20, wander: 60 },
  relaxed: { buffer: 30, wander: 120 },
};
/** A slot may start this much later than usual before it is dropped for the day. */
const LATE_START = 90;
const MEAL_MINUTES = 75;
/** Breakfast starts with the day, if the day starts in this window, and takes this long. */
export const BREAKFAST = { from: 450, until: 600, minutes: 45 };
/** Less time than this between lunch and something decided is not time to wander. */
const MIN_WANDER = 30;
const ASSUMED_TRANSFER_START = 12 * 60;

const isMealSlot = (kind: SlotKind) =>
  kind === "breakfast" || kind === "lunch" || kind === "dinner";
const toMinutes = (clock: string) =>
  Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5));
const toClock = (minutes: number) => {
  const capped = Math.min(Math.max(Math.round(minutes), 0), 1439);
  return `${String(Math.floor(capped / 60)).padStart(2, "0")}:${String(capped % 60).padStart(2, "0")}`;
};
const DAY_MS = 86_400_000;
const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
const daysBetween = (from: string, to: string) =>
  Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS,
  );

/** The slot of one kind on one day. */
export function slotId(day: number, kind: SlotKind): string {
  return `d${day}-${kind}`;
}

/**
 * The day assumed as the first when a trip has only a length and a rough time
 * of year (PRD 9.7): the second Monday of that month, in the first year where
 * it is still ahead of `today`.
 */
export function provisionalStart(
  facts: Pick<TripFacts, "startDate" | "lengthNights" | "timeOfYear">,
  today: string,
): string | null {
  if (facts.startDate || !facts.lengthNights || !facts.timeOfYear) return null;
  const year = Number(today.slice(0, 4));
  for (const candidate of [year, year + 1]) {
    const first = new Date(Date.UTC(candidate, facts.timeOfYear - 1, 1));
    const toMonday = (8 - first.getUTCDay()) % 7;
    const date = addDays(first.toISOString().slice(0, 10), toMonday + 7);
    if (date > today) return date;
  }
  return null;
}

type Stay = { city: City; nights: number };

/** The cities with the nights in each, or what is missing to know them. */
function stays(facts: PlanContext["facts"]): Stay[] | PlanBlocker {
  if (facts.cities.length === 0) return "where";
  if (facts.cities.length === 1) {
    const only = facts.cities[0];
    const nights =
      only.nights ??
      (facts.startDate && facts.endDate
        ? daysBetween(facts.startDate, facts.endDate)
        : facts.lengthNights);
    return nights === null ? "nights" : [{ city: only.city, nights }];
  }
  const known: Stay[] = [];
  for (const { city, nights } of facts.cities) {
    if (nights === null) return "nights";
    known.push({ city, nights });
  }
  return known;
}

type Segment = { city: City; from: number; until: number };
type Fixed = {
  commitment: CommitmentDto;
  start: number;
  end: number;
};

/** Travel between two cities with no ticket: distance at a train's pace, plus getting to and from it. */
function transferMinutes(from: City, to: City): number {
  if (
    from.latitude === null ||
    from.longitude === null ||
    to.latitude === null ||
    to.longitude === null
  ) {
    return 180;
  }
  const km = distanceKm(
    { latitude: from.latitude, longitude: from.longitude },
    { latitude: to.latitude, longitude: to.longitude },
  );
  return Math.max(60, Math.round(((km / 70) * 60 + 60) / 15) * 15);
}

/** When a commitment with a time starts and ends on one day. */
function fixedOn(commitment: CommitmentDto, date: string): Fixed | null {
  // A ticket that left on an earlier day shows where it lands.
  if (
    commitment.date !== date &&
    commitment.endDate === date &&
    commitment.endTime
  ) {
    const landing = toMinutes(commitment.endTime);
    return { commitment, start: landing, end: landing };
  }
  if (commitment.date !== date || !commitment.startTime) return null;
  const start = toMinutes(commitment.startTime);
  const sameDay = (commitment.endDate ?? date) === date;
  // A stay is its check-in; a ticket that lands another day fills the evening.
  const end =
    commitment.kind === "STAY"
      ? start + 30
      : commitment.endTime && sameDay && toMinutes(commitment.endTime) > start
        ? toMinutes(commitment.endTime)
        : sameDay
          ? start + 60
          : DAY_END;
  return { commitment, start, end };
}

export function buildPlanView(
  state: PlanState,
  context: PlanContext,
): PlanView {
  const shift = context.dayShift ?? 0;
  const base = {
    pace: state.pace,
    provisionalDates: false,
    shelf: [...state.shelf],
    unplaced: [],
  };
  const stayList = stays(context.facts);
  if (typeof stayList === "string") {
    return { ...base, days: [], blockers: [stayList] };
  }
  const first = context.facts.startDate ?? state.provisionalStart;
  if (!first) return { ...base, days: [], blockers: ["when"] };

  const { buffer, wander } = paceRules[state.pace];
  const totalNights = stayList.reduce((sum, stay) => sum + stay.nights, 0);
  const cityOfNight = (night: number) => {
    let passed = 0;
    for (const stay of stayList) {
      passed += stay.nights;
      if (night < passed) return stay.city;
    }
    return stayList[stayList.length - 1].city;
  };

  const unplaced: PlanView["unplaced"] = [];
  const lastDate = addDays(first, totalNights);
  for (const commitment of context.commitments) {
    if (
      commitment.date &&
      ((commitment.endDate ?? commitment.date) < first ||
        commitment.date > lastDate)
    ) {
      unplaced.push({
        commitmentId: commitment.id,
        title: commitment.title,
        reason: "Its date is outside the trip's days.",
      });
    }
  }

  // Pass 1: each day's segments (where the traveller is, and when), its fixed
  // blocks, and the slots that remain.
  type DraftSlot = { id: string; kind: SlotKind; earliest: number; city: City };
  type Draft = {
    day: number;
    date: string;
    city: City;
    segments: Segment[];
    fixed: Fixed[];
    transfer: Extract<PlanEntry, { type: "transfer" }> | null;
    /** When the transfer arrives, by the clock of the city of arrival. */
    landsAt: number;
    slots: DraftSlot[];
    /** When breakfast where the traveller stays is shown, if it is. */
    stayBreakfast: number | null;
    /** Slot id to the must-include that holds it. */
    held: Map<string, CommitmentDto>;
    /** Commitments with a date but no time that take no slot: stays, tickets. */
    notes: CommitmentDto[];
  };
  const drafts: Draft[] = [];

  for (let index = 0; index <= totalNights; index += 1) {
    const day = index + 1;
    const date = addDays(first, index);
    const morningCity = index === 0 ? stayList[0].city : cityOfNight(index - 1);
    const eveningCity =
      index === totalNights
        ? stayList[stayList.length - 1].city
        : cityOfNight(index);
    const fixed = context.commitments.flatMap((c) => fixedOn(c, date) ?? []);
    // Tickets that leave today.
    const tickets = fixed.filter(
      (f) => f.commitment.kind === "TRANSPORT" && f.commitment.date === date,
    );

    let from = DAY_START + shift;
    let until = DAY_END + shift;
    // A ticket landing on the first day, or leaving on the last, bounds it.
    const landing = context.commitments.filter(
      (c) =>
        c.kind === "TRANSPORT" && c.endTime && (c.endDate ?? c.date) === date,
    );
    // On the first day any ticket that lands bounds it. Later only one that
    // left on an earlier day does: a night flight lands in the new city.
    const landed = landing.filter((c) => index === 0 || c.date !== date);
    if (landed.length > 0) {
      from = Math.max(
        from,
        Math.max(...landed.map((c) => toMinutes(c.endTime!))) + 60,
      );
    }
    if (index === totalNights && totalNights > 0 && tickets.length > 0) {
      until = Math.min(until, Math.min(...tickets.map((t) => t.start)) - 120);
    }

    let segments: Segment[];
    let transfer: Draft["transfer"] = null;
    let landsAt = 0;
    if (cityKeyOf(morningCity) === cityKeyOf(eveningCity)) {
      segments = [{ city: morningCity, from, until }];
    } else {
      // The day the traveller changes city: by their ticket, or by an
      // assumed transfer when there is none (PRD 9.7).
      const ticket = tickets[0];
      const leave = ticket
        ? ticket.start
        : toMinutes(
            state.transferTimes[String(day)] ?? toClock(ASSUMED_TRANSFER_START),
          );
      const travel = ticket ? 0 : transferMinutes(morningCity, eveningCity);
      // The clock of the city of arrival may differ from the one left
      // behind (TB-ITN-16). Nothing shifts when either zone is unknown.
      const ahead =
        ticket || !morningCity.timeZone || !eveningCity.timeZone
          ? 0
          : offsetAt(eveningCity.timeZone, date, leave) -
            offsetAt(morningCity.timeZone, date, leave);
      const arrive = ticket
        ? ticket.end
        : Math.max(leave, leave + travel + ahead);
      landsAt = arrive;
      if (!ticket) {
        transfer = {
          type: "transfer",
          from: morningCity.name,
          to: eveningCity.name,
          start: toClock(leave),
          minutes: travel,
          arriveLocal:
            ahead !== 0 && leave + travel + ahead >= leave && arrive < 24 * 60
              ? toClock(arrive)
              : null,
        };
      }
      segments = [
        { city: morningCity, from, until: leave - 60 },
        { city: eveningCity, from: arrive + 30, until },
      ];
    }

    const slots: DraftSlot[] = [];
    // Breakfast starts with the day, and only a day that starts in the
    // morning has one. Day 1 has no night behind it, so none is "at the stay".
    const dayStart = segments[0].from;
    let stayBreakfast: number | null = null;
    if (
      dayStart >= BREAKFAST.from &&
      dayStart <= BREAKFAST.until &&
      segments[0].until >= dayStart + BREAKFAST.minutes
    ) {
      const taken = fixed.some(
        (f) =>
          f.commitment.kind !== "STAY" &&
          f.start < dayStart + BREAKFAST.minutes &&
          dayStart < f.end,
      );
      if (context.breakfast === "suggest") {
        if (!taken) {
          slots.push({
            id: slotId(day, "breakfast"),
            kind: "breakfast",
            earliest: dayStart,
            city: segments[0].city,
          });
        }
      } else if (context.breakfast === "included" && index > 0 && !taken) {
        stayBreakfast = dayStart;
      }
    }
    for (const [kind, standard] of templates[state.pace]) {
      const usual = standard + shift;
      const segment = segments.find(
        (s) => s.from <= usual + LATE_START && usual + 60 <= s.until,
      );
      if (!segment) continue;
      const earliest = Math.max(usual, segment.from);
      const taken = fixed.some(
        (f) =>
          f.commitment.kind !== "STAY" &&
          f.start < earliest + 60 &&
          earliest < f.end,
      );
      if (!taken) {
        slots.push({
          id: slotId(day, kind),
          kind,
          earliest,
          city: segment.city,
        });
      }
    }

    drafts.push({
      day,
      date,
      city: morningCity,
      segments,
      fixed,
      transfer,
      landsAt,
      slots,
      stayBreakfast,
      held: new Map(),
      notes: [],
    });
  }

  // Pass 2: must-includes with no time take their slots before anything
  // optional (TB-FIX-04). The traveller's picks are not consulted, so the
  // same commitments always land in the same slots.
  const freeSlot = (draft: Draft, wantMeal: boolean | null) =>
    draft.slots.find(
      (slot) =>
        !draft.held.has(slot.id) &&
        slot.kind !== "breakfast" &&
        (wantMeal === null || isMealSlot(slot.kind) === wantMeal),
    );
  for (const commitment of context.commitments) {
    if (commitment.startTime) continue;
    if (unplaced.some((u) => u.commitmentId === commitment.id)) continue;
    const dated = drafts.find((draft) => draft.date === commitment.date);
    if (commitment.kind === "STAY" || commitment.kind === "TRANSPORT") {
      // A stay or a ticket with no time takes no part of the day.
      (dated ?? drafts[0]).notes.push(commitment);
      continue;
    }
    const candidates = commitment.date ? (dated ? [dated] : []) : drafts;
    let placed = false;
    for (const draft of candidates) {
      const slot =
        commitment.kind === "RESERVATION"
          ? // A booking with no time is most often dinner.
            (draft.slots.find(
              (s) => s.kind === "dinner" && !draft.held.has(s.id),
            ) ??
            freeSlot(draft, true) ??
            freeSlot(draft, null))
          : freeSlot(draft, false);
      if (slot) {
        draft.held.set(slot.id, commitment);
        placed = true;
        break;
      }
    }
    if (!placed) {
      unplaced.push({
        commitmentId: commitment.id,
        title: commitment.title,
        reason: commitment.date
          ? "That day has no free slot. Give it a time, or move it to another day."
          : "No day has a free slot. Give it a date and time.",
      });
    }
  }

  // Pass 3: walk each day in time order, working out start times, travel and flags.
  const usedPicks = new Set<string>();
  const days: PlanDay[] = drafts.map((draft) => {
    type Step =
      | { at: number; fixed: Fixed }
      | { at: number; transfer: NonNullable<Draft["transfer"]> }
      | { at: number; slot: DraftSlot };
    const steps: Step[] = [
      ...draft.fixed.map((fixed) => ({ at: fixed.start, fixed })),
      ...(draft.transfer
        ? [{ at: toMinutes(draft.transfer.start), transfer: draft.transfer }]
        : []),
      ...draft.slots.map((slot) => ({ at: slot.earliest, slot })),
    ].sort((a, b) => a.at - b.at);

    const entries: PlanEntry[] = draft.notes.map((commitment) => ({
      type: "commitment",
      commitmentId: commitment.id,
      commitmentKind: commitment.kind,
      title: commitment.title,
      start: null,
      minutes: null,
      slotId: null,
    }));
    if (draft.stayBreakfast !== null) {
      entries.push({
        type: "breakfast-at-stay",
        start: toClock(draft.stayBreakfast),
        minutes: BREAKFAST.minutes,
      });
    }
    // Breakfast where the traveller stays takes its time, as a slot does.
    let clock =
      draft.segments[0].from +
      (draft.stayBreakfast === null ? 0 : BREAKFAST.minutes);
    let lastPoint: { latitude: number; longitude: number } | null = null;
    let lastPlaceName: string | null = null;

    steps.forEach((step, position) => {
      if ("fixed" in step) {
        const { commitment, start, end } = step.fixed;
        entries.push({
          type: "commitment",
          commitmentId: commitment.id,
          commitmentKind: commitment.kind,
          title: commitment.title,
          start: toClock(start),
          minutes: end - start,
          slotId: null,
        });
        clock = Math.max(clock, end);
        lastPoint = null;
        return;
      }
      if ("transfer" in step) {
        entries.push(step.transfer);
        clock = Math.max(clock, draft.landsAt);
        lastPoint = null;
        return;
      }

      const { slot } = step;
      const held = draft.held.get(slot.id);
      const pick = state.picks[slot.id];
      const place = pick ? context.places[pick.placeId] : undefined;
      const segment = draft.segments.find((s) => s.city === slot.city)!;

      if (held) {
        entries.push({
          type: "commitment",
          commitmentId: held.id,
          commitmentKind: held.kind,
          title: held.title,
          start: null,
          minutes: null,
          slotId: slot.id,
        });
        clock = Math.max(clock, slot.earliest) + 60;
        lastPoint = null;
      } else if (pick && place) {
        usedPicks.add(slot.id);
        const point =
          place.latitude === null || place.longitude === null
            ? null
            : { latitude: place.latitude, longitude: place.longitude };
        const leg =
          lastPoint && point
            ? travelEstimate(lastPoint, point, context.means)
            : null;
        const start = Math.max(
          slot.earliest,
          clock + (leg ? leg.minutes + buffer : 0),
        );
        const minutes =
          pick.minutes ??
          (slot.kind === "breakfast"
            ? BREAKFAST.minutes
            : visitMinutes(place.kind));
        const end = start + minutes;

        const flags: PlanFlag[] = [];
        const open = isOpenFor(
          parseOpeningHours(place.openingHours),
          draft.date,
          toClock(start),
          minutes,
        );
        if (open === "closed") {
          flags.push({
            rule: "closed",
            message: `${place.name} is not open for the whole of this visit.`,
            fix: "Move it to another slot, shorten the visit, or swap it.",
          });
        } else if (open === "unknown") {
          flags.push({
            rule: "hours-unknown",
            message: "Opening hours are not known. Check before you go.",
            fix: null,
          });
        }
        const next = steps
          .slice(position + 1)
          .find((later) => "fixed" in later || "transfer" in later);
        if (next && next.at < end) {
          const what =
            "fixed" in next ? next.fixed.commitment.title : "your transfer";
          flags.push({
            rule: "overlap",
            message: `Runs into ${what} at ${toClock(next.at)}.`,
            fix: "Shorten the visit, move it earlier, or swap it.",
          });
        }
        if (end > segment.until) {
          flags.push({
            rule: "day",
            message: `Ends at ${toClock(end)}, after the day does.`,
            fix: "Move it earlier or shorten the visit.",
          });
        }
        if (place.cityKey !== cityKeyOf(slot.city)) {
          flags.push({
            rule: "city",
            message: `${place.name} is not in ${slot.city.name}, where you are at this time.`,
            fix: "Move it to a day in its own city.",
          });
        }

        entries.push({
          type: "place",
          slotId: slot.id,
          kind: slot.kind,
          cityKey: cityKeyOf(slot.city),
          placeId: place.id,
          start: toClock(start),
          minutes,
          minutesEstimated: pick.minutes === null,
          travelIn: leg ? { means: leg.means, minutes: leg.minutes } : null,
          flags,
        });
        clock = end;
        lastPoint = point;
        lastPlaceName = place.name;
      } else {
        const start = Math.max(slot.earliest, clock);
        entries.push({
          type: "open",
          slotId: slot.id,
          kind: slot.kind,
          start: toClock(start),
          cityKey: cityKeyOf(slot.city),
        });
        // A lunch not chosen yet still takes its time, so what follows is
        // laid out as it will be once there is one.
        if (slot.kind === "lunch") clock = start + MEAL_MINUTES;
        if (slot.kind === "breakfast") clock = start + BREAKFAST.minutes;
      }

      // Time to wander or rest follows lunch, with the last place as its area.
      // It ends where something decided, or a transfer, begins.
      if (slot.kind === "lunch" && wander > 0) {
        const start = Math.max(clock, slot.earliest + MEAL_MINUTES);
        const next = steps
          .slice(position + 1)
          .find((later) => "fixed" in later || "transfer" in later);
        const minutes = Math.min(wander, next ? next.at - start : wander);
        if (minutes >= MIN_WANDER) {
          entries.push({
            type: "wander",
            start: toClock(start),
            minutes,
            area: lastPlaceName,
          });
          clock = start + minutes;
        }
      }
    });

    return { day: draft.day, date: draft.date, city: draft.city.name, entries };
  });

  // A pick whose slot no longer exists is never dropped: it waits on the shelf (PRD 9.6).
  const shelf = [...state.shelf];
  for (const [id, pick] of Object.entries(state.picks)) {
    if (usedPicks.has(id) || !context.places[pick.placeId]) continue;
    if (shelf.some((item) => item.placeId === pick.placeId)) continue;
    shelf.push({
      placeId: pick.placeId,
      reason: "Its slot is no longer free in the plan.",
    });
  }

  return {
    days,
    blockers: [],
    pace: state.pace,
    provisionalDates: !context.facts.startDate,
    shelf,
    unplaced,
  };
}

/** Whether a place of this kind suits a slot: meals at meal times, the rest between. */
export function kindSuitsSlot(kind: PlaceDto["kind"], slot: SlotKind): boolean {
  if (slot === "dinner") return kind === "restaurant";
  if (slot === "breakfast") return kind === "cafe" || kind === "bakery";
  return isMealSlot(slot)
    ? kind === "restaurant" || kind === "cafe"
    : !isMealKind(kind) && kind !== "bar";
}
