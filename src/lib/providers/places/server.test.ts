import { describe, expect, it, vi } from "vitest";

import { GooglePlacesHttpError } from "./google";
import { createPlaceProvider, resolvePlaceProviderMode } from "./server";

const request = {
  query: "activities",
  destination: {
    city: "Bogota",
    country: "Colombia",
  },
  maxResults: 2,
};

describe("place provider configuration", () => {
  it("uses deterministic, visibly labelled mock data in explicit mock mode", async () => {
    const provider = createPlaceProvider({
      env: {
        NODE_ENV: "test",
        PLACE_PROVIDER_MODE: "mock",
      },
    });

    const first = await provider.search(request);
    const second = await provider.search(request);

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      status: "success",
      provider: "MOCK",
      provenance: {
        kind: "mock",
        label: "Mock planning data",
        isFallback: false,
      },
      fallback: null,
    });
  });

  it("labels automatic development fallback and preserves the failure reason", async () => {
    const provider = createPlaceProvider({
      env: {
        NODE_ENV: "development",
        PLACE_PROVIDER_MODE: "auto",
      },
    });

    const result = await provider.search(request);

    expect(result).toMatchObject({
      status: "success",
      provider: "MOCK",
      provenance: {
        kind: "mock",
        label:
          "Mock planning data — Google Places unavailable (MISSING_API_KEY)",
        isFallback: true,
      },
      fallback: {
        from: "GOOGLE_PLACES",
        code: "MISSING_API_KEY",
        message: "Google Places is not configured.",
      },
    });
  });

  it("reports unavailable in production auto mode instead of silently using mock data", async () => {
    const provider = createPlaceProvider({
      env: {
        NODE_ENV: "production",
        PLACE_PROVIDER_MODE: "auto",
      },
    });

    expect(await provider.search(request)).toEqual({
      status: "unavailable",
      provider: "GOOGLE_PLACES",
      code: "MISSING_API_KEY",
      message: "Google Places is not configured.",
      retryable: false,
      attempts: 0,
    });
  });

  it("rejects explicit mock mode in production unless the environment is labelled for QA", async () => {
    const productionProvider = createPlaceProvider({
      env: {
        NODE_ENV: "production",
        PLACE_PROVIDER_MODE: "mock",
      },
    });
    const qaProvider = createPlaceProvider({
      env: {
        NODE_ENV: "production",
        PLACE_PROVIDER_MODE: "mock",
        QA_PROVIDER_MODE: "mock",
      },
    });

    expect(await productionProvider.search(request)).toMatchObject({
      status: "unavailable",
      code: "INVALID_CONFIGURATION",
      retryable: false,
    });
    expect(await qaProvider.search(request)).toMatchObject({
      status: "success",
      provider: "MOCK",
      provenance: {
        kind: "mock",
        label: "Mock planning data",
      },
    });
  });

  it("falls back after a configured Google failure only outside production", async () => {
    const post = vi
      .fn()
      .mockRejectedValue(new GooglePlacesHttpError({ status: 503 }));
    const provider = createPlaceProvider({
      env: {
        NODE_ENV: "test",
        PLACE_PROVIDER_MODE: "auto",
        GOOGLE_PLACES_API_KEY: "test-key",
      },
      google: {
        clientFactory: () => ({ post }),
        retryDelayMs: 0,
        sleep: async () => undefined,
      },
    });

    const result = await provider.search(request);

    expect(post).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      status: "success",
      provider: "MOCK",
      attempts: 2,
      provenance: { isFallback: true },
      fallback: { code: "TRANSIENT_UPSTREAM" },
    });
  });

  it("returns a safe configuration outcome for unsupported modes", async () => {
    const provider = createPlaceProvider({
      env: {
        NODE_ENV: "test",
        PLACE_PROVIDER_MODE: "surprise",
      },
    });

    expect(resolvePlaceProviderMode({ PLACE_PROVIDER_MODE: " GOOGLE " })).toBe(
      "google",
    );
    expect(resolvePlaceProviderMode({ PLACE_PROVIDER_MODE: "invalid" })).toBe(
      null,
    );
    expect(await provider.search(request)).toMatchObject({
      status: "unavailable",
      code: "INVALID_CONFIGURATION",
      retryable: false,
      attempts: 0,
    });
  });
});
