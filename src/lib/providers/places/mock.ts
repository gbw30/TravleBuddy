import {
  boundedProviderMetadataSchema,
  normalizedPlaceSchema,
  placeSearchRequestSchema,
  type NormalizedPlace,
  type PlaceCategory,
  type PlaceProvider,
  type PlaceSearchOutcome,
  type ValidatedPlaceSearchRequest,
} from "./types";

type MockTemplate = {
  id: string;
  name: string;
  category: PlaceCategory;
  description: string;
  rating: number;
  priceLevel: number;
  latitudeOffset: number;
  longitudeOffset: number;
  types: string[];
};

const DEFAULT_MOCK_TEMPLATES: readonly MockTemplate[] = [
  {
    id: "culture-walk",
    name: "Old Town Culture Walk",
    category: "ATTRACTION",
    description: "A low-cost walk through historic streets and local corners.",
    rating: 4.6,
    priceLevel: 1,
    latitudeOffset: 0.001,
    longitudeOffset: 0.001,
    types: ["historical_landmark", "tourist_attraction"],
  },
  {
    id: "signature-museum",
    name: "Signature Museum",
    category: "ATTRACTION",
    description: "A well-rated museum stop for a culture-focused day.",
    rating: 4.8,
    priceLevel: 2,
    latitudeOffset: 0.002,
    longitudeOffset: -0.001,
    types: ["museum", "tourist_attraction"],
  },
  {
    id: "neighborhood-market",
    name: "Neighborhood Market",
    category: "ACTIVITY",
    description: "A relaxed local market experience with flexible timing.",
    rating: 4.5,
    priceLevel: 1,
    latitudeOffset: -0.001,
    longitudeOffset: 0.002,
    types: ["market", "point_of_interest"],
  },
  {
    id: "local-dinner",
    name: "Local Dinner Room",
    category: "RESTAURANT",
    description: "A regional dinner option with a calm local atmosphere.",
    rating: 4.7,
    priceLevel: 2,
    latitudeOffset: -0.002,
    longitudeOffset: -0.001,
    types: ["restaurant"],
  },
  {
    id: "central-hotel",
    name: "Central Transit Hotel",
    category: "HOTEL",
    description: "A practical base with convenient public transit access.",
    rating: 4.4,
    priceLevel: 2,
    latitudeOffset: 0.003,
    longitudeOffset: 0.002,
    types: ["hotel", "lodging"],
  },
  {
    id: "rooftop-evening",
    name: "Rooftop Evening Spot",
    category: "ENTERTAINMENT",
    description: "An evening venue with skyline views and live music.",
    rating: 4.5,
    priceLevel: 3,
    latitudeOffset: -0.003,
    longitudeOffset: 0.001,
    types: ["event_venue", "night_club"],
  },
] as const;

function slug(value: string) {
  return (
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "destination"
  );
}

function buildMockPlace(
  template: MockTemplate,
  request: ValidatedPlaceSearchRequest,
): NormalizedPlace {
  const location = request.destination.location;
  const latitude = location
    ? Math.max(-90, Math.min(90, location.latitude + template.latitudeOffset))
    : null;
  const longitude = location
    ? Math.max(
        -180,
        Math.min(180, location.longitude + template.longitudeOffset),
      )
    : null;

  return normalizedPlaceSchema.parse({
    provider: "MOCK",
    providerPlaceId: `mock:${slug(request.destination.city)}:${template.id}`,
    name: `${request.destination.city} ${template.name}`,
    category: template.category,
    description: template.description,
    address: `${request.destination.city} planning district`,
    city: request.destination.city,
    country: request.destination.country,
    latitude,
    longitude,
    rating: template.rating,
    priceLevel: template.priceLevel,
    rawProviderData: boundedProviderMetadataSchema.parse({
      primaryType: template.types[0],
      types: [...template.types].sort(),
      businessStatus: "OPERATIONAL",
      userRatingCount: null,
      googleMapsUri: null,
    }),
  });
}

export class MockPlacesProvider implements PlaceProvider {
  readonly id = "MOCK" as const;

  constructor(
    private readonly templates: readonly MockTemplate[] = DEFAULT_MOCK_TEMPLATES,
  ) {}

  async search(request: Parameters<PlaceProvider["search"]>[0]) {
    const parsed = placeSearchRequestSchema.safeParse(request);
    if (!parsed.success) {
      return {
        status: "unavailable",
        provider: this.id,
        code: "INVALID_REQUEST",
        message: "The place search request is invalid.",
        retryable: false,
        attempts: 0,
      } satisfies PlaceSearchOutcome;
    }

    const places = this.templates
      .filter(
        (template) =>
          !parsed.data.category || template.category === parsed.data.category,
      )
      .map((template) => buildMockPlace(template, parsed.data))
      .sort(
        (left, right) =>
          left.providerPlaceId.localeCompare(right.providerPlaceId) ||
          left.name.localeCompare(right.name),
      )
      .slice(0, parsed.data.maxResults);

    return {
      status: "success",
      provider: this.id,
      places,
      attempts: 0,
      droppedResults: 0,
      provenance: {
        kind: "mock",
        label: "Mock planning data",
        isFallback: false,
      },
      fallback: null,
    } satisfies PlaceSearchOutcome;
  }
}
