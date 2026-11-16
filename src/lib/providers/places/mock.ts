import { getMockPlacesForCityCategory } from "@/features/recommendations/mock-places";
import {
  boundedProviderMetadataSchema,
  normalizedPlaceSchema,
  placeSearchRequestSchema,
  type PlaceProvider,
  type PlaceSearchOutcome,
} from "./types";

export class MockPlacesProvider implements PlaceProvider {
  readonly id = "MOCK" as const;

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

    const places = parsed.data.category
      ? getMockPlacesForCityCategory(
          parsed.data.destination.city,
          parsed.data.destination.country,
          parsed.data.category,
          parsed.data.maxResults,
        ).map((place) =>
          normalizedPlaceSchema.parse({
            provider: this.id,
            providerPlaceId: place.id,
            name: place.name,
            category: place.category,
            description: place.description,
            address: place.address,
            city: place.city,
            country: place.country,
            latitude: place.latitude,
            longitude: place.longitude,
            rating: place.rating,
            priceLevel: place.priceLevel,
            estimatedCostAmount: place.estimatedCostAmount,
            estimatedCostCurrency: place.estimatedCostCurrency,
            rawProviderData: boundedProviderMetadataSchema.parse({
              primaryType: `mock_${place.category.toLocaleLowerCase()}`,
              types: [place.category.toLocaleLowerCase()],
              businessStatus: "OPERATIONAL",
              userRatingCount: null,
              googleMapsUri: null,
            }),
          }),
        )
      : [];

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
