import { z } from "zod";

export const PLACE_PROVIDER_MODES = ["mock", "google", "auto"] as const;
export const placeProviderModeSchema = z.enum(PLACE_PROVIDER_MODES);
export type PlaceProviderMode = z.infer<typeof placeProviderModeSchema>;

export const PLACE_PROVIDER_IDS = ["MOCK", "GOOGLE_PLACES"] as const;
export const placeProviderIdSchema = z.enum(PLACE_PROVIDER_IDS);
export type PlaceProviderId = z.infer<typeof placeProviderIdSchema>;

export const PLACE_CATEGORIES = [
  "DESTINATION",
  "HOTEL",
  "ATTRACTION",
  "RESTAURANT",
  "ACTIVITY",
  "LANDMARK",
  "ENTERTAINMENT",
] as const;
export const placeCategorySchema = z.enum(PLACE_CATEGORIES);
export type PlaceCategory = z.infer<typeof placeCategorySchema>;

export const placeCoordinatesSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
});
export type PlaceCoordinates = z.infer<typeof placeCoordinatesSchema>;

const boundedText = (maximum: number) => z.string().trim().min(1).max(maximum);

export const placeSearchRequestSchema = z.object({
  query: boundedText(200),
  destination: z.object({
    city: boundedText(120),
    country: boundedText(120),
    location: placeCoordinatesSchema.optional(),
  }),
  category: placeCategorySchema.optional(),
  maxResults: z.number().int().min(1).max(20).default(10),
  languageCode: z
    .string()
    .trim()
    .min(2)
    .max(35)
    .regex(/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/)
    .optional(),
  regionCode: z
    .string()
    .trim()
    .length(2)
    .regex(/^[A-Za-z]{2}$/)
    .transform((value) => value.toUpperCase())
    .optional(),
});
export type PlaceSearchRequest = z.input<typeof placeSearchRequestSchema>;
export type ValidatedPlaceSearchRequest = z.output<
  typeof placeSearchRequestSchema
>;

export const boundedProviderMetadataSchema = z.object({
  primaryType: z.string().trim().min(1).max(80).nullable(),
  types: z.array(z.string().trim().min(1).max(80)).max(12),
  businessStatus: z.string().trim().min(1).max(40).nullable(),
  userRatingCount: z.number().int().min(0).max(2_147_483_647).nullable(),
  googleMapsUri: z.url().max(2_048).nullable(),
});
export type BoundedProviderMetadata = z.infer<
  typeof boundedProviderMetadataSchema
>;

export const normalizedPlaceSchema = z.object({
  provider: placeProviderIdSchema,
  providerPlaceId: boundedText(255),
  name: boundedText(200),
  category: placeCategorySchema,
  description: z.string().trim().max(500).nullable(),
  address: z.string().trim().max(500).nullable(),
  city: boundedText(120),
  country: boundedText(120),
  latitude: z.number().finite().min(-90).max(90).nullable(),
  longitude: z.number().finite().min(-180).max(180).nullable(),
  rating: z.number().finite().min(0).max(5).nullable(),
  priceLevel: z.number().int().min(0).max(4).nullable(),
  rawProviderData: boundedProviderMetadataSchema,
});
export type NormalizedPlace = z.infer<typeof normalizedPlaceSchema>;

export const PLACE_PROVIDER_UNAVAILABLE_CODES = [
  "INVALID_CONFIGURATION",
  "INVALID_REQUEST",
  "MISSING_API_KEY",
  "TIMEOUT",
  "QUOTA_EXCEEDED",
  "AUTHENTICATION_FAILED",
  "TRANSIENT_UPSTREAM",
  "INVALID_RESPONSE",
  "UPSTREAM_ERROR",
] as const;
export const placeProviderUnavailableCodeSchema = z.enum(
  PLACE_PROVIDER_UNAVAILABLE_CODES,
);
export type PlaceProviderUnavailableCode = z.infer<
  typeof placeProviderUnavailableCodeSchema
>;

export type PlaceSearchSuccess = {
  status: "success";
  provider: PlaceProviderId;
  places: NormalizedPlace[];
  attempts: number;
  droppedResults: number;
  provenance: {
    kind: "live" | "mock";
    label: string;
    isFallback: boolean;
  };
  fallback: {
    from: "GOOGLE_PLACES";
    code: PlaceProviderUnavailableCode;
    message: string;
  } | null;
};

export type PlaceSearchUnavailable = {
  status: "unavailable";
  provider: PlaceProviderId;
  code: PlaceProviderUnavailableCode;
  message: string;
  retryable: boolean;
  attempts: number;
};

export type PlaceSearchOutcome = PlaceSearchSuccess | PlaceSearchUnavailable;

export interface PlaceProvider {
  readonly id: PlaceProviderId;
  search(request: PlaceSearchRequest): Promise<PlaceSearchOutcome>;
}

export type PlaceProviderEnvironment = {
  NODE_ENV?: string;
  PLACE_PROVIDER_MODE?: string;
  QA_PROVIDER_MODE?: string;
  GOOGLE_PLACES_API_KEY?: string;
};
