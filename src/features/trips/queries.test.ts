import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    trip: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db", () => ({
  db: mocks.db,
}));

import { getTripByIdForUser, getTripsForUser } from "./queries";

describe("trip queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.trip.findMany.mockResolvedValue([]);
    mocks.db.trip.findFirst.mockResolvedValue(null);
  });

  it("lists only trips owned by the authenticated user", async () => {
    await getTripsForUser("user_1");

    expect(mocks.db.trip.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: "user_1",
        },
      }),
    );
  });

  it("looks up a trip by both trip id and user id", async () => {
    await getTripByIdForUser("user_1", "trip_1");

    expect(mocks.db.trip.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "trip_1",
          userId: "user_1",
        },
      }),
    );
  });

  it("returns null when a trip is not owned by the user", async () => {
    await expect(getTripByIdForUser("user_1", "trip_2")).resolves.toBeNull();
  });
});
