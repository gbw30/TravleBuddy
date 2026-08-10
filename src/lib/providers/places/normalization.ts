import { z } from "zod";
import {
  boundedProviderMetadataSchema,
  normalizedPlaceSchema,
  placeCoordinatesSchema,
  type NormalizedPlace,
  type PlaceCategory,
  type ValidatedPlaceSearchRequest,
} from "./types";

const googleResponseSchema = z.object({
  places: z.array(z.unknown()).max(100).optional().default([]),
});

const googlePlaceEnvelopeSchema = z.object({
  id: z.unknown().optional(),
  displayName: z.unknown().optional(),
  formattedAddress: z.unknown().optional(),
  location: z.unknown().optional(),
  rating: z.unknown().optional(),
  priceLevel: z.unknown().optional(),
  primaryType: z.unknown().optional(),
  types: z.unknown().optional(),
  businessStatus: z.unknown().optional(),
  userRatingCount: z.unknown().optional(),
  googleMapsUri: z.unknown().optional(),
});

const googleDisplayNameSchema = z.object({
  text: z.string().trim().min(1).max(200),
});
const boundedAddressSchema = z.string().trim().min(1).max(500);
const ratingSchema = z.number().finite().min(0).max(5);
const userRatingCountSchema = z.number().int().min(0).max(2_147_483_647);
const boundedProviderIdSchema = z.string().trim().min(1).max(255);
const boundedTypeSchema = z.string().trim().min(1).max(80);
const boundedBusinessStatusSchema = z.string().trim().min(1).max(40);
const boundedUriSchema = z.url().max(2_048);

const GOOGLE_PRICE_LEVELS: Record<string, number> = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

const typeCategories: ReadonlyArray<{
  category: PlaceCategory;
  types: ReadonlySet<string>;
}> = [
  {
    category: "HOTEL",
    types: new Set([
      "bed_and_breakfast",
      "campground",
      "extended_stay_hotel",
      "guest_house",
      "hostel",
      "hotel",
      "lodging",
      "motel",
      "private_guest_room",
      "resort_hotel",
    ]),
  },
  {
    category: "RESTAURANT",
    types: new Set([
      "american_restaurant",
      "bakery",
      "bar",
      "bar_and_grill",
      "breakfast_restaurant",
      "brunch_restaurant",
      "cafe",
      "coffee_shop",
      "dessert_restaurant",
      "fast_food_restaurant",
      "food_court",
      "ice_cream_shop",
      "meal_delivery",
      "meal_takeaway",
      "restaurant",
      "vegan_restaurant",
      "vegetarian_restaurant",
      "wine_bar",
    ]),
  },
  {
    category: "ENTERTAINMENT",
    types: new Set([
      "amusement_center",
      "amusement_park",
      "bowling_alley",
      "casino",
      "comedy_club",
      "concert_hall",
      "cultural_center",
      "event_venue",
      "movie_theater",
      "night_club",
      "performing_arts_theater",
    ]),
  },
  {
    category: "LANDMARK",
    types: new Set([
      "historical_landmark",
      "monument",
      "observation_deck",
      "place_of_worship",
      "plaza",
      "town_square",
    ]),
  },
  {
    category: "ATTRACTION",
    types: new Set([
      "aquarium",
      "art_gallery",
      "botanical_garden",
      "garden",
      "museum",
      "national_park",
      "park",
      "tourist_attraction",
      "visitor_center",
      "zoo",
    ]),
  },
  {
    category: "DESTINATION",
    types: new Set([
      "administrative_area_level_1",
      "administrative_area_level_2",
      "country",
      "locality",
      "natural_feature",
      "neighborhood",
      "sublocality",
    ]),
  },
];

function parseNullable<T>(schema: z.ZodType<T>, value: unknown): T | null {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function normalizeTypes(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [
    ...new Set(
      value
        .map((entry) => parseNullable(boundedTypeSchema, entry))
        .filter((entry): entry is string => entry !== null),
    ),
  ]
    .sort((left, right) => left.localeCompare(right))
    .slice(0, 12);
}

export function mapGoogleTypesToCategory(
  primaryType: string | null,
  types: readonly string[],
): PlaceCategory {
  if (primaryType) {
    for (const mapping of typeCategories) {
      if (mapping.types.has(primaryType)) {
        return mapping.category;
      }
    }
  }

  const stableTypes = [...new Set(types)].sort((left, right) =>
    left.localeCompare(right),
  );
  for (const mapping of typeCategories) {
    if (stableTypes.some((type) => mapping.types.has(type))) {
      return mapping.category;
    }
  }

  return "ACTIVITY";
}

function normalizeGooglePlace(
  value: unknown,
  request: ValidatedPlaceSearchRequest,
): NormalizedPlace | null {
  const envelope = googlePlaceEnvelopeSchema.safeParse(value);
  if (!envelope.success) {
    return null;
  }

  const providerPlaceId = parseNullable(
    boundedProviderIdSchema,
    envelope.data.id,
  );
  const displayName = googleDisplayNameSchema.safeParse(
    envelope.data.displayName,
  );
  if (!providerPlaceId || !displayName.success) {
    return null;
  }

  const coordinates = parseNullable(
    placeCoordinatesSchema,
    envelope.data.location,
  );
  const primaryType = parseNullable(
    boundedTypeSchema,
    envelope.data.primaryType,
  );
  const types = normalizeTypes(envelope.data.types);
  const priceLevel =
    typeof envelope.data.priceLevel === "string"
      ? (GOOGLE_PRICE_LEVELS[envelope.data.priceLevel] ?? null)
      : null;

  const rawProviderData = boundedProviderMetadataSchema.parse({
    primaryType,
    types,
    businessStatus: parseNullable(
      boundedBusinessStatusSchema,
      envelope.data.businessStatus,
    ),
    userRatingCount: parseNullable(
      userRatingCountSchema,
      envelope.data.userRatingCount,
    ),
    googleMapsUri: parseNullable(boundedUriSchema, envelope.data.googleMapsUri),
  });

  return normalizedPlaceSchema.parse({
    provider: "GOOGLE_PLACES",
    providerPlaceId,
    name: displayName.data.text,
    category: mapGoogleTypesToCategory(primaryType, types),
    description: null,
    address: parseNullable(
      boundedAddressSchema,
      envelope.data.formattedAddress,
    ),
    city: request.destination.city,
    country: request.destination.country,
    latitude: coordinates?.latitude ?? null,
    longitude: coordinates?.longitude ?? null,
    rating: parseNullable(ratingSchema, envelope.data.rating),
    priceLevel,
    rawProviderData,
  });
}

export type GoogleNormalizationResult =
  | {
      status: "valid";
      places: NormalizedPlace[];
      droppedResults: number;
    }
  | {
      status: "invalid";
    };

export function normalizeGoogleTextSearchResponse(
  value: unknown,
  request: ValidatedPlaceSearchRequest,
): GoogleNormalizationResult {
  const response = googleResponseSchema.safeParse(value);
  if (!response.success) {
    return { status: "invalid" };
  }

  const normalized = response.data.places
    .map((place) => normalizeGooglePlace(place, request))
    .filter((place): place is NormalizedPlace => place !== null);

  const places = normalized
    .sort(
      (left, right) =>
        left.providerPlaceId.localeCompare(right.providerPlaceId) ||
        left.name.localeCompare(right.name),
    )
    .slice(0, request.maxResults);

  return {
    status: "valid",
    places,
    droppedResults: response.data.places.length - normalized.length,
  };
}
