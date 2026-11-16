import {
  GooglePlacesProvider,
  type GooglePlacesProviderOptions,
} from "./google";
import { MockPlacesProvider } from "./mock";
import {
  placeProviderModeSchema,
  type PlaceProvider,
  type PlaceProviderEnvironment,
  type PlaceProviderMode,
  type PlaceSearchOutcome,
  type PlaceSearchUnavailable,
} from "./types";

type CreatePlaceProviderOptions = {
  env?: PlaceProviderEnvironment;
  google?: Omit<GooglePlacesProviderOptions, "apiKey">;
  mockProvider?: PlaceProvider;
};

class UnavailablePlacesProvider implements PlaceProvider {
  readonly id = "GOOGLE_PLACES" as const;

  constructor(
    private readonly failure: Omit<PlaceSearchUnavailable, "provider">,
  ) {}

  async search(): Promise<PlaceSearchOutcome> {
    return {
      provider: this.id,
      ...this.failure,
    };
  }
}

class AutoPlacesProvider implements PlaceProvider {
  readonly id = "GOOGLE_PLACES" as const;

  constructor(
    private readonly google: PlaceProvider,
    private readonly mock: PlaceProvider,
    private readonly fallbackAllowed: boolean,
  ) {}

  async search(
    request: Parameters<PlaceProvider["search"]>[0],
  ): Promise<PlaceSearchOutcome> {
    const googleResult = await this.google.search(request);
    if (
      googleResult.status === "success" ||
      !this.fallbackAllowed ||
      googleResult.code === "INVALID_REQUEST" ||
      googleResult.code === "INVALID_CONFIGURATION"
    ) {
      return googleResult;
    }

    const mockResult = await this.mock.search(request);
    if (mockResult.status === "unavailable") {
      return googleResult;
    }

    return {
      ...mockResult,
      attempts: googleResult.attempts,
      provenance: {
        kind: "mock",
        label: `Mock planning data — Google Places unavailable (${googleResult.code})`,
        isFallback: true,
      },
      fallback: {
        from: "GOOGLE_PLACES",
        code: googleResult.code,
        message: googleResult.message,
      },
    };
  }
}

function normalizeMode(value: string | undefined) {
  return value?.trim().toLocaleLowerCase();
}

export function resolvePlaceProviderMode(
  env: PlaceProviderEnvironment,
): PlaceProviderMode | null {
  const candidate = normalizeMode(
    env.PLACE_PROVIDER_MODE ?? env.QA_PROVIDER_MODE ?? "auto",
  );
  const parsed = placeProviderModeSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

export function createPlaceProvider(
  options: CreatePlaceProviderOptions = {},
): PlaceProvider {
  const env = options.env ?? process.env;
  const mode = resolvePlaceProviderMode(env);
  if (!mode) {
    return new UnavailablePlacesProvider({
      status: "unavailable",
      code: "INVALID_CONFIGURATION",
      message: "PLACE_PROVIDER_MODE must be mock, google, or auto.",
      retryable: false,
      attempts: 0,
    });
  }

  const mock = options.mockProvider ?? new MockPlacesProvider();
  if (mode === "mock") {
    const mockAllowed =
      env.NODE_ENV !== "production" ||
      normalizeMode(env.QA_PROVIDER_MODE) === "mock";

    return mockAllowed
      ? mock
      : new UnavailablePlacesProvider({
          status: "unavailable",
          code: "INVALID_CONFIGURATION",
          message:
            "Mock place data is available only in development, tests, or an explicitly labelled QA environment.",
          retryable: false,
          attempts: 0,
        });
  }

  const google = new GooglePlacesProvider({
    ...options.google,
    apiKey: env.GOOGLE_PLACES_API_KEY,
  });
  if (mode === "google") {
    return google;
  }

  const fallbackAllowed =
    env.NODE_ENV !== "production" ||
    normalizeMode(env.QA_PROVIDER_MODE) === "mock";
  return new AutoPlacesProvider(google, mock, fallbackAllowed);
}

let sharedProvider: PlaceProvider | null = null;

export function getPlaceProvider(): PlaceProvider {
  sharedProvider ??= createPlaceProvider();
  return sharedProvider;
}

export function resetPlaceProviderForTests() {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("The shared place provider can only be reset in tests.");
  }
  sharedProvider = null;
}

export { GooglePlacesProvider, MockPlacesProvider };
export type { GooglePlacesProviderOptions };
