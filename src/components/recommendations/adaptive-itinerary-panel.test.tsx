import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import {
  AdaptiveItineraryPanel,
  fetchPlanningJobDetail,
  isTerminalPlanningJob,
  planningJobPollDelay,
  type PlanningJobDetail,
} from "./adaptive-itinerary-panel";
import {
  isRemovedFeedbackResponse,
  setOptimisticRemoval,
} from "./adaptive-itinerary-model";
import { AdaptiveItineraryView } from "./adaptive-itinerary-view";

const day = {
  id: "day_1",
  dayNumber: 1,
  date: "2026-08-01",
  title: "Day 1",
  notes: null,
  itemCount: 1,
  estimatedCostAmount: 120,
  estimatedCostCurrency: "USD",
  costIsComplete: true,
  excludedCostCurrencies: [],
  cityWindows: [],
  timeSlots: [],
  items: [
    {
      id: "item_1",
      placeSuggestionId: "suggestion_1",
      title: "Premium Museum",
      description: null,
      category: "ATTRACTION" as const,
      city: "Bogota",
      country: "Colombia",
      sortOrder: 0,
      estimatedCostAmount: 120,
      estimatedCostCurrency: "USD",
    },
  ],
};

const completedJob = {
  id: "job_2",
  type: "PROCESS_FEEDBACK_EVENT",
  status: "SUCCEEDED",
  progress: 100,
  progressMessage: "Itinerary updated.",
  attemptCount: 1,
  maxAttempts: 3,
  availableAt: "2026-07-27T01:00:00.000Z",
  completedAt: "2026-07-27T01:02:00.000Z",
  errorCode: null,
  result: {
    outcome: "REPLACED",
    feedbackId: "feedback_1",
    preferenceVersion: {
      id: "preference_2",
      version: 2,
      delta: {
        field: "priceSensitivity",
        before: {
          weight: 0.4,
          confidence: 0.5,
          source: "INFERRED",
          observedAt: "2026-07-27T01:00:00.000Z",
        },
        after: {
          weight: 0.5,
          confidence: 0.6,
          source: "INFERRED",
          observedAt: "2026-07-27T01:00:00.000Z",
        },
      },
      explanation: "Price sensitivity increased after expensive feedback.",
    },
    affectedDay: 1,
    itineraryVersion: { id: "version_2", version: 2 },
    replacement: {
      itemId: "item_2",
      suggestionId: "suggestion_2",
      name: "City History Walk",
      score: 91,
      explanation: "A lower-cost attraction with a similar theme.",
    },
    provider: {
      state: "FETCHED",
      provider: "MOCK",
      provenance: {
        kind: "mock",
        label:
          "Mock planning data — Google Places unavailable (QUOTA_EXCEEDED)",
        isFallback: true,
      },
    },
    retryGuidance: null,
  },
  createdAt: "2026-07-27T01:00:00.000Z",
  updatedAt: "2026-07-27T01:02:00.000Z",
  events: [],
} satisfies PlanningJobDetail;

describe("AdaptiveItineraryPanel", () => {
  it("renders accessible item feedback, reload-recovered progress, and history", () => {
    const html = renderToStaticMarkup(
      <AdaptiveItineraryPanel
        tripId="trip_1"
        initialRevision={7}
        days={[day]}
        initialJobs={[
          {
            id: "job_1",
            type: "PROCESS_FEEDBACK_EVENT",
            status: "RUNNING",
            progress: 45,
            progressMessage: "Finding a less expensive replacement.",
            attemptCount: 1,
            errorCode: null,
            createdAt: "2026-07-27T01:00:00.000Z",
            updatedAt: "2026-07-27T01:00:02.000Z",
          },
          completedJob,
        ]}
        itineraryVersions={[
          {
            id: "version_2",
            version: 2,
            status: "ACTIVE",
            changeScope: "ITEM",
            createdAt: "2026-07-27T01:02:00.000Z",
            activatedAt: "2026-07-27T01:02:01.000Z",
          },
          {
            id: "version_1",
            version: 1,
            status: "SUPERSEDED",
            changeScope: "INITIAL",
            createdAt: "2026-07-26T01:00:00.000Z",
            activatedAt: "2026-07-26T01:00:01.000Z",
          },
        ]}
      />,
    );

    expect(html).toContain("Adaptive planning");
    expect(html).toContain("Revision 7");
    expect(html).toContain("Premium Museum");
    expect(html).toContain(
      'aria-label="Dislike Premium Museum and find a replacement"',
    );
    expect(html).toContain(
      'aria-label="Remove Premium Museum from the itinerary"',
    );
    expect(html).toContain("Finding a less expensive replacement.");
    expect(html).toContain("Price sensitivity 0.40");
    expect(html).toContain("0.50");
    expect(html).toContain("City History Walk");
    expect(html).toContain("Day 1");
    expect(html).toContain(
      "Mock planning data — Google Places unavailable (QUOTA_EXCEEDED)",
    );
    expect(html).toContain('role="progressbar"');
    expect(html).toContain("Itinerary version history");
    expect(html).toContain("Version 2");
    expect(html).toContain('aria-current="true"');
  });

  it("uses one-second polling before 15 seconds and three seconds afterward", () => {
    expect(planningJobPollDelay(0)).toBe(1_000);
    expect(planningJobPollDelay(14_999)).toBe(1_000);
    expect(planningJobPollDelay(15_000)).toBe(3_000);
    expect(planningJobPollDelay(60_000)).toBe(3_000);
    expect(isTerminalPlanningJob("RUNNING")).toBe(false);
    expect(isTerminalPlanningJob("SUCCEEDED")).toBe(true);
    expect(isTerminalPlanningJob("DEAD_LETTERED")).toBe(true);
    expect(isTerminalPlanningJob("SUPERSEDED")).toBe(true);
  });

  it("loads only valid public job responses and never makes a live request", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        job: {
          id: "job_1",
          type: "PROCESS_FEEDBACK_EVENT",
          status: "SUCCEEDED",
          progress: 100,
          progressMessage: "Completed.",
          attemptCount: 1,
          maxAttempts: 3,
          availableAt: "2026-07-27T01:00:00.000Z",
          completedAt: "2026-07-27T01:01:00.000Z",
          errorCode: null,
          result: { status: "NO_REPLACEMENT" },
          createdAt: "2026-07-27T01:00:00.000Z",
          updatedAt: "2026-07-27T01:01:00.000Z",
          events: [],
        },
      }),
    );

    await expect(
      fetchPlanningJobDetail(fetcher, "trip 1", "job/1"),
    ).resolves.toMatchObject({
      id: "job_1",
      status: "SUCCEEDED",
      progress: 100,
    });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/trips/trip%201/jobs/job%2F1",
      expect.objectContaining({
        method: "GET",
        cache: "no-store",
      }),
    );

    const malformedFetcher = vi.fn(async () =>
      Response.json({ job: { id: "job_1", status: "mystery" } }),
    );
    await expect(
      fetchPlanningJobDetail(malformedFetcher, "trip_1", "job_1"),
    ).resolves.toBeNull();
  });

  it("hides an optimistically removed item and announces completion", () => {
    const html = renderToStaticMarkup(
      <AdaptiveItineraryView
        revision={8}
        days={[day]}
        jobs={[]}
        pendingItemIds={new Set()}
        itemMessages={{}}
        hiddenItemIds={new Set(["item_1"])}
        panelMessage="Premium Museum was removed from day 1."
        pollError={false}
        itineraryVersions={[]}
        onSubmitFeedback={() => undefined}
      />,
    );

    expect(html).not.toContain("Remove Premium Museum");
    expect(html).toContain("No itinerary items are assigned to this day.");
    expect(html).toContain('role="status"');
    expect(html).toContain("Premium Museum was removed from day 1.");
  });

  it("accepts only the bounded immediate-removal response contract", () => {
    expect(
      isRemovedFeedbackResponse({
        status: "REMOVED",
        feedbackId: "feedback_1",
        revision: 8,
        affectedDay: 1,
        itineraryVersion: { id: "version_3", version: 3 },
        preferenceDelta: null,
        preferenceExplanation: "Feedback recorded.",
      }),
    ).toBe(true);
    expect(
      isRemovedFeedbackResponse({
        status: "REMOVED",
        feedbackId: "feedback_1",
      }),
    ).toBe(false);
  });

  it("restores an optimistically hidden item after a failed removal", () => {
    const hidden = setOptimisticRemoval(new Set<string>(), "item_1", true);
    const restored = setOptimisticRemoval(hidden, "item_1", false);

    expect(hidden.has("item_1")).toBe(true);
    expect(restored.has("item_1")).toBe(false);
  });
});
