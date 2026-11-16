import { describe, expect, it } from "vitest";

import { toGenerationJobDto } from "./queries";

describe("generation job DTO", () => {
  it("exposes bounded progress history without worker, lease, or payload data", () => {
    const dto = toGenerationJobDto({
      id: "job_1",
      type: "PROCESS_FEEDBACK_EVENT",
      status: "RUNNING",
      progress: 140,
      progressMessage: "Validating itinerary.",
      attemptCount: 2,
      maxAttempts: 3,
      availableAt: new Date("2026-07-26T12:00:00.000Z"),
      completedAt: null,
      errorCode: null,
      result: null,
      createdAt: new Date("2026-07-26T11:59:00.000Z"),
      updatedAt: new Date("2026-07-26T12:00:00.000Z"),
      events: [
        {
          id: "event_2",
          type: "VALIDATING_ITINERARY",
          progress: 80,
          message: "Validating itinerary.",
          createdAt: new Date("2026-07-26T12:00:00.000Z"),
        },
        {
          id: "event_1",
          type: "RECEIVED",
          progress: 0,
          message: "Feedback received.",
          createdAt: new Date("2026-07-26T11:59:00.000Z"),
        },
      ],
    });

    expect(dto.progress).toBe(100);
    expect(dto.events.map((event) => event.id)).toEqual(["event_1", "event_2"]);
    expect(dto).not.toHaveProperty("payload");
    expect(dto).not.toHaveProperty("workerId");
    expect(dto).not.toHaveProperty("leaseExpiresAt");
    expect(dto).not.toHaveProperty("errorMessage");
  });
});
