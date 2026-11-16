import { normalizeGoogleTextSearchResponse } from "./normalization";
import {
  placeSearchRequestSchema,
  type PlaceCategory,
  type PlaceProvider,
  type PlaceProviderUnavailableCode,
  type PlaceSearchOutcome,
  type PlaceSearchUnavailable,
  type ValidatedPlaceSearchRequest,
} from "./types";

const GOOGLE_TEXT_SEARCH_URL =
  "https://places.googleapis.com/v1/places:searchText";
const GOOGLE_PLACES_TIMEOUT_MS = 8_000;
const DEFAULT_RETRY_DELAY_MS = 250;

const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.primaryType",
  "places.types",
  "places.businessStatus",
  "places.googleMapsUri",
  "places.rating",
  "places.userRatingCount",
  "places.priceLevel",
].join(",");

const includedTypeByCategory: Partial<Record<PlaceCategory, string>> = {
  HOTEL: "hotel",
  ATTRACTION: "tourist_attraction",
  RESTAURANT: "restaurant",
  LANDMARK: "historical_landmark",
  ENTERTAINMENT: "event_venue",
};

export interface GooglePlacesHttpClient {
  post(
    path: string,
    body: unknown,
    config: GooglePlacesRequestConfig,
  ): Promise<{ data: unknown }>;
}

export type GooglePlacesRequestConfig = {
  timeout: number;
  headers: Record<string, string>;
};

type GooglePlacesClientFactory = () => GooglePlacesHttpClient;

export type GooglePlacesProviderOptions = {
  apiKey?: string;
  clientFactory?: GooglePlacesClientFactory;
  retryDelayMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
};

type ClassifiedFailure = {
  code: PlaceProviderUnavailableCode;
  message: string;
  retryable: boolean;
};

export class GooglePlacesHttpError extends Error {
  readonly status: number | null;
  readonly data: unknown;
  readonly code: string | null;

  constructor(options: { status?: number; data?: unknown; code?: string }) {
    super("Google Places request failed.");
    this.name = "GooglePlacesHttpError";
    this.status = options.status ?? null;
    this.data = options.data;
    this.code = options.code ?? null;
  }
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json().catch(() => null);
  }

  const text = await response.text();
  return text.slice(0, 1_024);
}

function defaultClientFactory(): GooglePlacesHttpClient {
  return {
    async post(path, body, config) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.timeout);

      try {
        const response = await fetch(`${GOOGLE_TEXT_SEARCH_URL}${path}`, {
          method: "POST",
          headers: config.headers,
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        const data = await parseResponseBody(response);
        if (!response.ok) {
          throw new GooglePlacesHttpError({
            status: response.status,
            data,
          });
        }

        return { data };
      } catch (error) {
        if (error instanceof GooglePlacesHttpError) {
          throw error;
        }

        if (controller.signal.aborted) {
          throw new GooglePlacesHttpError({ code: "ETIMEDOUT" });
        }

        throw new GooglePlacesHttpError({ code: "NETWORK_ERROR" });
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

function defaultSleep(milliseconds: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function readGoogleErrorStatus(data: unknown) {
  if (!data || typeof data !== "object") {
    return null;
  }

  const error = Reflect.get(data, "error");
  if (!error || typeof error !== "object") {
    return null;
  }

  const status = Reflect.get(error, "status");
  return typeof status === "string" ? status : null;
}

function classifyFailure(error: unknown): ClassifiedFailure {
  if (!(error instanceof GooglePlacesHttpError)) {
    return {
      code: "UPSTREAM_ERROR",
      message: "Google Places failed unexpectedly.",
      retryable: false,
    };
  }

  const status = error.status;
  const googleStatus = readGoogleErrorStatus(error.data);
  if (
    status === 429 ||
    googleStatus === "RESOURCE_EXHAUSTED" ||
    googleStatus === "RATE_LIMIT_EXCEEDED"
  ) {
    return {
      code: "QUOTA_EXCEEDED",
      message: "Google Places quota is temporarily unavailable.",
      retryable: true,
    };
  }

  if (error.code === "ETIMEDOUT" || status === 408) {
    return {
      code: "TIMEOUT",
      message: "Google Places did not respond within 8 seconds.",
      retryable: true,
    };
  }

  if (status === 401 || status === 403) {
    return {
      code: "AUTHENTICATION_FAILED",
      message: "Google Places rejected the server credential.",
      retryable: false,
    };
  }

  if (
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    error.code === "NETWORK_ERROR"
  ) {
    return {
      code: "TRANSIENT_UPSTREAM",
      message: "Google Places is temporarily unavailable.",
      retryable: true,
    };
  }

  return {
    code: "UPSTREAM_ERROR",
    message: "Google Places rejected the search request.",
    retryable: false,
  };
}

function buildRequestBody(request: ValidatedPlaceSearchRequest) {
  const includedType = request.category
    ? includedTypeByCategory[request.category]
    : undefined;

  return {
    textQuery: `${request.query} in ${request.destination.city}, ${request.destination.country}`,
    pageSize: request.maxResults,
    ...(request.languageCode ? { languageCode: request.languageCode } : {}),
    ...(request.regionCode ? { regionCode: request.regionCode } : {}),
    ...(includedType ? { includedType, strictTypeFiltering: true } : {}),
    ...(request.destination.location
      ? {
          locationBias: {
            circle: {
              center: request.destination.location,
              radius: 25_000,
            },
          },
        }
      : {}),
  };
}

function unavailable(
  code: PlaceProviderUnavailableCode,
  message: string,
  retryable: boolean,
  attempts: number,
): PlaceSearchUnavailable {
  return {
    status: "unavailable",
    provider: "GOOGLE_PLACES",
    code,
    message,
    retryable,
    attempts,
  };
}

export class GooglePlacesProvider implements PlaceProvider {
  readonly id = "GOOGLE_PLACES" as const;

  private readonly apiKey: string | null;
  private readonly clientFactory: GooglePlacesClientFactory;
  private readonly retryDelayMs: number;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private client: GooglePlacesHttpClient | null = null;

  constructor(options: GooglePlacesProviderOptions = {}) {
    this.apiKey = options.apiKey?.trim() || null;
    this.clientFactory = options.clientFactory ?? defaultClientFactory;
    this.retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
    this.sleep = options.sleep ?? defaultSleep;
  }

  private getClient() {
    this.client ??= this.clientFactory();
    return this.client;
  }

  async search(
    request: Parameters<PlaceProvider["search"]>[0],
  ): Promise<PlaceSearchOutcome> {
    const parsed = placeSearchRequestSchema.safeParse(request);
    if (!parsed.success) {
      return unavailable(
        "INVALID_REQUEST",
        "The place search request is invalid.",
        false,
        0,
      );
    }

    if (!this.apiKey) {
      return unavailable(
        "MISSING_API_KEY",
        "Google Places is not configured.",
        false,
        0,
      );
    }

    const body = buildRequestBody(parsed.data);
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const response = await this.getClient().post("", body, {
          timeout: GOOGLE_PLACES_TIMEOUT_MS,
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": this.apiKey,
            "X-Goog-FieldMask": FIELD_MASK,
          },
        });
        const normalized = normalizeGoogleTextSearchResponse(
          response.data,
          parsed.data,
        );
        if (
          normalized.status === "invalid" ||
          (normalized.places.length === 0 && normalized.droppedResults > 0)
        ) {
          return unavailable(
            "INVALID_RESPONSE",
            "Google Places returned an invalid response.",
            false,
            attempt,
          );
        }

        return {
          status: "success",
          provider: this.id,
          places: normalized.places,
          attempts: attempt,
          droppedResults: normalized.droppedResults,
          provenance: {
            kind: "live",
            label: "Google Places",
            isFallback: false,
          },
          fallback: null,
        };
      } catch (error) {
        const failure = classifyFailure(error);
        if (failure.retryable && attempt === 1) {
          await this.sleep(this.retryDelayMs);
          continue;
        }

        return unavailable(
          failure.code,
          failure.message,
          failure.retryable,
          attempt,
        );
      }
    }

    return unavailable(
      "TRANSIENT_UPSTREAM",
      "Google Places is temporarily unavailable.",
      true,
      2,
    );
  }
}
