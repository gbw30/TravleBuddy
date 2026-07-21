import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createPlanningOperationContext,
  measurePlanningOperation,
} from "./telemetry";

describe("planning telemetry", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("emits required structured fields without serializing the result", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const context = createPlanningOperationContext("trip_1", " operation_1 ");
    const result = await measurePlanningOperation(
      "planning_snapshot_query",
      context,
      async () => ({
        status: "ok",
        message: "private planning message",
        providerPayload: { secret: "provider secret" },
      }),
      () => ({
        status: "ok",
        selectedPlaceCount: 2,
        itineraryDayCount: 3,
      }),
    );

    expect(result.message).toBe("private planning message");
    const event = JSON.parse(String(info.mock.calls[0]?.[0]));
    expect(event).toEqual({
      event: "planning_operation",
      operation: "planning_snapshot_query",
      operationId: "operation_1",
      tripId: "trip_1",
      durationMs: expect.any(Number),
      status: "ok",
      selectedPlaceCount: 2,
      itineraryDayCount: 3,
      errorCode: null,
    });
    expect(info.mock.calls[0]?.[0]).not.toContain("private planning message");
    expect(info.mock.calls[0]?.[0]).not.toContain("provider secret");
  });

  it("uses one operation ID across nested measurements", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const context = createPlanningOperationContext("trip_1");

    expect(context.operationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );

    await measurePlanningOperation("recommendation_select", context, () =>
      measurePlanningOperation("itinerary_rebuild", context, async () => ({
        status: "rebuilt",
      })),
    );

    const events = info.mock.calls.map(([message]) =>
      JSON.parse(String(message)),
    );
    expect(events).toHaveLength(2);
    expect(events.map((event) => event.operation)).toEqual([
      "itinerary_rebuild",
      "recommendation_select",
    ]);
    expect(
      events.every((event) => event.operationId === context.operationId),
    ).toBe(true);
  });

  it("logs a stable error code and rethrows failures", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const context = createPlanningOperationContext("trip_1", "operation_2");
    const failure = Object.assign(new Error("database detail"), {
      code: "P2002",
    });

    await expect(
      measurePlanningOperation("conflict_refresh", context, async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);

    const event = JSON.parse(String(error.mock.calls[0]?.[0]));
    expect(event).toEqual({
      event: "planning_operation",
      operation: "conflict_refresh",
      operationId: "operation_2",
      tripId: "trip_1",
      durationMs: expect.any(Number),
      status: "error",
      selectedPlaceCount: null,
      itineraryDayCount: null,
      errorCode: "P2002",
    });
    expect(error.mock.calls[0]?.[0]).not.toContain("database detail");
  });
});
