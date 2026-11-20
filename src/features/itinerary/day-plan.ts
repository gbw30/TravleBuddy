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
import {
  placeName,
  type CommitmentDto,
  type TripFacts,
} from "@/features/trips/contracts";

import {
  isMeal,
  slotWords,
  type Pace,
  type PlanBlocker,
  type PlanDay,
  type PlanEntry,
  type PlanFlag,
  type PlanState,
  type PlanView,
  type SlotKind,
} from "./contracts";
import { offsetAt, ticketMinutes } from "./local-time";

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
/** A meal may start this much later than usual; after that it is no longer a gap to fill. */
const MEAL_LATE = 60;
/**
 * Minutes the plan allows before and after a ticket: to the airport or station
 * and through check-in, then out of it. Any mode but a flight is ground.
 */
export const ALLOWANCE: Record<
  "FLIGHT" | "GROUND",
  { before: number; after: number }
> = {
  FLIGHT: { before: 120, after: 60 },
  GROUND: { before: 30, after: 20 },
};
/** An assumed transfer, with no ticket, keeps these. */
const ASSUMED_BEFORE = 60;
const ASSUMED_AFTER = 30;
/** Breakfast starts with the day, if the day starts in this window, and takes this long. */
export const BREAKFAST = { from: 450, until: 600, minutes: 45 };
/** A ticket from an earlier date that lands by this time still leaves a night at the stay. */
export const NIGHT_AT_STAY_UNTIL = 3 * 60;
/** Less time than this between lunch and something decided is not time to wander. */
const MIN_WANDER = 30;
const ASSUMED_TRANSFER_START = 12 * 60;

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

/**
 * The mode a ticket records and the time allowed around it. A ticket with no
 * details has no known mode but keeps the larger, flight allowance.
 */
function allowanceOf(commitment: CommitmentDto) {
  const mode = commitment.transport?.mode ?? null;
  return {
    mode,
    ...ALLOWANCE[mode && mode !== "FLIGHT" ? "GROUND" : "FLIGHT"],
  };
}

/**
 * The stay that covers a night: from its check-in date up to, but not
 * including, its end date. With no end date it covers only the check-in night.
 * A stay with a confirmed position wins over one without.
 */
function stayForNight(
  commitments: CommitmentDto[],
  night: string,
): CommitmentDto | null {
  const covering = commitments.filter(
    (c) =>
      c.kind === "STAY" &&
      c.date !== null &&
      c.date <= night &&
      night <
        (c.endDate && c.endDate > c.date ? c.endDate : addDays(c.date, 1)),
  );
  return covering.find((c) => c.located) ?? covering[0] ?? null;
}

/** The stay of the night before a day, where the day starts: a confirmed one, or any. */
export const morningStayOf = (commitments: CommitmentDto[], date: string) =>
  stayForNight(commitments, addDays(date, -1));

/** A stay's check-in time is a window, not an appointment: it is laid at the first gap after it. */
const isCheckIn = (fixed: Fixed, date: string) =>
  fixed.commitment.kind === "STAY" && fixed.commitment.date === date;

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
  // A stay is its check-in. A ticket ends at its arrival clock, or fills the
  // evening when it lands another day; it has no length of its own to guess.
  const isTicket = commitment.kind === "TRANSPORT";
  const end =
    commitment.kind === "STAY"
      ? start + 30
      : isTicket
        ? sameDay
          ? commitment.endTime
            ? toMinutes(commitment.endTime)
            : start
          : DAY_END
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
    /** Time allowed to get to and from tickets today. */
    allowances: Extract<PlanEntry, { type: "allowance" }>[];
    /** The row out of the ticket that changes city: the one allowance in the new city's part. */
    arrival: Extract<PlanEntry, { type: "allowance" }> | null;
    /** When the transfer arrives, by the clock of the city of arrival. */
    landsAt: number;
    /** When the traveller leaves the morning's city, on a day with two segments. */
    leaves: number;
    /** The segment in tonight's city, where a check-in today waits; -1 when it is not reached today. */
    stayIn: number;
    slots: DraftSlot[];
    /** When breakfast where the traveller stays is shown, if it is. */
    stayBreakfast: number | null;
    /** Slot id to the must-include that holds it. */
    held: Map<string, CommitmentDto>;
    /** Commitments with a date but no time that take no slot: stays, tickets. */
    notes: CommitmentDto[];
    /** The stay of the night before, where the day starts; and of tonight, where it ends. */
    morningStay: CommitmentDto | null;
    eveningStay: CommitmentDto | null;
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
    const allowances: Draft["allowances"] = [];
    let landedFrom = null as {
      ticket: CommitmentDto;
      row: Draft["allowances"][number];
    } | null;
    if (landed.length > 0) {
      const last = landed.reduce((a, b) =>
        toMinutes(b.endTime!) > toMinutes(a.endTime!) ? b : a,
      );
      const { mode, after } = allowanceOf(last);
      const at = toMinutes(last.endTime!);
      from = Math.max(from, at + after);
      landedFrom = {
        ticket: last,
        row: {
          type: "allowance",
          way: "from",
          mode,
          start: toClock(at),
          minutes: after,
        },
      };
      allowances.push(landedFrom.row);
    }
    if (index === totalNights && totalNights > 0 && tickets.length > 0) {
      const first = tickets.reduce((a, b) => (b.start < a.start ? b : a));
      const { mode, before: wanted } = allowanceOf(first.commitment);
      // A flight in the small hours leaves less than the full time before it.
      const rowStart = Math.max(0, first.start - wanted);
      const before = first.start - rowStart;
      until = Math.min(until, rowStart);
      allowances.push({
        type: "allowance",
        way: "to",
        mode,
        start: toClock(rowStart),
        minutes: before,
      });
    }

    let segments: Segment[];
    let transfer: Draft["transfer"] = null;
    let landsAt = 0;
    let leaves = 0;
    let arrival: Draft["arrival"] = null;
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
      leaves = leave;
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
      // A ticket that does not land today, or has no arrival time, leaves
      // the rest of the day unplanned: the next city starts tomorrow.
      const lands =
        !ticket ||
        (ticket.commitment.endTime !== null &&
          (ticket.commitment.endDate ?? date) === date);
      const { mode, before, after } = ticket
        ? allowanceOf(ticket.commitment)
        : { mode: null, before: ASSUMED_BEFORE, after: ASSUMED_AFTER };
      if (ticket) {
        allowances.push({
          type: "allowance",
          way: "to",
          mode,
          start: toClock(leave - before),
          // A ticket in the small hours leaves only the time since midnight.
          minutes: Math.min(before, leave),
        });
        // On the first day the landing above may already be this ticket's row.
        if (lands && landedFrom?.ticket === ticket.commitment) {
          arrival = landedFrom.row;
        } else if (lands) {
          arrival = {
            type: "allowance",
            way: "from",
            mode,
            start: toClock(arrive),
            minutes: after,
          };
          allowances.push(arrival);
        }
      }
      segments = [{ city: morningCity, from, until: leave - before }];
      if (lands)
        segments.push({ city: eveningCity, from: arrive + after, until });
    }

    const slots: DraftSlot[] = [];
    // Breakfast starts with the day, and only a day that starts in the
    // morning has one. Day 1 has no night behind it, so none is "at the
    // stay"; nor has a morning after a night on a ticket that lands today,
    // unless it lands early enough to sleep there.
    const overnight = landed.some(
      (c) => c.date !== date && toMinutes(c.endTime!) > NIGHT_AT_STAY_UNTIL,
    );
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
      } else if (
        context.breakfast === "included" &&
        index > 0 &&
        !overnight &&
        !taken
      ) {
        stayBreakfast = dayStart;
      }
    }
    for (const [kind, standard] of templates[state.pace]) {
      const usual = standard + shift;
      const segment = segments.find(
        (s) => s.from <= usual + LATE_START && usual + 60 <= s.until,
      );
      if (!segment) continue;
      if (isMeal(kind) && segment.from > usual + MEAL_LATE) continue;
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

    const stayIn = segments.findIndex(
      (s) => cityKeyOf(s.city) === cityKeyOf(eveningCity),
    );
    drafts.push({
      day,
      date,
      city: morningCity,
      segments,
      fixed,
      transfer,
      allowances,
      arrival,
      landsAt,
      leaves,
      stayIn,
      slots,
      stayBreakfast,
      held: new Map(),
      // A check-in in a city the traveller does not reach today has no time today.
      notes:
        stayIn === -1
          ? fixed.filter((f) => isCheckIn(f, date)).map((f) => f.commitment)
          : [],
      morningStay: stayForNight(context.commitments, addDays(date, -1)),
      eveningStay: stayForNight(context.commitments, date),
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
        (wantMeal === null || isMeal(slot.kind) === wantMeal),
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
  // The same days with nothing picked: an open slot that fits there, and no
  // longer does, was pushed out by the picks before it.
  const bare =
    Object.keys(state.picks).length > 0
      ? buildPlanView({ ...state, picks: {} }, context)
      : null;
  const usedPicks = new Set<string>();
  const notes: ({ key: string; text: string } | null | undefined)[] = [];
  const days: PlanDay[] = drafts.map((draft) => {
    // A step's segment: 0 for where the day starts, 1 after the city
    // changes. Steps go by segment, then time: across the date line the
    // clock of the city of arrival can read earlier than the one left.
    type Step = { at: number; segment: number } & (
      | { fixed: Fixed }
      | { transfer: NonNullable<Draft["transfer"]> }
      | { allowance: Draft["allowances"][number] }
      | { slot: DraftSlot }
      | { checkIn: Fixed }
      | { breakfast: true }
    );
    const changes = draft.segments.length > 1;
    const steps: Step[] = [
      ...(draft.stayBreakfast === null
        ? []
        : [{ at: draft.stayBreakfast, segment: 0, breakfast: true as const }]),
      // A check-in is a window, not an appointment: it waits until the
      // traveller is in its city and out of any station or airport, and is
      // laid at the first gap after that.
      ...(draft.stayIn === -1
        ? []
        : draft.fixed
            .filter((fixed) => isCheckIn(fixed, draft.date))
            .map((checkIn) => ({
              at: Math.max(checkIn.start, draft.segments[draft.stayIn].from),
              segment: draft.stayIn,
              checkIn,
            }))),
      ...draft.fixed
        .filter((fixed) => !isCheckIn(fixed, draft.date))
        .map((fixed) => ({
          // On day 1, a ticket into the first city that lands earlier by the
          // clock than it left is over before the day starts: it goes first.
          at:
            draft.day === 1 &&
            fixed.end < fixed.start &&
            fixed.commitment.kind === "TRANSPORT" &&
            fixed.commitment.date === draft.date &&
            fixed.commitment.endDate === draft.date &&
            !(changes && fixed.start >= draft.leaves)
              ? -1
              : fixed.start,
          segment: changes && fixed.start > draft.leaves ? 1 : 0,
          fixed,
        })),
      // Only the way out of the ticket that changes city is in the new one.
      ...draft.allowances.map((allowance) => ({
        at: toMinutes(allowance.start),
        segment: allowance === draft.arrival ? 1 : 0,
        allowance,
      })),
      ...(draft.transfer
        ? [
            {
              at: toMinutes(draft.transfer.start),
              segment: 0,
              transfer: draft.transfer,
            },
          ]
        : []),
      ...draft.slots.map((slot) => ({
        at: slot.earliest,
        segment: draft.segments.findIndex((s) => s.city === slot.city),
        slot,
      })),
    ].sort((a, b) => a.segment - b.segment || a.at - b.at);

    const entries: PlanEntry[] = draft.notes.map((commitment) => ({
      type: "commitment",
      commitmentId: commitment.id,
      commitmentKind: commitment.kind,
      title: commitment.title,
      start: null,
      minutes: null,
      slotId: null,
      ticket: null,
    }));
    let clock = draft.segments[0].from;
    type Point = { latitude: number; longitude: number };
    // The day starts where the traveller slept, when that is confirmed.
    let lastPoint = (draft.morningStay?.located ?? null) as Point | null;
    let lastPlaceName: string | null = null;
    // The last place laid out, while nothing else has come after it: the way
    // back to the stay starts there.
    let lastPlace = null as {
      flags: PlanFlag[];
      point: Point;
      until: number;
    } | null;
    let lastPick = null as { flags: PlanFlag[]; segment: number } | null;
    // The day's last place, wherever it ends up: the way back is from it.
    let finalPlace = null as {
      index: number;
      point: Point | null;
      end: number;
      name: string;
    } | null;
    // A check-in that waits for a booking it would run into.
    let waiting = null as Extract<Step, { checkIn: Fixed }> | null;

    const layCheckIn = (
      step: Extract<Step, { checkIn: Fixed }>,
      position: number,
    ) => {
      const { commitment, start, end } = step.checkIn;
      const spot = commitment.located;
      // From the last point in this city; a station has no position.
      const leg =
        spot && lastPoint
          ? travelEstimate(lastPoint, spot, context.means)
          : null;
      const at = Math.max(step.at, clock + (leg ? leg.minutes + buffer : 0));
      // It and its leg never run into a booking listed after it: it goes after.
      const booking = steps
        .slice(position + 1)
        .find(
          (later) =>
            "fixed" in later &&
            later.segment === step.segment &&
            later.fixed.commitment.kind !== "TRANSPORT",
        );
      if (booking && booking.at < at + (end - start)) {
        waiting = step;
        return;
      }
      entries.push({
        type: "commitment",
        commitmentId: commitment.id,
        commitmentKind: commitment.kind,
        title: spot ? `Check in at ${commitment.title}` : commitment.title,
        start: toClock(at),
        minutes: end - start,
        slotId: null,
        ticket: null,
        ...(spot
          ? {
              travelIn: leg ? { means: leg.means, minutes: leg.minutes } : null,
            }
          : {}),
      });
      clock = at + (end - start);
      lastPoint = spot;
      lastPlace = null;
    };

    steps.forEach((step, position) => {
      if ("breakfast" in step) {
        // Breakfast where the traveller stays takes its time, as a slot does.
        entries.push({
          type: "breakfast-at-stay",
          start: toClock(step.at),
          minutes: BREAKFAST.minutes,
        });
        clock = Math.max(clock, step.at + BREAKFAST.minutes);
        lastPoint = draft.morningStay?.located ?? null;
        return;
      }
      if ("checkIn" in step) {
        layCheckIn(step, position);
        return;
      }
      if ("fixed" in step) {
        const { commitment, start, end } = step.fixed;
        // A ticket seen on its departure day; one landing today is a point.
        const ticketBound =
          commitment.kind === "TRANSPORT" && commitment.date === draft.date;
        entries.push({
          type: "commitment",
          commitmentId: commitment.id,
          commitmentKind: commitment.kind,
          title: commitment.title,
          start: toClock(start),
          minutes: ticketBound ? ticketMinutes(commitment) : end - start,
          slotId: null,
          ticket:
            ticketBound && commitment.transport
              ? {
                  from: placeName(commitment.transport.origin),
                  to: placeName(commitment.transport.destination),
                  arrives: commitment.endTime,
                  arrivesOn:
                    commitment.endDate && commitment.endDate !== draft.date
                      ? commitment.endDate
                      : null,
                }
              : null,
        });
        // A ticket that lands earlier by the clock than it left crossed the
        // date line: the day goes on by the clock it lands in. One listed
        // first (at -1) is already behind the day's start.
        clock = end < start && step.at >= 0 ? end : Math.max(clock, end);
        lastPoint = null;
        lastPlace = null;
        if (waiting) {
          const checkIn = waiting;
          waiting = null;
          layCheckIn(checkIn, position);
        }
        return;
      }
      if ("allowance" in step) {
        entries.push(step.allowance);
        if (step.allowance.way === "from") {
          clock = Math.max(clock, step.at + step.allowance.minutes);
        }
        lastPoint = null;
        lastPlace = null;
        return;
      }
      if ("transfer" in step) {
        entries.push(step.transfer);
        clock = Math.max(clock, draft.landsAt);
        lastPoint = null;
        lastPlace = null;
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
          ticket: null,
        });
        clock = Math.max(clock, slot.earliest) + 60;
        lastPoint = null;
        lastPlace = null;
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

        const entry: Extract<PlanEntry, { type: "place" }> = {
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
        };
        entries.push(entry);
        clock = end;
        lastPoint = point;
        lastPlace = point ? { flags, point, until: segment.until } : null;
        lastPlaceName = place.name;
        lastPick = { flags, segment: step.segment };
        finalPlace = {
          index: entries.length - 1,
          point,
          end,
          name: place.name,
        };
      } else {
        const start = Math.max(slot.earliest, clock);
        // It needs an hour before its part of the day ends, or before
        // something decided in it begins.
        const decided = steps
          .slice(position + 1)
          .find((later) => "fixed" in later || "transfer" in later);
        const until =
          decided?.segment === step.segment
            ? Math.min(segment.until, decided.at)
            : segment.until;
        const bareStart = bare?.days[draft.day - 1].entries.find(
          (entry) => entry.type === "open" && entry.slotId === slot.id,
        )?.start;
        if (
          start + 60 > until &&
          lastPick?.segment === step.segment &&
          bareStart != null &&
          toMinutes(bareStart) + 60 <= until &&
          !lastPick.flags.some((flag) => flag.rule === "day")
        ) {
          lastPick.flags.push({
            rule: "day",
            message: `Leaves no time for ${slotWords(slot.kind)} before ${toClock(until)}.`,
            fix: "Move it earlier or shorten the visit.",
          });
        }
        // An open slot comes after the last place, so the way back follows it.
        lastPlace = null;
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
      // It ends where something decided, a transfer, or the way to a
      // ticket begins.
      if (slot.kind === "lunch" && wander > 0) {
        const start = Math.max(clock, slot.earliest + MEAL_MINUTES);
        const next = steps
          .slice(position + 1)
          .find(
            (later) =>
              "fixed" in later ||
              "transfer" in later ||
              ("allowance" in later && later.allowance.way === "to"),
          );
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

    // The way back to where the traveller sleeps tonight.
    const evening = draft.eveningStay?.located;
    if (evening && lastPlace) {
      const back = travelEstimate(lastPlace.point, evening, context.means);
      entries.push({
        type: "return",
        stay: draft.eveningStay!.title,
        start: toClock(clock),
        travel: { means: back.means, minutes: back.minutes },
      });
      if (
        clock + back.minutes + buffer > lastPlace.until &&
        !lastPlace.flags.some((flag) => flag.rule === "day")
      ) {
        lastPlace.flags.push({
          rule: "day",
          message: `The way back to ${draft.eveningStay!.title} ends at ${toClock(clock + back.minutes + buffer)}, after the day does.`,
          fix: "Move it earlier or shorten the visit.",
        });
      }
    }
    // When the last place does not end the day and nothing after it goes to
    // the stay, the way back is listed right after it only before a booking
    // it ends ahead of, buffer included. Before an open slot, whose cards
    // measure from the last place, or from a place with no position, the day
    // says it is not counted.
    let returnNote: string | null = null;
    const after = finalPlace ? entries.slice(finalPlace.index + 1) : [];
    if (
      evening &&
      !lastPlace &&
      finalPlace &&
      after.every(
        (entry) =>
          entry.type === "open" ||
          entry.type === "wander" ||
          (entry.type === "commitment" &&
            entry.commitmentKind !== "TRANSPORT" &&
            entry.commitmentKind !== "STAY"),
      )
    ) {
      const back =
        finalPlace.point &&
        travelEstimate(finalPlace.point, evening, context.means);
      const next = after[0];
      if (
        back &&
        next?.type === "commitment" &&
        next.start !== null &&
        after.every((entry) => entry.type !== "open") &&
        finalPlace.end + back.minutes + buffer <= toMinutes(next.start)
      ) {
        entries.splice(finalPlace.index + 1, 0, {
          type: "return",
          stay: draft.eveningStay!.title,
          start: toClock(finalPlace.end),
          travel: { means: back.means, minutes: back.minutes },
        });
      } else {
        returnNote = `The way back from ${finalPlace.name} is not counted.`;
      }
    }

    // What this day would say, so a run of days with the same missing stay
    // says it once. Null: every stay of the day is confirmed. Undefined:
    // nothing is chosen. A day with one confirmed stay and one not names the
    // one that is not.
    const stays = [draft.morningStay, draft.eveningStay].filter(
      (stay) => stay !== null,
    );
    const unconfirmed = [
      ...new Set(stays.filter((stay) => !stay.located).map((stay) => stay.id)),
    ];
    const unsaid = entries.some((entry) => entry.type === "place")
      ? {
          key: stays.length > 0 ? unconfirmed.join("|") : `|${draft.city.name}`,
          text:
            stays.length > 0
              ? "Travel from where you stay is not counted. Add its address."
              : "Travel from where you stay is not counted.",
        }
      : undefined;
    notes.push(stays.length > 0 && unconfirmed.length === 0 ? null : unsaid);

    return {
      day: draft.day,
      date: draft.date,
      city: draft.city.name,
      entries,
      stayNote: null,
      returnNote,
    };
  });

  // The note about a missing stay is said on the first day of a run of days
  // that would say the same.
  let said: string | null = null;
  days.forEach((day, index) => {
    const note = notes[index];
    if (note === undefined) return;
    if (note === null) said = null;
    else if (note.key !== said) {
      day.stayNote = note.text;
      said = note.key;
    }
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
  return isMeal(slot)
    ? kind === "restaurant" || kind === "cafe"
    : !isMealKind(kind) && kind !== "bar";
}
