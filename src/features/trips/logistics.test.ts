import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    $transaction: vi.fn(),
  },
  auth: {
    requireUser: vi.fn(),
  },
  next: {
    redirect: vi.fn((destination: string) => {
      throw new Error(`redirect:${destination}`);
    }),
    revalidatePath: vi.fn(),
  },
  tx: {
    trip: {
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    tripTravelSegment: {
      create: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
  },
  itinerary: {
    rebuildItineraryDraftForTripTx: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({
  db: mocks.db,
}));

vi.mock("@/lib/authorization", () => ({
  requireUser: mocks.auth.requireUser,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.next.revalidatePath,
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.next.redirect,
}));

vi.mock("@/features/itinerary/builder", () => ({
  rebuildItineraryDraftForTripTx:
    mocks.itinerary.rebuildItineraryDraftForTripTx,
}));

import {
  addTripTravelSegmentFormAction,
  addTripTravelSegment,
  deleteTripTravelSegment,
  isValidTravelSegmentChain,
  saveTripLogisticsMode,
  updateTripTravelSegment,
} from "./logistics";

function travelSegment(
  id: string,
  originCity: string,
  destinationCity: string,
  departAt: string,
  arriveAt: string,
  sortOrder: number,
) {
  return {
    id,
    mode: "TRAIN",
    originCity,
    originCountry: "United States",
    destinationCity,
    destinationCountry: "United States",
    departAt: new Date(departAt),
    arriveAt: new Date(arriveAt),
    carrier: null,
    referenceCode: null,
    sortOrder,
  };
}

const planningTrip = {
  id: "trip_1",
  status: "PLANNING",
  startDate: new Date("2026-07-01T00:00:00.000Z"),
  endDate: new Date("2026-07-03T00:00:00.000Z"),
  destinations: [
    {
      id: "destination_1",
      city: "Los Angeles",
      country: "United States",
      sortOrder: 0,
    },
    {
      id: "destination_2",
      city: "New York",
      country: "United States",
      sortOrder: 1,
    },
  ],
  travelSegments: [],
};

describe("trip logistics service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.$transaction.mockImplementation((callback) => callback(mocks.tx));
    mocks.auth.requireUser.mockResolvedValue("user_1");
    mocks.tx.trip.findFirst.mockResolvedValue(planningTrip);
    mocks.tx.trip.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.trip.findUniqueOrThrow.mockResolvedValue({ planningRevision: 1 });
    mocks.tx.trip.update.mockResolvedValue({
      ...planningTrip,
      logisticsMode: "TICKETED",
    });
    mocks.tx.tripTravelSegment.create.mockResolvedValue({
      id: "segment_1",
      tripId: "trip_1",
      mode: "FLIGHT",
      originCity: "Los Angeles",
      originCountry: "United States",
      destinationCity: "New York",
      destinationCountry: "United States",
      departAt: new Date("2026-07-02T14:00:00.000Z"),
      arriveAt: new Date("2026-07-02T20:00:00.000Z"),
      carrier: "Delta",
      referenceCode: "DL123",
      sortOrder: 0,
    });
    mocks.tx.tripTravelSegment.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.tripTravelSegment.deleteMany.mockResolvedValue({ count: 1 });
  });

  it("saves logistics mode and rebuilds the itinerary for planning trips", async () => {
    const result = await saveTripLogisticsMode("user_1", "trip_1", {
      mode: "TICKETED",
    });

    expect(result.status).toBe("saved");
    expect(mocks.tx.trip.updateMany).toHaveBeenCalledOnce();
    expect(mocks.tx.trip.update).toHaveBeenCalledWith({
      where: {
        id: "trip_1",
      },
      data: {
        logisticsMode: "TICKETED",
      },
    });
    expect(mocks.itinerary.rebuildItineraryDraftForTripTx).toHaveBeenCalledWith(
      mocks.tx,
      "trip_1",
      expect.objectContaining({
        operationId: expect.any(String),
        tripId: "trip_1",
      }),
    );
  });

  it("adds a validated ticketed transfer segment and rebuilds the itinerary", async () => {
    const result = await addTripTravelSegment("user_1", "trip_1", {
      mode: "FLIGHT",
      originCity: "Los Angeles",
      originCountry: "United States",
      destinationCity: "New York",
      destinationCountry: "United States",
      departAt: "2026-07-02T14:00",
      arriveAt: "2026-07-02T20:00",
      carrier: "Delta",
      referenceCode: "DL123",
    });

    expect(result.status).toBe("saved");
    expect(mocks.tx.trip.updateMany).toHaveBeenCalledOnce();
    expect(mocks.tx.tripTravelSegment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tripId: "trip_1",
        mode: "FLIGHT",
        originCity: "Los Angeles",
        destinationCity: "New York",
        departAt: new Date("2026-07-02T14:00:00.000Z"),
        arriveAt: new Date("2026-07-02T20:00:00.000Z"),
      }),
      select: expect.any(Object),
    });
    expect(mocks.itinerary.rebuildItineraryDraftForTripTx).toHaveBeenCalledWith(
      mocks.tx,
      "trip_1",
      expect.objectContaining({
        operationId: expect.any(String),
        tripId: "trip_1",
      }),
    );
  });

  it("keeps users on logistics after saving a ticket so more segments can be added", async () => {
    const formData = new FormData();

    formData.set("tripId", "trip_1");
    formData.set("segmentMode", "FLIGHT");
    formData.set("originLocation", "Los Angeles|||United States");
    formData.set("destinationLocation", "New York|||United States");
    formData.set("departAt", "2026-07-02T14:00");
    formData.set("arriveAt", "2026-07-02T20:00");

    await expect(addTripTravelSegmentFormAction(formData)).rejects.toThrow(
      "redirect:/trips/trip_1/logistics?mode=ticketed&saved=1",
    );
  });

  it("updates one owned segment and finalizes once", async () => {
    mocks.tx.trip.findFirst.mockResolvedValueOnce({
      ...planningTrip,
      travelSegments: [
        travelSegment(
          "segment_1",
          "Los Angeles",
          "New York",
          "2026-07-02T14:00:00.000Z",
          "2026-07-02T20:00:00.000Z",
          0,
        ),
      ],
    });

    const result = await updateTripTravelSegment(
      "user_1",
      "trip_1",
      "segment_1",
      {
        mode: "TRAIN",
        originCity: "Los Angeles",
        originCountry: "United States",
        destinationCity: "New York",
        destinationCountry: "United States",
        departAt: "2026-07-02T14:00",
        arriveAt: "2026-07-02T20:00",
      },
    );

    expect(result.status).toBe("saved");
    expect(mocks.tx.tripTravelSegment.updateMany).toHaveBeenCalledOnce();
    expect(mocks.tx.trip.updateMany).toHaveBeenCalledOnce();
  });

  it("deletes one owned segment and finalizes once", async () => {
    mocks.tx.trip.findFirst.mockResolvedValueOnce({
      ...planningTrip,
      travelSegments: [
        travelSegment(
          "segment_1",
          "Los Angeles",
          "New York",
          "2026-07-02T14:00:00.000Z",
          "2026-07-02T20:00:00.000Z",
          0,
        ),
      ],
    });

    const result = await deleteTripTravelSegment(
      "user_1",
      "trip_1",
      "segment_1",
    );

    expect(result.status).toBe("saved");
    expect(mocks.tx.tripTravelSegment.deleteMany).toHaveBeenCalledOnce();
    expect(mocks.tx.trip.updateMany).toHaveBeenCalledOnce();
  });

  it("rejects travel segments outside the trip date range", async () => {
    const result = await addTripTravelSegment("user_1", "trip_1", {
      mode: "TRAIN",
      originCity: "Los Angeles",
      originCountry: "United States",
      destinationCity: "New York",
      destinationCountry: "United States",
      departAt: "2026-07-05T14:00",
      arriveAt: "2026-07-05T20:00",
    });

    expect(result.status).toBe("invalid");
    expect(mocks.tx.trip.updateMany).not.toHaveBeenCalled();
    expect(mocks.tx.tripTravelSegment.create).not.toHaveBeenCalled();
    expect(
      mocks.itinerary.rebuildItineraryDraftForTripTx,
    ).not.toHaveBeenCalled();
  });

  it("accepts equal segment boundaries when the locations connect", () => {
    expect(
      isValidTravelSegmentChain([
        travelSegment(
          "segment_1",
          "Los Angeles",
          "Chicago",
          "2026-07-01T08:00:00.000Z",
          "2026-07-01T10:00:00.000Z",
          0,
        ),
        travelSegment(
          "segment_2",
          " chicago ",
          "New York",
          "2026-07-01T10:00:00.000Z",
          "2026-07-01T12:00:00.000Z",
          1,
        ),
      ]),
    ).toBe(true);
  });

  it("rejects an add when the full proposed chain overlaps", async () => {
    mocks.tx.trip.findFirst.mockResolvedValueOnce({
      ...planningTrip,
      travelSegments: [
        travelSegment(
          "segment_1",
          "Los Angeles",
          "Chicago",
          "2026-07-02T08:00:00.000Z",
          "2026-07-02T12:00:00.000Z",
          0,
        ),
      ],
    });

    const result = await addTripTravelSegment("user_1", "trip_1", {
      mode: "TRAIN",
      originCity: "Chicago",
      originCountry: "United States",
      destinationCity: "New York",
      destinationCountry: "United States",
      departAt: "2026-07-02T11:00",
      arriveAt: "2026-07-02T14:00",
    });

    expect(result.status).toBe("invalid");
    expect(mocks.tx.tripTravelSegment.create).not.toHaveBeenCalled();
    expect(mocks.tx.trip.updateMany).not.toHaveBeenCalled();
  });

  it("rejects an update that breaks location continuity", async () => {
    mocks.tx.trip.findFirst.mockResolvedValueOnce({
      ...planningTrip,
      travelSegments: [
        travelSegment(
          "segment_1",
          "Los Angeles",
          "Chicago",
          "2026-07-02T08:00:00.000Z",
          "2026-07-02T10:00:00.000Z",
          0,
        ),
        travelSegment(
          "segment_2",
          "Chicago",
          "New York",
          "2026-07-02T12:00:00.000Z",
          "2026-07-02T14:00:00.000Z",
          1,
        ),
      ],
    });

    const result = await updateTripTravelSegment(
      "user_1",
      "trip_1",
      "segment_2",
      {
        mode: "TRAIN",
        originCity: "Boston",
        originCountry: "United States",
        destinationCity: "New York",
        destinationCountry: "United States",
        departAt: "2026-07-02T12:00",
        arriveAt: "2026-07-02T14:00",
      },
    );

    expect(result.status).toBe("invalid");
    expect(mocks.tx.tripTravelSegment.updateMany).not.toHaveBeenCalled();
    expect(mocks.tx.trip.updateMany).not.toHaveBeenCalled();
  });

  it("rejects deleting a segment when the remaining chain is discontinuous", async () => {
    mocks.tx.trip.findFirst.mockResolvedValueOnce({
      ...planningTrip,
      travelSegments: [
        travelSegment(
          "segment_1",
          "Los Angeles",
          "Chicago",
          "2026-07-01T08:00:00.000Z",
          "2026-07-01T10:00:00.000Z",
          0,
        ),
        travelSegment(
          "segment_2",
          "Chicago",
          "Boston",
          "2026-07-01T12:00:00.000Z",
          "2026-07-01T14:00:00.000Z",
          1,
        ),
        travelSegment(
          "segment_3",
          "Boston",
          "New York",
          "2026-07-01T16:00:00.000Z",
          "2026-07-01T18:00:00.000Z",
          2,
        ),
      ],
    });

    const result = await deleteTripTravelSegment(
      "user_1",
      "trip_1",
      "segment_2",
    );

    expect(result.status).toBe("invalid");
    expect(mocks.tx.tripTravelSegment.deleteMany).not.toHaveBeenCalled();
    expect(mocks.tx.trip.updateMany).not.toHaveBeenCalled();
  });
});
