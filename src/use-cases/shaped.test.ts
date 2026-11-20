import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  PlanEntry,
  PlanState,
  PlanView,
} from "@/features/itinerary/contracts";
import type { ProfileEntry } from "@/features/memory/contracts";
import type { PlaceDto } from "@/features/places/contracts";

const mocks = vi.hoisted(() => ({
  listTrips: vi.fn(),
  getTrip: vi.fn(),
  readPlanState: vi.fn(),
  readProfile: vi.fn(),
  readTripTaste: vi.fn(),
  contextFor: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: { name: "db" } }));
vi.mock("@/features/trips", () => ({
  listTrips: mocks.listTrips,
  getTrip: mocks.getTrip,
}));
vi.mock("@/features/itinerary", async (actual) => ({
  ...(await actual<typeof import("@/features/itinerary")>()),
  readPlanState: mocks.readPlanState,
}));
vi.mock("@/features/memory", async (actual) => ({
  ...(await actual<typeof import("@/features/memory")>()),
  readProfile: mocks.readProfile,
  readTripTaste: mocks.readTripTaste,
}));
vi.mock("./plan", () => ({
  contextFor: mocks.contextFor,
  startingState: (saved: { state: PlanState }) => saved.state,
}));

import { tasteInUse } from "@/features/memory";

import { loadShaped, shapedBy } from "./shaped";

const place = (
  id: string,
  kind: PlaceDto["kind"],
  over: Partial<PlaceDto> = {},
): PlaceDto => ({
  id,
  origin: "SAMPLE",
  name: id,
  kind,
  cityKey: "lisbon|portugal",
  latitude: 38.7,
  longitude: -9.1,
  address: null,
  openingHours: null,
  notable: false,
  serves: [],
  servesNot: [],
  originRef: null,
  tags: {},
  lastEditedAt: null,
  fetchedAt: null,
  hoursDoubt: null,
  ...over,
});
const places = Object.fromEntries(
  [
    place("Tile Museum", "museum"),
    place("Gulbenkian", "museum"),
    place("Castle", "sight"),
    place("Riverside Park", "park"),
    place("Corner Noodles", "restaurant", { serves: ["vegetarian"] }),
    place("Garden Table", "restaurant"),
    place("Lantern Grill", "restaurant", { servesNot: ["vegetarian"] }),
  ].map((item) => [item.id, item]),
);
const at = (
  slotId: string,
  start: string,
  placeId: string | null,
): PlanEntry => {
  const kind = slotId.split("-").slice(1).join("-");
  const base = { slotId, kind, cityKey: "lisbon|portugal", start };
  return (
    placeId
      ? {
          ...base,
          type: "place",
          placeId,
          minutes: 60,
          minutesEstimated: true,
          travelIn: null,
          flags: [],
        }
      : { ...base, type: "open" }
  ) as PlanEntry;
};
const view = (
  days: PlanEntry[][],
  pace: PlanView["pace"] = "relaxed",
): PlanView => ({
  days: days.map((entries, index) => ({
    day: index + 1,
    date: `2027-04-${12 + index}`,
    city: "Lisbon",
    entries,
    stayNote: null,
    returnNote: null,
  })),
  blockers: [],
  pace,
  provisionalDates: false,
  shelf: [],
  unplaced: [],
});
const told = (topic: ProfileEntry["topic"], value: string): ProfileEntry => ({
  topic,
  value,
  sureness: "always",
  source: { type: "told" },
});
const early = view([
  [
    at("d1-morning", "09:00", "Tile Museum"),
    at("d1-lunch", "11:30", "Corner Noodles"),
    at("d1-afternoon", "13:30", "Castle"),
    at("d1-dinner", "18:00", "Garden Table"),
  ],
  [
    at("d2-morning", "09:00", "Gulbenkian"),
    at("d2-lunch", "11:30", null),
    at("d2-afternoon", "13:30", "Riverside Park"),
    at("d2-dinner", "18:00", "Corner Noodles"),
  ],
]);
const shaped = (personal: ProfileEntry[], trip = {}, plan = early) =>
  shapedBy({
    taste: tasteInUse(personal, trip),
    dietaryRules: personal
      .filter((entry) => entry.topic === "dietary_rules")
      .map((entry) => entry.value),
    view: plan,
    places,
  });

describe("what the profile did to a trip", () => {
  it("is nothing when the profile is empty", () => {
    expect(shaped([])).toEqual([]);
  });

  it("pairs a remembered pace with how full the plan's days are", () => {
    expect(shaped([told("pace", "relaxed")])).toEqual([
      {
        memory: "A relaxed pace",
        effect: "No day has more than 2 sights or activities.",
      },
    ]);
  });

  it("leaves the pace out when the trip said otherwise, or the plan was set to another pace", () => {
    expect(
      shaped([told("pace", "relaxed")], {
        pace: { values: ["packed"], source: "told" },
      }),
    ).toEqual([]);
    expect(
      shaped([told("pace", "relaxed")], {}, { ...early, pace: "balanced" }),
    ).toEqual([]);
  });

  it("pairs early starts with when the plan's days begin and when dinner is", () => {
    expect(shaped([told("day_shape", "early")])).toEqual([
      {
        memory: "Early starts",
        effect: "Its days begin at 09:00, with dinner at 18:00.",
      },
    ]);
    // Times that differ from day to day are given as a span, not rounded to one.
    const uneven = view([
      [
        at("d1-morning", "09:00", "Castle"),
        at("d1-dinner", "18:06", "Garden Table"),
      ],
      [at("d2-morning", "10:30", "Gulbenkian"), at("d2-dinner", "18:00", null)],
    ]);
    expect(shaped([told("day_shape", "early")], {}, uneven)[0].effect).toBe(
      "Its days begin between 09:00 and 10:30, with dinner between 18:00 and 18:06.",
    );
    // "Neither" is no habit to show.
    expect(shaped([told("day_shape", "neither")])).toEqual([]);
  });

  it("counts the meals at places that confirm a dietary rule, and says when one goes against it", () => {
    expect(shaped([told("dietary_rules", "vegetarian")])).toEqual([
      {
        memory: "Vegetarian food",
        effect:
          "2 of 3 meals are at a place that says it serves it; none is at a place that says it does not.",
      },
    ]);
    // The traveller put a grill in themselves.
    const withGrill = view([[at("d1-dinner", "19:00", "Lantern Grill")]]);
    expect(
      shaped([told("dietary_rules", "vegetarian")], {}, withGrill)[0].effect,
    ).toBe(
      "No meal is at a place that says it serves it; 1 is at a place that says it does not.",
    );
  });

  it("names the places that answer a remembered interest, and says nothing of one that shows nowhere", () => {
    expect(
      shaped([told("interests", "museums"), told("interests", "markets")]),
    ).toEqual([
      {
        memory: "Museums and exhibitions",
        effect:
          "2 of its 4 sights and activities are of that kind: Tile Museum and Gulbenkian.",
      },
    ]);
  });

  it("does not count a breakfast place as a sight or activity", () => {
    const withBreakfast = view(
      early.days.map((day, index) =>
        index === 0
          ? [at("d1-breakfast", "08:30", "Garden Table"), ...day.entries]
          : day.entries,
      ),
    );
    expect(shaped([told("interests", "museums")], {}, withBreakfast)).toEqual(
      shaped([told("interests", "museums")]),
    );
  });

  it("claims nothing for a trip with no places yet", () => {
    const empty = view([
      [at("d1-morning", "10:00", null), at("d1-lunch", "12:30", null)],
    ]);
    expect(
      shaped(
        [told("dietary_rules", "vegetarian"), told("interests", "museums")],
        {},
        empty,
      ),
    ).toEqual([]);
  });
});

describe("the trip the profile page shows", () => {
  const plan = (
    picks: Record<string, string>,
  ): { state: PlanState; canUndo: boolean } => ({
    state: {
      pace: "relaxed",
      provisionalStart: null,
      picks: Object.fromEntries(
        Object.entries(picks).map(([slot, placeId]) => [
          slot,
          { placeId, minutes: null },
        ]),
      ),
      shelf: [],
      transferTimes: {},
    },
    canUndo: false,
  });
  const trip = (id: string, title: string) => ({
    id,
    title,
    facts: {
      cities: [
        {
          city: {
            name: "Lisbon",
            region: null,
            country: "Portugal",
            latitude: 38.7,
            longitude: -9.1,
            timeZone: "Europe/Lisbon",
          },
          nights: 2,
        },
      ],
      startDate: "2027-04-12",
      endDate: "2027-04-14",
      lengthNights: null,
      timeOfYear: null,
    },
    commitments: [],
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readProfile.mockResolvedValue({ entries: [told("pace", "relaxed")] });
    mocks.readTripTaste.mockResolvedValue({});
    mocks.contextFor.mockImplementation(async (found) => ({
      facts: found.facts,
      commitments: [],
      places,
    }));
  });

  it("is the newest trip with a plan, named by its city while its title is the default", async () => {
    mocks.listTrips.mockResolvedValue([{ id: "new" }, { id: "older" }]);
    mocks.readPlanState.mockImplementation(async (_db, id) =>
      id === "new" ? plan({}) : plan({ "d1-morning": "Castle" }),
    );
    mocks.getTrip.mockResolvedValue(trip("older", "New trip"));
    const found = await loadShaped("ana");
    expect(found).toMatchObject({ tripId: "older", title: "Lisbon" });
    expect(found?.pairs[0].memory).toBe("A relaxed pace");
    expect(mocks.getTrip).toHaveBeenCalledWith("ana", "older");
  });

  it("is nothing when no trip has a plan, or the plan shows nothing of the profile", async () => {
    mocks.listTrips.mockResolvedValue([{ id: "new" }]);
    mocks.readPlanState.mockResolvedValue(plan({}));
    expect(await loadShaped("ana")).toBeNull();

    mocks.readPlanState.mockResolvedValue(plan({ "d1-morning": "Castle" }));
    mocks.getTrip.mockResolvedValue(trip("new", "Lisbon in spring"));
    mocks.readProfile.mockResolvedValue({ entries: [] });
    expect(await loadShaped("ana")).toBeNull();
  });
});
