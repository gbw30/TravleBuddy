import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CommitmentInput } from "@/features/trips/contracts";

const mocks = vi.hoisted(() => ({
  getTrip: vi.fn(),
  updateCommitment: vi.fn(),
  findCities: vi.fn(),
}));
vi.mock("@/features/trips", async (actual) => ({
  ...(await actual<typeof import("@/features/trips")>()),
  getTrip: mocks.getTrip,
  updateCommitment: mocks.updateCommitment,
}));
vi.mock("@/features/places", () => ({ findCities: mocks.findCities }));
vi.mock("./trip-action", () => ({
  runTripAction: async (input: { apply: (tx: unknown) => unknown }) => ({
    status: "ok",
    data: await input.apply("tx"),
    revision: 2,
  }),
}));

import { updateTripCommitment } from "./update-commitment";

const rome = {
  name: "Rome",
  region: null,
  country: "Italy",
  latitude: 41.89,
  longitude: 12.48,
  timeZone: "Europe/Rome",
};
const flight = {
  id: "f1",
  kind: "TRANSPORT",
  title: "Flight · London (LHR) → Rome",
  date: "2027-06-18",
  startTime: "10:00",
  endDate: "2027-06-18",
  endTime: "13:30",
  reference: null,
  note: null,
  located: null,
  transport: {
    mode: "FLIGHT",
    origin: "London (LHR)",
    destination: "Rome",
    // The lookup failed when the trip was started.
    originZone: null,
    destinationZone: "Europe/Rome",
  },
};
const input = (kind: CommitmentInput["kind"]): CommitmentInput => ({
  kind,
  title: "Flight · London (LHR) → Rome",
  date: "2027-06-18",
  startTime: "10:00",
  endDate: "2027-06-18",
  endTime: "13:30",
  reference: "AB123",
  note: null,
  located: null,
  transportMode: kind === "TRANSPORT" ? "FLIGHT" : null,
});
const control = { operationId: "op-1", expectedRevision: 1 };

describe("saving a ticket again", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getTrip.mockResolvedValue({
      facts: { cities: [{ city: rome, nights: 4 }] },
      commitments: [flight],
    });
    mocks.findCities.mockResolvedValue({
      status: "ok",
      cities: [
        {
          ...rome,
          name: "London",
          country: "United Kingdom",
          timeZone: "Europe/London",
        },
      ],
    });
    mocks.updateCommitment.mockResolvedValue({ commitments: [], clashes: [] });
  });

  it("looks up an end whose zone is still unknown, and saves the zone it finds", async () => {
    await updateTripCommitment("u1", "t1", "f1", input("TRANSPORT"), control);
    expect(mocks.findCities.mock.calls).toEqual([["London"]]);
    expect(mocks.updateCommitment).toHaveBeenCalledWith(
      "tx",
      "u1",
      "t1",
      "f1",
      input("TRANSPORT"),
      { originTimeZone: "Europe/London" },
    );
  });

  it("refuses a ticket that lands before it leaves by the clocks of both places, and saves one that lands after", async () => {
    mocks.getTrip.mockResolvedValue({
      facts: { cities: [{ city: rome, nights: 4 }] },
      commitments: [
        {
          ...flight,
          transport: { ...flight.transport, originZone: "Asia/Tokyo" },
        },
      ],
    });
    mocks.findCities.mockResolvedValue({ status: "ok", cities: [] });
    const lands = (endDate: string, endTime: string) => ({
      ...input("TRANSPORT"),
      date: "2027-06-18",
      startTime: "10:00",
      endDate,
      endTime,
    });
    // Tokyo 10:00 is 03:00 in Rome: Rome 02:00 the same date is before it left.
    const early = await updateTripCommitment(
      "u1",
      "t1",
      "f1",
      lands("2027-06-18", "02:00"),
      control,
    );
    expect(early).toMatchObject({ status: "refused" });
    expect(mocks.updateCommitment).not.toHaveBeenCalled();
    // The same clock a day earlier would be before it too; 04:00 is an hour after.
    const late = await updateTripCommitment(
      "u1",
      "t1",
      "f1",
      lands("2027-06-18", "04:00"),
      control,
    );
    expect(late).toMatchObject({ status: "ok" });
  });

  it("looks nothing up for anything but a ticket", async () => {
    await updateTripCommitment("u1", "t1", "f1", input("RESERVATION"), control);
    expect(mocks.findCities).not.toHaveBeenCalled();
    expect(mocks.updateCommitment.mock.calls[0][5]).toEqual({});
  });
});
