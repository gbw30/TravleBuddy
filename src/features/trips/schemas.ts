import { z } from "zod";
import { canUseFullPlanning, type TripReadinessInput } from "./readiness";
import { getTripLocationTimeZone, isKnownTripLocation } from "./location-catalog";

export const tripStatusSchema = z.enum(["DRAFT", "PLANNING", "ARCHIVED"]);
export const supportedBudgetCurrencies = ["USD", "EUR"] as const;
export const supportedBudgetCurrencySchema = z.enum(supportedBudgetCurrencies);
export const travelStyleSchema = z.enum(["RELAXED", "BALANCED", "PACKED"]);
export const createTripIntentSchema = z.enum(["draft", "continue"]);

const invalidDateSentinel = Symbol("invalid date");
const optionalTrimmedString = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().optional(),
);
const patchStringSchema = z.preprocess(
  (value) => {
    if (value === null) {
      return null;
    }

    if (typeof value === "string" && value.trim() === "") {
      return null;
    }

    return value;
  },
  z.string().trim().min(1).nullable().optional(),
);
const blankStringToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

function parseStrictDate(value: unknown, blankValue: undefined | null) {
  if (typeof value === "string" && value.trim() === "") {
    return blankValue;
  }

  if (value === null) {
    return blankValue;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? invalidDateSentinel : value;
  }

  if (typeof value !== "string") {
    return value;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return invalidDateSentinel;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return invalidDateSentinel;
  }

  return date;
}

const optionalDateSchema = z.preprocess(
  (value) => parseStrictDate(value, undefined),
  z.coerce.date().optional(),
);
const patchDateSchema = z.preprocess(
  (value) => parseStrictDate(value, null),
  z.date().nullable().optional(),
);

const optionalPositiveNumberSchema = z.preprocess(
  blankStringToUndefined,
  z.coerce.number().positive().optional(),
);
const patchPositiveNumberSchema = z.preprocess(
  (value) => {
    if (value === null) {
      return null;
    }

    if (typeof value === "string" && value.trim() === "") {
      return null;
    }

    return value;
  },
  z.coerce.number().positive().nullable().optional(),
);

const requiredTitleSchema = z.string().trim().min(1, {
  message: "Trip title is required.",
});

const formIntentSchema = z.preprocess(
  (value) => blankStringToUndefined(value),
  createTripIntentSchema.default("draft"),
);

const tripLocationInputSchema = z
  .object({
    city: z.string().trim().min(1),
    country: z.string().trim().min(1),
  })
  .superRefine((value, context) => {
    if (!isKnownTripLocation(value.city, value.country)) {
      context.addIssue({
        code: "custom",
        message: "Select a supported city and country pair.",
        path: ["city"],
      });
    }
  });

const destinationsInputSchema = z.array(tripLocationInputSchema).max(12).optional();

type ContinueTripCreationInput = {
  title?: unknown;
  destinations?: readonly { city?: string | null; country?: string | null }[] | null;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
  budgetAmount?: unknown | null;
  budgetCurrency?: string | null;
  travelStyle?: string | null;
};

function hasText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function hasPositiveBudgetAmount(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return false;
  }

  const budget = typeof value === "number" ? value : Number(value);

  return Number.isFinite(budget) && budget > 0;
}

function hasValidDateRangeValues(
  startDate: Date | string | null | undefined,
  endDate: Date | string | null | undefined,
) {
  if (!startDate || !endDate) {
    return false;
  }

  const start = startDate instanceof Date ? startDate : parseStrictDate(startDate, null);
  const end = endDate instanceof Date ? endDate : parseStrictDate(endDate, null);

  return start instanceof Date && end instanceof Date && end >= start;
}

function hasDestinationValues(
  destinations: ContinueTripCreationInput["destinations"],
) {
  return Boolean(
    destinations?.some((destination) => {
      const city = destination.city;
      const country = destination.country;

      return (
        typeof city === "string" &&
        typeof country === "string" &&
        isKnownTripLocation(city.trim(), country.trim())
      );
    }),
  );
}

export function getContinueTripCreationMissingRequirements(
  input: ContinueTripCreationInput,
) {
  const missingRequirements: string[] = [];

  if (!hasText(input.title)) {
    missingRequirements.push("trip title");
  }

  if (!hasDestinationValues(input.destinations)) {
    missingRequirements.push("at least one destination");
  }

  if (!hasValidDateRangeValues(input.startDate, input.endDate)) {
    missingRequirements.push("valid date range");
  }

  if (
    !(
      hasPositiveBudgetAmount(input.budgetAmount) &&
      hasText(input.budgetCurrency)
    )
  ) {
    missingRequirements.push("trip-level budget amount and currency");
  }

  if (!hasText(input.travelStyle)) {
    missingRequirements.push("travel style");
  }

  return missingRequirements;
}

export const tripDestinationSchema = z.object({
  city: z.string().trim().min(1),
  country: z.string().trim().min(1),
  region: z.string().trim().min(1).optional(),
  sortOrder: z.number().int().min(0).default(0),
});

export const tripBudgetSchema = z.object({
  budgetAmount: z.coerce.number().positive(),
  budgetCurrency: z.preprocess(
    (value) => (typeof value === "string" ? value.trim().toUpperCase() : value),
    supportedBudgetCurrencySchema,
  ),
});

export const tripDateRangeSchema = z
  .object({
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
  })
  .refine((value) => value.endDate >= value.startDate, {
    message: "End date must be on or after start date.",
    path: ["endDate"],
  });

export const createDraftTripSchema = z.object({
  title: requiredTitleSchema,
  destinationSearchText: z.string().trim().min(1).optional(),
});

export const createTripInputSchema = z
  .object({
    intent: formIntentSchema,
    title: requiredTitleSchema,
    departureCity: optionalTrimmedString,
    departureCountry: optionalTrimmedString,
    startDate: optionalDateSchema,
    endDate: optionalDateSchema,
    budgetAmount: optionalPositiveNumberSchema,
    budgetCurrency: z.preprocess(
      (value) =>
        typeof value === "string"
          ? blankStringToUndefined(value)?.toString().toUpperCase()
          : value,
      supportedBudgetCurrencySchema.optional(),
    ),
    travelStyle: z.preprocess(blankStringToUndefined, travelStyleSchema.optional()),
    destinations: destinationsInputSchema,
  })
  .superRefine((value, context) => {
    if (Boolean(value.departureCity) !== Boolean(value.departureCountry)) {
      context.addIssue({
        code: "custom",
        message: "Departure city and country must be provided together.",
        path: ["departureCountry"],
      });
    }

    if (
      value.departureCity &&
      value.departureCountry &&
      !isKnownTripLocation(value.departureCity, value.departureCountry)
    ) {
      context.addIssue({
        code: "custom",
        message: "Select a supported departure city and country pair.",
        path: ["departureCity"],
      });
    }

    if (Boolean(value.startDate) !== Boolean(value.endDate)) {
      context.addIssue({
        code: "custom",
        message: "Start date and end date must be provided together.",
        path: ["endDate"],
      });
    }

    if (value.startDate && value.endDate && value.endDate < value.startDate) {
      context.addIssue({
        code: "custom",
        message: "End date must be on or after start date.",
        path: ["endDate"],
      });
    }

    if (Boolean(value.budgetAmount) !== Boolean(value.budgetCurrency)) {
      context.addIssue({
        code: "custom",
        message: "Budget amount and currency must be provided together.",
        path: ["budgetCurrency"],
      });
    }

    if (value.intent === "continue") {
      const missing = getContinueTripCreationMissingRequirements(value);

      for (const requirement of missing) {
        context.addIssue({
          code: "custom",
          message: `Continue requires ${requirement}.`,
          path: ["intent"],
        });
      }
    }
  })
  .transform((value) => ({
    ...value,
    ...(value.departureCity && value.departureCountry
      ? {
          departureTimeZone: getTripLocationTimeZone(
            value.departureCity,
            value.departureCountry,
          ),
        }
      : {}),
  }));

export const updateTripInputSchema = z
  .object({
    title: requiredTitleSchema,
    departureCity: optionalTrimmedString,
    departureCountry: optionalTrimmedString,
    destinationCity: optionalTrimmedString,
    destinationCountry: optionalTrimmedString,
    destinations: destinationsInputSchema,
    startDate: optionalDateSchema,
    endDate: optionalDateSchema,
    budgetAmount: optionalPositiveNumberSchema,
    budgetCurrency: z.preprocess(
      (value) =>
        typeof value === "string"
          ? blankStringToUndefined(value)?.toString().toUpperCase()
          : value,
      supportedBudgetCurrencySchema.optional(),
    ),
    travelStyle: z.preprocess(blankStringToUndefined, travelStyleSchema.optional()),
  })
  .refine(
    (value) => Boolean(value.departureCity) === Boolean(value.departureCountry),
    {
      message: "Departure city and country must be provided together.",
      path: ["departureCountry"],
    },
  )
  .refine(
    (value) =>
      !value.departureCity ||
      !value.departureCountry ||
      isKnownTripLocation(value.departureCity, value.departureCountry),
    {
      message: "Select a supported departure city and country pair.",
      path: ["departureCity"],
    },
  )
  .refine(
    (value) =>
      !(value.destinations && (value.destinationCity || value.destinationCountry)),
    {
      message: "Use destinations or legacy destination fields, not both.",
      path: ["destinations"],
    },
  )
  .refine(
    (value) =>
      Boolean(value.destinationCity) === Boolean(value.destinationCountry),
    {
      message: "Destination city and country must be provided together.",
      path: ["destinationCountry"],
    },
  )
  .refine(
    (value) =>
      !value.destinationCity ||
      !value.destinationCountry ||
      isKnownTripLocation(value.destinationCity, value.destinationCountry),
    {
      message: "Select a supported destination city and country pair.",
      path: ["destinationCity"],
    },
  )
  .refine((value) => Boolean(value.startDate) === Boolean(value.endDate), {
    message: "Start date and end date must be provided together.",
    path: ["endDate"],
  })
  .refine(
    (value) =>
      !value.startDate || !value.endDate || value.endDate >= value.startDate,
    {
      message: "End date must be on or after start date.",
      path: ["endDate"],
    },
  )
  .refine(
    (value) =>
      Boolean(value.budgetAmount) === Boolean(value.budgetCurrency),
    {
      message: "Budget amount and currency must be provided together.",
      path: ["budgetCurrency"],
    },
  );

export const patchTripInputSchema = z
  .object({
    title: requiredTitleSchema.optional(),
    departureCity: patchStringSchema,
    departureCountry: patchStringSchema,
    destinationCity: patchStringSchema,
    destinationCountry: patchStringSchema,
    destinations: z.array(tripLocationInputSchema).max(12).nullable().optional(),
    startDate: patchDateSchema,
    endDate: patchDateSchema,
    budgetAmount: patchPositiveNumberSchema,
    budgetCurrency: z.preprocess(
      (value) => {
        if (value === null) {
          return null;
        }

        if (typeof value === "string" && value.trim() === "") {
          return null;
        }

        return typeof value === "string" ? value.trim().toUpperCase() : value;
      },
      supportedBudgetCurrencySchema.nullable().optional(),
    ),
    travelStyle: z.preprocess(
      (value) => {
        if (value === null) {
          return null;
        }

        if (typeof value === "string" && value.trim() === "") {
          return null;
        }

        return value;
      },
      travelStyleSchema.nullable().optional(),
    ),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "PATCH payload must include at least one field.",
  })
  .refine(
    (value) =>
      !(value.destinations && (value.destinationCity || value.destinationCountry)),
    {
      message: "Use destinations or legacy destination fields, not both.",
      path: ["destinations"],
    },
  )
  .refine(
    (value) =>
      !value.departureCity ||
      !value.departureCountry ||
      isKnownTripLocation(value.departureCity, value.departureCountry),
    {
      message: "Select a supported departure city and country pair.",
      path: ["departureCity"],
    },
  )
  .refine(
    (value) =>
      !value.destinationCity ||
      !value.destinationCountry ||
      isKnownTripLocation(value.destinationCity, value.destinationCountry),
    {
      message: "Select a supported destination city and country pair.",
      path: ["destinationCity"],
    },
  );

export type CreateTripInput = z.input<typeof createTripInputSchema>;
export type ParsedCreateTripInput = z.output<typeof createTripInputSchema>;
export type UpdateTripInput = z.infer<typeof updateTripInputSchema>;
export type PatchTripInput = z.infer<typeof patchTripInputSchema>;
export type CreateTripIntent = z.infer<typeof createTripIntentSchema>;
export type SupportedBudgetCurrency = (typeof supportedBudgetCurrencies)[number];
export type TravelStyle = z.infer<typeof travelStyleSchema>;

export function deriveTripStatusFromDetails(
  details: Omit<TripReadinessInput, "status"> & {
    status?: TripReadinessInput["status"];
  },
) {
  if (details.status === "ARCHIVED") {
    return "ARCHIVED";
  }

  return canUseFullPlanning({
    ...details,
    status: "PLANNING",
  })
    ? "PLANNING"
    : "DRAFT";
}

export type MergedTripPatchInput = {
  title: string;
  departureCity?: string | null;
  departureCountry?: string | null;
  departureTimeZone?: string | null;
  destinationCity?: string | null;
  destinationCountry?: string | null;
  destinations?: { city: string; country: string }[] | null;
  startDate?: Date | null;
  endDate?: Date | null;
  budgetAmount?: number | null;
  budgetCurrency?: SupportedBudgetCurrency | null;
  travelStyle?: TravelStyle | null;
};

export function mergeTripPatchForValidation(
  current: MergedTripPatchInput,
  patch: PatchTripInput,
) {
  const merged = {
    ...current,
    ...patch,
  };

  const hasDestination =
    Boolean(merged.destinations?.length) ||
    Boolean(merged.destinationCity) ||
    Boolean(merged.destinationCountry);
  const hasDates = Boolean(merged.startDate) || Boolean(merged.endDate);
  const hasBudget =
    (merged.budgetAmount !== null && merged.budgetAmount !== undefined) ||
    Boolean(merged.budgetCurrency);
  const hasDeparture =
    Boolean(merged.departureCity) || Boolean(merged.departureCountry);

  if (hasDeparture && !(merged.departureCity && merged.departureCountry)) {
    throw new Error("Departure city and country must be provided together.");
  }

  if (
    merged.departureCity &&
    merged.departureCountry &&
    !isKnownTripLocation(merged.departureCity, merged.departureCountry)
  ) {
    throw new Error("Select a supported departure city and country pair.");
  }

  if (
    !merged.destinations?.length &&
    hasDestination &&
    !(merged.destinationCity && merged.destinationCountry)
  ) {
    throw new Error("Destination city and country must be provided together.");
  }

  if (
    merged.destinationCity &&
    merged.destinationCountry &&
    !isKnownTripLocation(merged.destinationCity, merged.destinationCountry)
  ) {
    throw new Error("Select a supported destination city and country pair.");
  }

  if (hasDates && !(merged.startDate && merged.endDate)) {
    throw new Error("Start date and end date must be provided together.");
  }

  if (merged.startDate && merged.endDate && merged.endDate < merged.startDate) {
    throw new Error("End date must be on or after start date.");
  }

  if (hasBudget && !(merged.budgetAmount && merged.budgetCurrency)) {
    throw new Error("Budget amount and currency must be provided together.");
  }

  return merged;
}
