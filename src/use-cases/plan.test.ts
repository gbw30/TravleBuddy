import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PlanState } from "@/features/itinerary/contracts";
import type { PlaceDto } from "@/features/places/contracts";
import type { TripDetail } from "@/features/trips/contracts";

// The stores are stand-ins. Laying the plan out and ranking the cards are the
// real ones.
const mocks = vi.hoisted(() => ({
  getTrip: vi.fn(),
  readPlanState: vi.fn(),
  writePlanVersion: vi.fn(),
  readBuild: vi.fn(),
  getPlaces: vi.fn(),
  listSights: vi.fn(),
  listFoodNear: vi.fn(),
  recordPresented: vi.fn(),
  readDiscards: vi.fn(),
  readTripTaste: vi.fn(),
  readProfile: vi.fn(),
  appendMessages: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: { name: "db" } }));
vi.mock("@/features/trips", () => ({
  getTrip: mocks.getTrip,
  findEditable: vi.fn(),
}));
vi.mock("@/features/itinerary", async (actual) => ({
  ...(await actual<typeof import("@/features/itinerary")>()),
  readPlanState: mocks.readPlanState,
  writePlanVersion: mocks.writePlanVersion,
  readBuild: mocks.readBuild,
  undoPlan: vi.fn(),
}));
vi.mock("@/features/places", () => ({
  getPlaces: mocks.getPlaces,
  listSights: mocks.listSights,
  listFoodNear: mocks.listFoodNear,
  gatherSights: vi.fn(),
  gatherFoodNear: vi.fn(),
  addOwnPlace: vi.fn(),
  findPlacesByName: vi.fn(),
}));
vi.mock("@/features/recommendations", async (actual) => ({
  ...(await actual<typeof import("@/features/recommendations")>()),
  recordPresented: mocks.recordPresented,
  readDiscards: mocks.readDiscards,
  recordCard: vi.fn(),
  recordDiscards: vi.fn(),
}));
vi.mock("@/features/memory", async (actual) => ({
  ...(await actual<typeof import("@/features/memory")>()),
  readTripTaste: mocks.readTripTaste,
  readProfile: mocks.readProfile,
}));
vi.mock("@/features/conversation", async (actual) => ({
  ...(await actual<typeof import("@/features/conversation")>()),
  appendMessages: mocks.appendMessages,
}));
vi.mock("./trip-action", () => ({ runTripAction: vi.fn(), Refusal: class {} }));

import { loadPlan, setPlanPace } from "./plan";

const tokyo = {
  name: "Tokyo",
  region: null,
  country: "Japan",
  latitude: 35.68,
  longitude: 139.76,
  timeZone: "Asia/Tokyo",
};
const place = (id: string, kind: PlaceDto["kind"], name = id): PlaceDto => ({
  id,
  origin: "SAMPLE",
  name,
  kind,
  cityKey: "tokyo|japan",
  latitude: 35.7,
  longitude: 139.77,
  address: null,
  openingHours: null,
  notable: false,
  serves: [],
  servesNot: [],
});
const sights = [
  place("s1", "temple", "Senso-ji"),
  place("s2", "museum", "Tokyo National Museum"),
  place("s3", "park", "Ueno Park"),
];
const food = [
  place("f1", "restaurant", "Soba House"),
  place("f2", "cafe", "Kissa Ko"),
];
const trip = (over: Partial<TripDetail> = {}) =>
  ({
    id: "trip-1",
    archived: false,
    planningMode: "GUIDED",
    facts: {
      cities: [{ city: tokyo, nights: 2 }],
      startDate: "2027-05-10",
      endDate: "2027-05-12",
      lengthNights: null,
      timeOfYear: null,
      datesFirmness: "FIXED",
      adults: 2,
      children: 0,
      budgetAmount: null,
      budgetCurrency: null,
      budgetBasis: null,
      budgetFirmness: null,
      purpose: null,
    },
    commitments: [],
    clashes: [],
    ...over,
  }) as TripDetail;
const state = (over: Partial<PlanState> = {}): PlanState => ({
  pace: "balanced",
  provisionalStart: null,
  picks: {},
  shelf: [],
  transferTimes: {},
  ...over,
});
const load = (slot?: string) => loadPlan("user-1", "trip-1", slot, false);

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getTrip.mockResolvedValue(trip());
  mocks.readPlanState.mockResolvedValue({ state: state(), canUndo: false });
  mocks.readBuild.mockResolvedValue(null);
  mocks.getPlaces.mockResolvedValue([]);
  mocks.listSights.mockResolvedValue(sights);
  mocks.listFoodNear.mockResolvedValue(food);
  mocks.readDiscards.mockResolvedValue([]);
  mocks.readTripTaste.mockResolvedValue({});
  mocks.readProfile.mockResolvedValue({ entries: [] });
  // Every card is shown for the first time.
  mocks.recordPresented.mockImplementation(
    async (_db, _trip, _slot, ids) => ids,
  );
});

describe("proposals in guided planning", () => {
  it("proposes for the first sight slot and saves the proposal to the conversation, naming its slot", async () => {
    const plan = await load();

    expect(plan?.proposal?.slotId).toBe("d1-morning");
    expect(plan?.proposal?.cards).toHaveLength(3);
    expect(plan?.holding).toBeNull();
    expect(mocks.appendMessages).toHaveBeenCalledTimes(1);
    const [, tripId, [message]] = mocks.appendMessages.mock.calls[0];
    expect(tripId).toBe("trip-1");
    expect(message).toMatchObject({
      from: "agent",
      body: { kind: "proposal", slotId: "d1-morning" },
    });
    expect(message.body.text).toMatch(
      /^For day 1, morning at \d\d:\d\d, I suggest one of these\.$/,
    );
    expect([...message.body.placeNames].sort()).toEqual([
      "Senso-ji",
      "Tokyo National Museum",
      "Ueno Park",
    ]);
  });

  it("ranks by the taste the traveller told, and the reason names it", async () => {
    mocks.readTripTaste.mockResolvedValue({
      interests: { values: ["museums"], source: "told" },
    });
    const [first, second] = (await load())!.proposal!.cards;
    expect(first.name).toBe("Tokyo National Museum");
    expect(first.reason).toContain(
      "You said you like museums and exhibitions.",
    );
    expect(second.reason).toContain("It is not one of the interests you named");
  });

  it("starts from the personal profile, and the reason names the trip the memory comes from", async () => {
    mocks.readProfile.mockResolvedValue({
      entries: [
        {
          id: "e1",
          topic: "interests",
          value: "museums",
          sureness: "think",
          source: { type: "trip", tripId: "t0", tripTitle: "Lisbon in spring" },
        },
      ],
    });
    const [first] = (await load())!.proposal!.cards;
    expect(first.name).toBe("Tokyo National Museum");
    expect(first.reason).toContain(
      "I remember from your trip “Lisbon in spring” that you like museums and exhibitions.",
    );
    // What is said for this trip wins over the memory.
    mocks.readTripTaste.mockResolvedValue({
      interests: { values: ["nature"], source: "told" },
    });
    const [now] = (await load())!.proposal!.cards;
    expect(now.name).toBe("Ueno Park");
    expect(now.reason).toContain("You said you like parks and nature.");
  });

  it("does not hold back meals from a traveller whose dietary rules are remembered", async () => {
    mocks.readProfile.mockResolvedValue({
      entries: [
        {
          id: "e2",
          topic: "dietary_rules",
          value: "vegetarian",
          sureness: "always",
          source: { type: "told" },
        },
      ],
    });
    const plan = await load("d1-lunch");
    expect(plan?.holding).toBeNull();
    expect(plan?.proposal?.cards[0].reason).toContain(
      "You eat vegetarian food",
    );
  });

  it("keeps the remembered hard limits on every meal: no conflicting place, and the rest marked", async () => {
    const limit = (topic: string, value: string) => ({
      id: `${topic}-${value}`,
      topic,
      value,
      sureness: "always",
      source: { type: "told" },
    });
    mocks.readProfile.mockResolvedValue({
      entries: [
        limit("dietary_rules", "vegetarian"),
        limit("allergies", "shellfish"),
      ],
    });
    mocks.listFoodNear.mockResolvedValue([
      { ...food[0], servesNot: ["vegetarian"] },
      { ...food[1], serves: ["vegetarian"] },
    ]);
    // The trip's own food answer cannot take a remembered rule away.
    mocks.readTripTaste.mockResolvedValue({
      food: { values: ["none"], source: "told" },
    });
    const cards = (await load("d1-lunch"))!.proposal!.cards;
    expect(cards.map((card) => card.name)).toEqual(["Kissa Ko"]);
    expect(cards[0].unconfirmed).toEqual(["shellfish allergy"]);
    expect(cards[0].reason).toContain(
      "Its listing says it serves vegetarian food",
    );
    expect(cards[0].essentials).toContain("not confirmed: shellfish allergy");
  });

  it("does not save the same proposal twice", async () => {
    mocks.recordPresented.mockResolvedValue([]);
    expect((await load())?.proposal?.cards).toHaveLength(3);
    expect(mocks.appendMessages).not.toHaveBeenCalled();
  });

  it("holds back a meal until the food question is answered or skipped, and says so", async () => {
    const plan = await load("d1-lunch");
    expect(plan).toMatchObject({
      proposal: null,
      holding: "food",
      shelfOffer: null,
    });
    expect(mocks.listFoodNear).not.toHaveBeenCalled();
    expect(mocks.recordPresented).not.toHaveBeenCalled();
    expect(mocks.appendMessages).not.toHaveBeenCalled();
  });

  it("proposes the meal once food is answered, or skipped with its default", async () => {
    for (const answer of [
      { values: ["vegetarian"], source: "told" },
      { values: ["none"], source: "default" },
    ]) {
      mocks.readTripTaste.mockResolvedValue({ food: answer });
      const plan = await load("d1-lunch");
      expect(plan?.holding).toBeNull();
      expect(plan?.proposal?.slotId).toBe("d1-lunch");
      expect(plan?.proposal?.cards.map((card) => card.name).sort()).toEqual([
        "Kissa Ko",
        "Soba House",
      ]);
    }
    expect(mocks.appendMessages.mock.calls[0][2][0].body.text).toMatch(
      /^For day 1, lunch at \d\d:\d\d, I suggest one of these\.$/,
    );
  });

  it("holds back when only meals are left to fill", async () => {
    // Every sight slot of the trip is filled.
    const days = (await load())!.view.days;
    const picks = Object.fromEntries(
      days.flatMap((day) =>
        day.entries.flatMap((entry) =>
          entry.type === "open" &&
          entry.kind !== "lunch" &&
          entry.kind !== "dinner"
            ? [[entry.slotId, { placeId: "s1", minutes: null }]]
            : [],
        ),
      ),
    );
    mocks.readPlanState.mockResolvedValue({
      state: state({ picks }),
      canUndo: true,
    });
    mocks.getPlaces.mockResolvedValue([sights[0]]);
    expect(await load()).toMatchObject({ proposal: null, holding: "food" });
  });
});

describe("proposals outside guided planning", () => {
  it("never wait for the food question and are not written to a conversation", async () => {
    mocks.getTrip.mockResolvedValue(trip({ planningMode: "QUICK" }));
    const plan = await load("d1-lunch");
    expect(plan?.holding).toBeNull();
    expect(plan?.proposal?.slotId).toBe("d1-lunch");
    expect(mocks.appendMessages).not.toHaveBeenCalled();
  });

  it("are not made for an archived trip", async () => {
    mocks.getTrip.mockResolvedValue(trip({ archived: true }));
    expect(await load()).toMatchObject({
      proposal: null,
      holding: null,
      shelfOffer: null,
    });
    expect(mocks.recordPresented).not.toHaveBeenCalled();
  });
});

describe("the agent's offer of a saved place", () => {
  const shelved = place("s9", "viewpoint", "Tokyo Skytree");
  beforeEach(() => {
    mocks.readPlanState.mockResolvedValue({
      state: state({ shelf: [{ placeId: "s9", reason: null }] }),
      canUndo: true,
    });
    mocks.getPlaces.mockResolvedValue([shelved]);
  });

  it("names a shelved place that fits the open slot in focus", async () => {
    expect((await load())?.shelfOffer).toEqual({
      placeId: "s9",
      name: "Tokyo Skytree",
      slotId: "d1-morning",
    });
  });

  it("offers nothing for a slot the place does not suit, or one in another city", async () => {
    mocks.readTripTaste.mockResolvedValue({
      food: { values: ["none"], source: "told" },
    });
    expect((await load("d1-lunch"))?.shelfOffer).toBeNull();
    mocks.getPlaces.mockResolvedValue([{ ...shelved, cityKey: "kyoto|japan" }]);
    expect((await load())?.shelfOffer).toBeNull();
  });
});

describe("setting the plan's pace from the conversation", () => {
  const tx = { name: "tx" } as never;

  it("writes a plan version with the new pace, inside the change under way", async () => {
    expect(await setPlanPace(tx, trip(), "user-1", "relaxed")).toBe(true);
    expect(mocks.readPlanState).toHaveBeenCalledWith(tx, "trip-1");
    expect(mocks.writePlanVersion).toHaveBeenCalledWith(
      tx,
      "trip-1",
      expect.objectContaining({ pace: "relaxed" }),
      "Set the pace to relaxed",
    );
  });

  it("writes nothing when the plan already has that pace", async () => {
    expect(await setPlanPace(tx, trip(), "user-1", "balanced")).toBe(false);
    expect(mocks.writePlanVersion).not.toHaveBeenCalled();
  });
});
