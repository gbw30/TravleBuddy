import { beforeEach, describe, expect, it, vi } from "vitest";

import type { City } from "@/features/places/contracts";
import type { TicketInput } from "@/features/trips/contracts";

const mocks = vi.hoisted(() => ({ findCities: vi.fn(), createTrip: vi.fn() }));
vi.mock("@/features/places", () => ({ findCities: mocks.findCities }));
vi.mock("@/features/trips", async (actual) => ({
  ...(await actual<typeof import("@/features/trips")>()),
  createTrip: mocks.createTrip,
}));

import { startTrip } from "./start-trip";

const city = (name: string, timeZone: string | null): City => ({
  name,
  region: null,
  country: name,
  latitude: 0,
  longitude: 0,
  timeZone,
});
const ticket = (from: string, to: string, day: string): TicketInput => ({
  mode: "FLIGHT",
  from,
  to,
  departDate: day,
  departTime: "10:00",
  arriveDate: day,
  arriveTime: "13:00",
  reference: null,
});

describe("starting a trip from tickets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createTrip.mockResolvedValue({ id: "t1" });
    mocks.findCities.mockImplementation(async (text: string) => ({
      status: "ok",
      cities: [city(text, text === "Rome" ? "Europe/Rome" : "Europe/London")],
    }));
  });

  it("takes an end's zone from the trip city, else from one lookup", async () => {
    await startTrip("u1", {
      planningMode: "GUIDED",
      tickets: [
        ticket("London (LHR)", "Rome", "2027-06-18"),
        ticket("Rome", "London", "2027-06-22"),
      ],
    });
    const saved = mocks.createTrip.mock.calls[0][1];
    expect(
      saved.tickets.map(
        (t: TicketInput & { fromZone: string; toZone: string }) => [
          t.fromZone,
          t.toZone,
        ],
      ),
    ).toEqual([
      ["Europe/London", "Europe/Rome"],
      ["Europe/Rome", "Europe/London"],
    ]);
    // Rome is a trip city, so only London is looked up besides the trip's own stops.
    const asked = mocks.findCities.mock.calls.map(([text]) => text);
    expect(asked.filter((text) => text === "London")).toHaveLength(1);
    expect(asked.filter((text) => text === "Rome")).toHaveLength(1);
  });

  it("uses a looked-up zone only when it is the only result, or the only one in a country the trip visits", async () => {
    const found: Record<string, City[]> = {
      Lyon: [{ ...city("Lyon", "Europe/Paris"), country: "France" }],
      Paris: [
        { ...city("Paris", "Europe/Paris"), country: "France" },
        { ...city("Paris", "America/Chicago"), country: "United States" },
      ],
      Springfield: [
        { ...city("Springfield", "America/Chicago"), country: "United States" },
        {
          ...city("Springfield", "America/New_York"),
          country: "United States",
        },
      ],
    };
    mocks.findCities.mockImplementation(async (text: string) => ({
      status: "ok",
      cities: found[text] ?? [],
    }));
    const zones = async (home: string) => {
      mocks.createTrip.mockClear();
      await startTrip("u1", {
        planningMode: "GUIDED",
        tickets: [
          ticket(home, "Lyon", "2027-06-18"),
          ticket("Lyon", home, "2027-06-22"),
        ],
      });
      return mocks.createTrip.mock.calls[0][1].tickets[0].fromZone;
    };
    expect(await zones("Paris")).toBe("Europe/Paris");
    expect(await zones("Springfield")).toBeNull();
  });

  it("refuses a ticket that lands before it leaves by both clocks, and saves nothing", async () => {
    mocks.findCities.mockImplementation(async (text: string) => ({
      status: "ok",
      cities: [
        city(text, text === "Tokyo" ? "Asia/Tokyo" : "Pacific/Honolulu"),
      ],
    }));
    const flight = (arriveTime: string): TicketInput => ({
      ...ticket("Tokyo", "Honolulu", "2027-06-18"),
      departTime: "18:00",
      arriveTime,
    });
    // Tokyo 18:00 lands Honolulu 06:30 the same date: 7 hours 30 later. Fine.
    const ok = await startTrip("u1", {
      planningMode: "GUIDED",
      tickets: [flight("06:30")],
    });
    expect(ok).toEqual({ id: "t1" });
    // Honolulu 22:00 the same date is before it left (Tokyo 18:00 is 23:00 the day before).
    mocks.createTrip.mockClear();
    const bad = await startTrip("u1", {
      planningMode: "GUIDED",
      tickets: [{ ...flight("22:00"), arriveDate: "2027-06-17" }],
    });
    expect(bad).toMatchObject({ refused: expect.any(String) });
    expect(mocks.createTrip).not.toHaveBeenCalled();
  });

  it("leaves a zone empty when the lookup finds nothing", async () => {
    mocks.findCities.mockResolvedValue({ status: "ok", cities: [] });
    await startTrip("u1", {
      planningMode: "GUIDED",
      tickets: [ticket("Nowhere", "Elsewhere", "2027-06-18")],
    });
    expect(mocks.createTrip.mock.calls[0][1].tickets[0]).toMatchObject({
      fromZone: null,
      toZone: null,
    });
  });
});
