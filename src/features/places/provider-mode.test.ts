import { describe, expect, it } from "vitest";

import { usesSamplePlaces } from "./provider-mode";

describe("which place source is used", () => {
  it("is the sample places only when the mode says mock", () => {
    expect(usesSamplePlaces({ PLACE_PROVIDER_MODE: "mock" })).toBe(true);
    expect(usesSamplePlaces({ PLACE_PROVIDER_MODE: " MOCK " })).toBe(true);
    for (const mode of ["auto", "google", "invalid", ""]) {
      expect(usesSamplePlaces({ PLACE_PROVIDER_MODE: mode }), mode).toBe(false);
    }
    expect(usesSamplePlaces({})).toBe(false);
  });

  it("falls back to the QA setting when the mode is not set", () => {
    expect(usesSamplePlaces({ QA_PROVIDER_MODE: "mock" })).toBe(true);
    expect(
      usesSamplePlaces({
        PLACE_PROVIDER_MODE: "auto",
        QA_PROVIDER_MODE: "mock",
      }),
    ).toBe(false);
  });
});
