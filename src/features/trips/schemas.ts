import { z } from "zod";

export const tripStatusSchema = z.enum(["DRAFT", "PLANNING", "ARCHIVED"]);

export const tripDestinationSchema = z.object({
  city: z.string().trim().min(1),
  country: z.string().trim().min(1),
  region: z.string().trim().min(1).optional(),
  sortOrder: z.number().int().min(0).default(0),
});

export const tripBudgetSchema = z.object({
  budgetAmount: z.coerce.number().positive(),
  budgetCurrency: z
    .string()
    .trim()
    .length(3)
    .transform((value) => value.toUpperCase()),
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
  title: z.string().trim().min(1),
  destinationSearchText: z.string().trim().min(1).optional(),
});
