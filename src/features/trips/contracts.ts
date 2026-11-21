// What the Trips routes accept and return. Safe to import in the browser:
// this file must not import server code.
import { z } from "zod";

import { citySchema, type City } from "@/features/places/contracts";
import { CURRENCIES } from "@/lib/currency";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  // Parsing alone lets "2027-02-30" through as 2 March, so the date must
  // read back as written.
  .refine(
    (value) => {
      const time = Date.parse(`${value}T00:00:00Z`);
      return (
        !Number.isNaN(time) &&
        new Date(time).toISOString().slice(0, 10) === value
      );
    },
    {
      message: "Not a real date.",
    },
  );
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
/** Text a traveller typed: trimmed, and empty becomes null. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => value || null);

/** The place without an airport or station code in brackets: "London (LHR)" is London. */
export function placeName(place: string): string {
  return place
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const TICKET_MODES = ["FLIGHT", "TRAIN", "BUS", "FERRY"] as const;
export type TicketMode = (typeof TICKET_MODES)[number];

const daysBetween = (from: string, to: string) =>
  (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
  86_400_000;

const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);

export const ticketInputSchema = z
  .object({
    mode: z.enum(TICKET_MODES),
    from: z.string().trim().min(1).max(120),
    to: z.string().trim().min(1).max(120),
    departDate: isoDate,
    departTime: clock,
    arriveDate: isoDate,
    arriveTime: clock,
    reference: optionalText(80),
  })
  // Times are local to each place, so a flight west across the date line can
  // land a calendar day before it leaves. Anything earlier is a typing slip.
  .refine((ticket) => daysBetween(ticket.departDate, ticket.arriveDate) >= -1, {
    path: ["arriveDate"],
    message: "The arrival is before the departure.",
  });
export type TicketInput = z.infer<typeof ticketInputSchema>;

export const PLANNING_MODES = ["GUIDED", "QUICK"] as const;
export type PlanningMode = (typeof PLANNING_MODES)[number];

export const startTripSchema = z.object({
  tickets: z.array(ticketInputSchema).max(12),
  planningMode: z.enum(PLANNING_MODES),
});
export type StartTripInput = z.infer<typeof startTripSchema>;

export const COMMITMENT_KINDS = [
  "TRANSPORT",
  "STAY",
  "RESERVATION",
  "MUST_SEE",
  "OTHER",
] as const;
export type CommitmentKind = (typeof COMMITMENT_KINDS)[number];

/** A stay's address, once the traveller has confirmed the one found. */
export const locatedSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  ref: z.string().trim().min(1).max(80),
  address: z.string().trim().min(1).max(240),
});
export type Located = z.infer<typeof locatedSchema>;

/** How a step's times read: after one, before one, any time that day, or between two. */
export const TIME_SHAPES = ["AFTER", "BEFORE", "ANY", "BETWEEN"] as const;
export type TimeShape = (typeof TIME_SHAPES)[number];

export const commitmentInputSchema = z
  .object({
    kind: z.enum(COMMITMENT_KINDS),
    title: z.string().trim().min(1).max(160),
    date: isoDate.nullish().transform((value) => value ?? null),
    startTime: clock.nullish().transform((value) => value ?? null),
    endDate: isoDate.nullish().transform((value) => value ?? null),
    endTime: clock.nullish().transform((value) => value ?? null),
    /** Null is a set time. */
    timeShape: z
      .enum(TIME_SHAPES)
      .nullish()
      .transform((value) => value ?? null),
    reference: optionalText(80),
    note: optionalText(500),
    located: locatedSchema.nullish().transform((value) => value ?? null),
    /** What a ticket is. Every ticket has one (TB-FIX-08); the column stays nullable for old rows. */
    transportMode: z
      .enum(TICKET_MODES)
      .nullish()
      .transform((value) => value ?? null),
  })
  .refine((c) => c.kind === "STAY" || !c.located, {
    path: ["located"],
    message: "Only a stay has an address.",
  })
  .refine((c) => (c.kind === "TRANSPORT") === (c.transportMode !== null), {
    path: ["transportMode"],
    message: "A ticket needs its type: flight, train, bus or ferry.",
  })
  .refine((c) => !c.startTime || c.date, {
    path: ["date"],
    message: "A time needs a date.",
  })
  .refine(
    (c) => {
      if (c.timeShape === null) return true;
      if (c.kind === "TRANSPORT" || !c.date) return false;
      // A stay keeps its check-out date and time beside its check-in shape.
      if (c.kind === "STAY" && c.timeShape === "AFTER") return !!c.startTime;
      if (c.endDate) return false;
      if (c.timeShape === "ANY") return !c.startTime && !c.endTime;
      if (c.timeShape === "BETWEEN") {
        return !!c.startTime && !!c.endTime && c.endTime > c.startTime;
      }
      return !!c.startTime && !c.endTime;
    },
    {
      path: ["timeShape"],
      message:
        "That shape needs a date and its times, and is not for a ticket.",
    },
  )
  .refine((c) => !c.endTime || c.startTime, {
    path: ["startTime"],
    message: "An end time needs a start time.",
  })
  // A ticket's two ends are in two places, so their dates and clocks cannot be
  // compared as written: a flight west can land a day earlier, or earlier on
  // the clock. Zones are known only later, where the ticket is saved.
  .refine(
    (c) =>
      !c.endDate ||
      (c.date &&
        c.endDate >= (c.kind === "TRANSPORT" ? addDays(c.date, -1) : c.date)),
    {
      path: ["endDate"],
      message: "The end date is before the start.",
    },
  )
  .refine(
    (c) =>
      c.kind === "TRANSPORT" ||
      !c.endTime ||
      !c.startTime ||
      (c.endDate && c.endDate !== c.date) ||
      c.endTime >= c.startTime,
    { path: ["endTime"], message: "The end time is before the start." },
  );
export type CommitmentInput = z.infer<typeof commitmentInputSchema>;

export const FIRMNESS = ["FIXED", "FLEXIBLE"] as const;
export type Firmness = (typeof FIRMNESS)[number];
export const BUDGET_BASES = ["TRIP", "DAY"] as const;
export type BudgetBasis = (typeof BUDGET_BASES)[number];

const count = (min: number, max: number) => z.number().int().min(min).max(max);

export const DATES_ORDER_MESSAGE = "The trip ends before it starts.";
export const LANDS_BEFORE_LEAVING =
  "The ticket lands before it leaves, by the clocks of both places. Check the times and dates.";

/** Every fact is optional: a save changes only the facts it names. */
export const tripFactsSchema = z
  .object({
    cities: z
      .array(z.object({ city: citySchema, nights: count(1, 90).nullable() }))
      .max(12),
    startDate: isoDate.nullable(),
    endDate: isoDate.nullable(),
    lengthNights: count(1, 365).nullable(),
    timeOfYear: count(1, 12).nullable(),
    datesFirmness: z.enum(FIRMNESS).nullable(),
    adults: count(1, 20).nullable(),
    children: count(0, 20).nullable(),
    budgetAmount: z.number().positive().max(10_000_000).nullable(),
    budgetCurrency: z.enum(CURRENCIES).nullable(),
    budgetBasis: z.enum(BUDGET_BASES).nullable(),
    budgetFirmness: z.enum(FIRMNESS).nullable(),
    purpose: optionalText(120),
  })
  .partial()
  .refine(
    (facts) =>
      !facts.startDate || !facts.endDate || facts.endDate >= facts.startDate,
    { path: ["endDate"], message: DATES_ORDER_MESSAGE },
  );
export type TripFactsInput = z.infer<typeof tripFactsSchema>;

/** A change to an existing trip names the revision it was made against. */
const control = {
  operationId: z.uuid(),
  expectedRevision: z.number().int().nonnegative(),
};

export const tripActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("rename"),
    title: z.string().trim().min(1).max(120),
    ...control,
  }),
  z.object({ action: z.literal("facts"), facts: tripFactsSchema, ...control }),
  z.object({ action: z.literal("archive"), ...control }),
  z.object({ action: z.literal("restore"), ...control }),
  z.object({ action: z.literal("finish"), ...control }),
  z.object({ action: z.literal("reopen"), ...control }),
  z.object({
    action: z.literal("mode"),
    planningMode: z.enum(PLANNING_MODES),
    ...control,
  }),
]);
export type TripAction = z.infer<typeof tripActionSchema>;

export const commitmentActionSchema = z.object({
  commitment: commitmentInputSchema,
  ...control,
});
export const controlSchema = z.object(control);

/** The title every trip starts with when no ticket names a city. */
export const NEW_TRIP_TITLE = "New trip";

export type TripState = "planning" | "upcoming" | "past";

export type TripFacts = {
  cities: { city: City; nights: number | null }[];
  startDate: string | null;
  endDate: string | null;
  lengthNights: number | null;
  timeOfYear: number | null;
  datesFirmness: Firmness | null;
  adults: number | null;
  children: number | null;
  budgetAmount: number | null;
  budgetCurrency: (typeof CURRENCIES)[number] | null;
  budgetBasis: BudgetBasis | null;
  budgetFirmness: Firmness | null;
  purpose: string | null;
};

/** A fact the plan cannot start without. */
export type MissingFact = "where" | "when" | "who" | "budget";

export type TripSummary = {
  id: string;
  title: string;
  state: TripState;
  archived: boolean;
  /** Goes back with every change, so a stale screen cannot overwrite a newer one. */
  revision: number;
  planningMode: PlanningMode | null;
  startDate: string | null;
  endDate: string | null;
  cities: string[];
  commitmentCount: number;
  missingFacts: MissingFact[];
};

export type CommitmentDto = {
  id: string;
  kind: CommitmentKind;
  title: string;
  date: string | null;
  startTime: string | null;
  endDate: string | null;
  endTime: string | null;
  /** Null reads as a set time, except a stay's check-in: see `windowOf`. */
  timeShape?: TimeShape | null;
  reference: string | null;
  note: string | null;
  /** A stay's confirmed address. Null: none confirmed, and nothing is guessed. */
  located: Located | null;
  /** A ticket's type. Null on a ticket saved before the type was required. */
  transportMode?: string | null;
  transport: {
    mode: string;
    origin: string;
    destination: string;
    /** The time zone of each end, when known: the length of a ticket needs both. */
    originZone: string | null;
    destinationZone: string | null;
  } | null;
};

/** Two commitments whose times overlap. The traveller decides; the product does not. */
export type Clash = { first: string; second: string };

export type TripDetail = TripSummary & {
  facts: TripFacts;
  commitments: CommitmentDto[];
  clashes: Clash[];
};

/** A step laid inside a window of the day, not at a set time. A bound that is open is null. */
export type TimeWindow = {
  shape: TimeShape;
  from: string | null;
  to: string | null;
};

/**
 * The window a commitment reads as, or null for a set time. A stay's check-in
 * with a time and no stored shape is "any time after" it (TB-ITN-22).
 */
export function windowOf(
  c: Pick<CommitmentDto, "kind" | "startTime" | "endTime" | "timeShape">,
): TimeWindow | null {
  const shape =
    c.timeShape ?? (c.kind === "STAY" && c.startTime ? "AFTER" : null);
  if (shape === "ANY") return { shape, from: null, to: null };
  if (shape === "BETWEEN") {
    return c.startTime && c.endTime
      ? { shape, from: c.startTime, to: c.endTime }
      : null;
  }
  if (!shape || !c.startTime) return null;
  return shape === "AFTER"
    ? { shape, from: c.startTime, to: null }
    : { shape, from: null, to: c.startTime };
}

/** The words of a window's row: its title, and a note under it. Fixed interface text. */
export function windowWords(
  c: Pick<CommitmentDto, "kind" | "title">,
  window: TimeWindow,
): { title: string; note: string | null } {
  const stay = c.kind === "STAY";
  const phrase = {
    AFTER: ` from ${window.from}`,
    BEFORE: ` by ${window.to}`,
    ANY: "",
    BETWEEN: ` between ${window.from} and ${window.to}`,
  }[window.shape];
  const aside = {
    AFTER: "any time after",
    BEFORE: "any time before",
    ANY: "Any time today",
    BETWEEN: null,
  }[window.shape];
  return {
    title: stay
      ? `${window.shape === "BEFORE" ? "Check out" : "Check in"}${phrase}`
      : `${c.title}${phrase}`,
    note: [stay ? c.title : null, aside].filter(Boolean).join(" · ") || null,
  };
}
