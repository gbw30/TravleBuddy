import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  GooglePlacesHttpError,
  GooglePlacesProvider,
  type GooglePlacesHttpClient,
} from "./google";

const request = {
  query: "museum",
  destination: {
    city: "Bogota",
    country: "Colombia",
    location: { latitude: 4.711, longitude: -74.0721 },
  },
  category: "ATTRACTION" as const,
  maxResults: 5,
};

const validResponse = {
  places: [
    {
      id: "google-place-1",
      displayName: { text: "Museum One" },
      location: { latitude: 4.71, longitude: -74.07 },
      primaryType: "museum",
      types: ["museum", "tourist_attraction"],
    },
  ],
};

function httpFailure(status?: number, code?: string, data?: unknown) {
  return new GooglePlacesHttpError({ status, code, data });
}

describe("GooglePlacesProvider", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("initializes its HTTP client lazily and reuses it", async () => {
    const post = vi.fn(async () => ({ data: validResponse }));
    const clientFactory = vi.fn(
      () => ({ post }) satisfies GooglePlacesHttpClient,
    );
    const provider = new GooglePlacesProvider({
      apiKey: "test-key",
      clientFactory,
      retryDelayMs: 0,
    });

    expect(clientFactory).not.toHaveBeenCalled();
    await provider.search(request);
    await provider.search(request);

    expect(clientFactory).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledTimes(2);
  });

  it("uses an eight-second timeout, server key header, and bounded field mask", async () => {
    const post = vi.fn(async () => ({ data: validResponse }));
    const provider = new GooglePlacesProvider({
      apiKey: "test-key",
      clientFactory: () => ({ post }),
    });

    const result = await provider.search(request);

    expect(result).toMatchObject({
      status: "success",
      provider: "GOOGLE_PLACES",
      attempts: 1,
      provenance: { kind: "live", isFallback: false },
    });
    expect(post).toHaveBeenCalledWith(
      "",
      expect.objectContaining({
        textQuery: "museum in Bogota, Colombia",
        pageSize: 5,
        includedType: "tourist_attraction",
        strictTypeFiltering: true,
        locationBias: {
          circle: {
            center: { latitude: 4.711, longitude: -74.0721 },
            radius: 25_000,
          },
        },
      }),
      expect.objectContaining({
        timeout: 8_000,
        headers: expect.objectContaining({
          "X-Goog-Api-Key": "test-key",
          "X-Goog-FieldMask": expect.not.stringContaining("*"),
        }),
      }),
    );
  });

  it("retries one timeout exactly once and can recover", async () => {
    const post = vi
      .fn()
      .mockRejectedValueOnce(httpFailure(undefined, "ETIMEDOUT"))
      .mockResolvedValueOnce({ data: validResponse });
    const sleep = vi.fn(async () => undefined);
    const provider = new GooglePlacesProvider({
      apiKey: "test-key",
      clientFactory: () => ({ post }),
      retryDelayMs: 123,
      sleep,
    });

    const result = await provider.search(request);

    expect(result).toMatchObject({ status: "success", attempts: 2 });
    expect(post).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledOnce();
    expect(sleep).toHaveBeenCalledWith(123);
  });

  it("retries quota exhaustion once and returns an explicit quota outcome", async () => {
    const quotaError = httpFailure(429, undefined, {
      error: { status: "RESOURCE_EXHAUSTED" },
    });
    const post = vi.fn().mockRejectedValue(quotaError);
    const provider = new GooglePlacesProvider({
      apiKey: "test-key",
      clientFactory: () => ({ post }),
      retryDelayMs: 0,
      sleep: async () => undefined,
    });

    const result = await provider.search(request);

    expect(result).toEqual({
      status: "unavailable",
      provider: "GOOGLE_PLACES",
      code: "QUOTA_EXCEEDED",
      message: "Google Places quota is temporarily unavailable.",
      retryable: true,
      attempts: 2,
    });
    expect(post).toHaveBeenCalledTimes(2);
  });

  it("retries transient upstream failures once but not credential failures", async () => {
    const transientPost = vi
      .fn()
      .mockRejectedValueOnce(httpFailure(503))
      .mockResolvedValueOnce({ data: validResponse });
    const transientProvider = new GooglePlacesProvider({
      apiKey: "test-key",
      clientFactory: () => ({ post: transientPost }),
      retryDelayMs: 0,
      sleep: async () => undefined,
    });

    expect(await transientProvider.search(request)).toMatchObject({
      status: "success",
      attempts: 2,
    });
    expect(transientPost).toHaveBeenCalledTimes(2);

    const credentialPost = vi.fn().mockRejectedValue(httpFailure(403));
    const credentialProvider = new GooglePlacesProvider({
      apiKey: "test-key",
      clientFactory: () => ({ post: credentialPost }),
    });

    expect(await credentialProvider.search(request)).toMatchObject({
      status: "unavailable",
      code: "AUTHENTICATION_FAILED",
      retryable: false,
      attempts: 1,
    });
    expect(credentialPost).toHaveBeenCalledTimes(1);
  });

  it("does not initialize a client without a key or retry malformed payloads", async () => {
    const clientFactory = vi.fn();
    const missingKeyProvider = new GooglePlacesProvider({ clientFactory });

    expect(await missingKeyProvider.search(request)).toMatchObject({
      status: "unavailable",
      code: "MISSING_API_KEY",
      attempts: 0,
    });
    expect(clientFactory).not.toHaveBeenCalled();

    const post = vi.fn(async () => ({ data: { places: "invalid" } }));
    const malformedProvider = new GooglePlacesProvider({
      apiKey: "test-key",
      clientFactory: () => ({ post }),
    });

    expect(await malformedProvider.search(request)).toMatchObject({
      status: "unavailable",
      code: "INVALID_RESPONSE",
      attempts: 1,
    });
    expect(post).toHaveBeenCalledTimes(1);
  });
});
