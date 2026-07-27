import { describe, expect, it } from "vitest";
import {
  adaptationFeedbackSchema,
  adaptivePreferenceSnapshotSchema,
  copyOnWriteItinerarySchema,
  replacementCandidateFilterSchema,
  replacementCandidateSchema,
  weightedPreferenceSignalSchema,
} from "./schemas";

const observedAt = "2026-07-26T18:30:00.000Z";

describe("adaptation schemas", () => {
  it("accepts a bounded, source-aware preference snapshot", () => {
    expect(
      adaptivePreferenceSnapshotSchema.parse({
        schemaVersion: 1,
        interests: {
          FOOD: {
            weight: 0.75,
            confidence: 0.6,
            source: "EXPLICIT",
            observedAt,
          },
        },
        priceSensitivity: {
          weight: 0.65,
          confidence: 0.5,
          source: "INFERRED",
          observedAt,
        },
        pace: {
          value: "BALANCED",
          confidence: 0.8,
          source: "DEFAULT",
          observedAt,
        },
      }),
    ).toMatchObject({
      schemaVersion: 1,
      interests: {
        FOOD: { source: "EXPLICIT" },
      },
    });
  });

  it.each([
    {
      value: {
        weight: 1.01,
        confidence: 0.5,
        source: "INFERRED",
        observedAt,
      },
      label: "weight above one",
    },
    {
      value: {
        weight: 0.5,
        confidence: -0.01,
        source: "INFERRED",
        observedAt,
      },
      label: "negative confidence",
    },
    {
      value: {
        weight: 0.5,
        confidence: 0.5,
        source: "UNKNOWN",
        observedAt,
      },
      label: "unknown source",
    },
    {
      value: {
        weight: 0.5,
        confidence: 0.5,
        source: "DEFAULT",
        observedAt: "yesterday",
      },
      label: "invalid timestamp",
    },
  ])("rejects a $label", ({ value }) => {
    expect(weightedPreferenceSignalSchema.safeParse(value).success).toBe(false);
  });

  it("rejects unknown preference-signal fields", () => {
    expect(
      weightedPreferenceSignalSchema.safeParse({
        weight: 0.5,
        confidence: 0.5,
        source: "DEFAULT",
        observedAt,
        rawProviderPayload: { secret: true },
      }).success,
    ).toBe(false);
  });

  it("bounds interest cardinality", () => {
    const interests = Object.fromEntries(
      Array.from({ length: 65 }, (_, index) => [
        `INTEREST_${index}`,
        {
          weight: 0.5,
          confidence: 0.5,
          source: "DEFAULT",
          observedAt,
        },
      ]),
    );

    expect(
      adaptivePreferenceSnapshotSchema.safeParse({
        schemaVersion: 1,
        interests,
        priceSensitivity: {
          weight: 0.5,
          confidence: 0.5,
          source: "DEFAULT",
          observedAt,
        },
        pace: null,
      }).success,
    ).toBe(false);
  });

  it("requires durable feedback identity and a valid reason", () => {
    expect(
      adaptationFeedbackSchema.parse({
        eventId: "feedback_123",
        action: "REJECT",
        reason: "TOO_EXPENSIVE",
        observedAt,
      }),
    ).toEqual({
      eventId: "feedback_123",
      action: "REJECT",
      reason: "TOO_EXPENSIVE",
      observedAt,
    });

    expect(
      adaptationFeedbackSchema.safeParse({
        eventId: "",
        action: "DISLIKE",
        reason: "COSTLY",
        observedAt,
      }).success,
    ).toBe(false);
  });

  it("validates normalized replacement candidates", () => {
    expect(
      replacementCandidateSchema.safeParse({
        id: "candidate_1",
        providerPlaceId: "google_1",
        destinationId: "destination_1",
        category: "ACTIVITY",
        name: "Museum",
        score: 91,
        rating: 4.7,
      }).success,
    ).toBe(true);

    expect(
      replacementCandidateSchema.safeParse({
        id: "candidate_1",
        providerPlaceId: "google_1",
        destinationId: "destination_1",
        category: "ACTIVITY",
        name: "Museum",
        score: 101,
        rating: 5.1,
      }).success,
    ).toBe(false);
  });

  it("defaults all replacement exclusion sets to empty arrays", () => {
    expect(
      replacementCandidateFilterSchema.parse({
        destinationId: "destination_1",
        category: "ACTIVITY",
      }),
    ).toEqual({
      destinationId: "destination_1",
      category: "ACTIVITY",
      selectedCandidateIds: [],
      selectedProviderPlaceIds: [],
      rejectedCandidateIds: [],
      rejectedProviderPlaceIds: [],
    });
  });

  it("accepts itinerary extensions without discarding domain fields", () => {
    const itinerary = {
      id: "version_2",
      summary: "Targeted update",
      days: [
        {
          id: "day_2",
          dayNumber: 2,
          date: "2026-08-02",
          items: [
            {
              id: "item_2",
              placeSuggestionId: "place_2",
              sortOrder: 3,
              title: "Museum",
            },
          ],
        },
      ],
    };

    expect(copyOnWriteItinerarySchema.parse(itinerary)).toEqual(itinerary);
  });
});
