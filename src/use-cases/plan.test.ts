import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PlanState } from "@/features/itinerary/contracts";
import type { PlaceDto } from "@/features/places/contracts";
import type { TripDetail } from "@/features/trips/contracts";
import { fillAll } from "@/lib/wording";

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
  recordWordings: vi.fn(),
  usesSamplePlaces: vi.fn(),
  removeOwnPlace: vi.fn(),
  listTrips: vi.fn(),
  advanceTripRevision: vi.fn(),
  runTripAction: vi.fn(),
  findEditable: vi.fn(),
  findPlacesByName: vi.fn(),
  wordingMode: vi.fn(),
  modelCall: vi.fn(),
  readWordings: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: { name: "db" } }));
vi.mock("@/features/trips", () => ({
  getTrip: mocks.getTrip,
  findEditable: mocks.findEditable,
  listTrips: mocks.listTrips,
  advanceTripRevision: mocks.advanceTripRevision,
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
  findPlacesByName: mocks.findPlacesByName,
  usesSamplePlaces: mocks.usesSamplePlaces,
  removeOwnPlace: mocks.removeOwnPlace,
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
  recordWordings: mocks.recordWordings,
  readWordings: mocks.readWordings,
  wordingMode: mocks.wordingMode,
  modelCall: mocks.modelCall,
}));
vi.mock("./trip-action", () => ({
  runTripAction: mocks.runTripAction,
  Refusal: class {
    constructor(readonly message: string) {}
  },
}));

import {
  findTripPlaces,
  loadPlan,
  removeTripPlace,
  setPlanPace,
  tripsAlsoHolding,
} from "./plan";

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
  originRef: null,
  tags: {},
  lastEditedAt: null,
  fetchedAt: null,
  hoursDoubt: null,
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
  mocks.listTrips.mockResolvedValue([]);
  mocks.wordingMode.mockReturnValue("off");
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
    // It is recorded with the sentence it was made of.
    expect(message.sentences).toHaveLength(1);
    expect(message.sentences[0]).toMatchObject({ template: "proposal-offer" });
    expect(fillAll(message.sentences)).toBe(message.body.text);
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
      "The sample data says it serves vegetarian food",
    );
    expect(cards[0].essentials).toContain("not confirmed: shellfish allergy");
  });

  it("measures the first slot of a day, and the slot after a check-in, from the stay once its address is confirmed", async () => {
    const stay = {
      id: "s1",
      kind: "STAY",
      title: "Hotel Aurora",
      date: "2027-05-10",
      startTime: "15:00",
      endDate: "2027-05-12",
      endTime: null,
      reference: null,
      note: null,
      located: {
        latitude: 35.69,
        longitude: 139.7,
        ref: "way/1",
        address: "Hotel Aurora, Tokyo",
      },
      transport: null,
    };
    mocks.getTrip.mockResolvedValue(trip({ commitments: [stay] as never }));

    // Day 2 starts where the traveller slept.
    const morning = (await load("d2-morning"))!.proposal!.cards;
    expect(morning.every((card) => card.travel !== null)).toBe(true);

    // The late afternoon of day 1 follows the check-in.
    const after = (await load("d1-afternoon-2"))!.proposal!.cards;
    expect(after.every((card) => card.travel !== null)).toBe(true);

    // With no confirmed address there is nothing to measure from.
    mocks.getTrip.mockResolvedValue(
      trip({ commitments: [{ ...stay, located: null }] as never }),
    );
    const unknown = (await load("d2-morning"))!.proposal!.cards;
    expect(unknown.every((card) => card.travel === null)).toBe(true);
  });

  it("still measures the first slot from the stay when the day starts with a commitment with no time", async () => {
    const stay = {
      id: "stay",
      kind: "STAY",
      title: "Hotel Aurora",
      date: "2027-05-10",
      startTime: null,
      endDate: "2027-05-12",
      endTime: null,
      reference: null,
      note: null,
      located: {
        latitude: 35.69,
        longitude: 139.7,
        ref: "way/1",
        address: "Hotel Aurora, Tokyo",
      },
      transport: null,
    };
    const ticketNoTime = {
      ...stay,
      id: "train",
      kind: "TRANSPORT",
      title: "Train ticket, time to come",
      date: "2027-05-11",
      endDate: null,
      located: null,
    };
    mocks.getTrip.mockResolvedValue(
      trip({ commitments: [stay, ticketNoTime] as never }),
    );
    const plan = (await load("d2-morning"))!;
    expect(plan.view.days[1].entries[0]).toMatchObject({
      commitmentId: "train",
      start: null,
    });
    expect(plan.proposal!.cards.every((card) => card.travel !== null)).toBe(
      true,
    );
  });

  it("measures an open slot after the last place from that place, with no way back listed before it", async () => {
    mocks.getTrip.mockResolvedValue(
      trip({
        commitments: [
          {
            id: "stay",
            kind: "STAY",
            title: "Hotel Aurora",
            date: "2027-05-10",
            startTime: null,
            endDate: "2027-05-12",
            endTime: null,
            reference: null,
            note: null,
            located: {
              latitude: 35.69,
              longitude: 139.7,
              ref: "way/1",
              address: "Hotel Aurora, Tokyo",
            },
            transport: null,
          },
        ] as never,
      }),
    );
    mocks.readPlanState.mockResolvedValue({
      state: state({ picks: { "d2-morning": { placeId: "s1", minutes: 60 } } }),
      canUndo: false,
    });
    mocks.getPlaces.mockResolvedValue([sights[0]]);
    const plan = (await load("d2-afternoon"))!;
    expect(plan.view.days[1].entries.map((e) => e.type).slice(0, 2)).toEqual([
      "place",
      "open",
    ]);
    expect(plan.view.days[1].returnNote).toBe(
      `The way back from ${sights[0].name} is not counted.`,
    );
    expect(plan.proposal!.cards.every((card) => card.travel !== null)).toBe(
      true,
    );
  });

  it("treats a sample address as no position once the sample places are off", async () => {
    const stay = {
      id: "s1",
      kind: "STAY",
      title: "Hotel Aurora",
      date: "2027-05-10",
      startTime: null,
      endDate: "2027-05-12",
      endTime: null,
      reference: null,
      note: null,
      located: {
        latitude: 35.69,
        longitude: 139.7,
        ref: "sample/centre",
        address: "Sample address, city centre",
      },
      transport: null,
    };
    mocks.getTrip.mockResolvedValue(trip({ commitments: [stay] as never }));
    mocks.readPlanState.mockResolvedValue({
      state: state({
        picks: { "d2-afternoon": { placeId: "s1", minutes: null } },
      }),
      canUndo: false,
    });
    mocks.getPlaces.mockResolvedValue([sights[0]]);
    const day2 = async (sampleMode: boolean) => {
      mocks.usesSamplePlaces.mockReturnValue(sampleMode);
      const plan = (await load("d2-morning"))!;
      return {
        cards: plan.proposal!.cards,
        day: plan.view.days[1],
      };
    };

    const off = await day2(false);
    expect(off.cards.every((card) => card.travel === null)).toBe(true);
    expect(off.day.entries.find((e) => e.type === "place")).toMatchObject({
      travelIn: null,
    });
    expect(off.day.stayNote).toBe(
      "Travel from where you stay is not counted. Add its address.",
    );

    const on = await day2(true);
    expect(on.cards.every((card) => card.travel !== null)).toBe(true);
    expect(on.day.entries.find((e) => e.type === "place")).toMatchObject({
      travelIn: { means: "transit" },
    });
    expect(on.day.stayNote).toBeNull();
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

describe("the record of a card's reason", () => {
  it("is the shown text, with its sentences, and is the same on the next read", async () => {
    const first = await load();
    const rows = () => mocks.recordWordings.mock.calls.flatMap(([, , r]) => r);
    const proposed = rows().filter((row) =>
      row.subject.startsWith("card:d1-morning:"),
    );
    expect(proposed).toHaveLength(3);
    for (const card of first?.proposal?.cards ?? []) {
      const row = proposed.find((r) => r.subject.endsWith(`:${card.placeId}`));
      expect(row).toMatchObject({
        shown: card.reason,
        wordedBy: "template",
        fallback: "off",
      });
      expect(row.sentences.length).toBeGreaterThan(0);
    }
    const again = await load();
    const keys = (rs: typeof proposed) =>
      rs.map((r) => `${r.subject}|${r.factsKey}`).sort();
    // The same facts give the same key, so the store writes nothing new.
    expect(keys(rows().slice(-proposed.length))).toEqual(keys(proposed));
    expect(again?.proposal?.cards.map((c) => c.reason)).toEqual(
      first?.proposal?.cards.map((c) => c.reason),
    );
    expect(first?.proposal).not.toHaveProperty("sentences");
  });
});

describe("the facts of a reason that rest on the profile", () => {
  it("cite the entry's id, read through to the record", async () => {
    mocks.readProfile.mockResolvedValue({
      entries: [
        {
          id: "entry-9",
          topic: "interests",
          value: "museums",
          sureness: "always",
          source: { type: "told" },
        },
      ],
    });
    await load();
    const refs = mocks.recordWordings.mock.calls
      .flatMap(([, , rows]) => rows)
      .flatMap((row) => row.sentences)
      .flatMap((sentence) => sentence.facts)
      .flatMap((fact) =>
        fact.source.type === "traveller" ? [fact.source.ref] : [],
      );
    expect(refs).toContain("profile:entry-9");
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

describe("the shape of the day in a plan", () => {
  const firstStart = async () => {
    const plan = await load();
    const entry = plan?.view.days[0].entries.find(
      (item) => item.type === "open",
    );
    return entry?.type === "open" ? entry.start : null;
  };
  const remembered = (value: string) => ({
    entries: [
      {
        topic: "day_shape",
        value,
        sureness: "always",
        source: { type: "told" },
      },
    ],
  });

  it("moves the day an hour earlier for a traveller who likes early starts, and later for late nights", async () => {
    const usual = await firstStart();
    mocks.readProfile.mockResolvedValue(remembered("early"));
    const early = await firstStart();
    mocks.readProfile.mockResolvedValue(remembered("late"));
    const late = await firstStart();
    const hour = (clock: string | null) => Number(clock?.slice(0, 2));
    expect(hour(early)).toBe(hour(usual) - 1);
    expect(hour(late)).toBe(hour(usual) + 1);
  });

  it("goes by what was said for this trip where it differs from the profile", async () => {
    const usual = await firstStart();
    mocks.readProfile.mockResolvedValue(remembered("early"));
    mocks.readTripTaste.mockResolvedValue({
      day_shape: { values: ["neither"], source: "told" },
    });
    expect(await firstStart()).toBe(usual);
  });

  it("lays out a change to the plan from the same shifted day", async () => {
    mocks.readProfile.mockResolvedValue(remembered("early"));
    await setPlanPace({ name: "tx" } as never, trip(), "user-1", "packed");
    // A packed day for an early riser has its first slot at eight.
    expect(mocks.writePlanVersion).toHaveBeenCalledTimes(1);
    const plan = await load();
    expect(
      plan?.view.days[0].entries.some((item) => item.type === "open"),
    ).toBe(true);
  });
});

describe("the pace a new plan starts at", () => {
  const pace = (value: string) => ({
    entries: [
      { topic: "pace", value, sureness: "always", source: { type: "told" } },
    ],
  });
  const sightsADay = async () => {
    const plan = await load();
    return {
      pace: plan?.view.pace,
      sights: plan?.view.days[1].entries.filter(
        (entry) =>
          entry.type === "open" &&
          entry.kind !== "lunch" &&
          entry.kind !== "dinner",
      ).length,
    };
  };

  it("is the remembered pace while nobody has changed the plan", async () => {
    mocks.readPlanState.mockResolvedValue({
      state: state(),
      canUndo: false,
      fresh: true,
    });
    expect(await sightsADay()).toEqual({ pace: "balanced", sights: 3 });
    mocks.readProfile.mockResolvedValue(pace("relaxed"));
    expect(await sightsADay()).toEqual({ pace: "relaxed", sights: 2 });
    mocks.readProfile.mockResolvedValue(pace("packed"));
    expect(await sightsADay()).toEqual({ pace: "packed", sights: 4 });
  });

  it("is this trip's own answer where it differs from the profile", async () => {
    mocks.readPlanState.mockResolvedValue({
      state: state(),
      canUndo: false,
      fresh: true,
    });
    mocks.readProfile.mockResolvedValue(pace("relaxed"));
    mocks.readTripTaste.mockResolvedValue({
      pace: { values: ["packed"], source: "told" },
    });
    expect((await sightsADay()).pace).toBe("packed");
  });

  it("gives way to the plan's own pace once the plan has been changed", async () => {
    mocks.readProfile.mockResolvedValue(pace("relaxed"));
    mocks.readPlanState.mockResolvedValue({
      state: state({ pace: "balanced" }),
      canUndo: true,
      fresh: false,
    });
    expect((await sightsADay()).pace).toBe("balanced");
  });

  it("writes no plan version when the pace answered is the one the plan already starts at", async () => {
    mocks.readPlanState.mockResolvedValue({
      state: state(),
      canUndo: false,
      fresh: true,
    });
    mocks.readProfile.mockResolvedValue(pace("relaxed"));
    expect(
      await setPlanPace({ name: "tx" } as never, trip(), "user-1", "relaxed"),
    ).toBe(false);
    expect(mocks.writePlanVersion).not.toHaveBeenCalled();
    expect(
      await setPlanPace({ name: "tx" } as never, trip(), "user-1", "packed"),
    ).toBe(true);
    expect(mocks.writePlanVersion).toHaveBeenCalledTimes(1);
  });
});

describe("a trip deleted while its plan is read", () => {
  it("answers as a trip that does not exist, not as a failure", async () => {
    // The cards shown are recorded against the trip, which is gone by then.
    mocks.recordPresented.mockRejectedValue(new Error("foreign key"));
    mocks.getTrip.mockResolvedValueOnce(trip()).mockResolvedValueOnce(null);
    expect(await load()).toBeNull();
  });

  it("still fails when the trip is there and something else went wrong", async () => {
    mocks.recordPresented.mockRejectedValue(new Error("database down"));
    await expect(load()).rejects.toThrow("database down");
  });
});

describe("cards that would break a rule of the plan", () => {
  it("are not offered: a lunch that would run into something decided gives way to one that fits", async () => {
    // Meals are proposed once the food question is answered.
    mocks.readTripTaste.mockResolvedValue({
      food: { values: ["none"], source: "told" },
    });
    // Without anything decided, both places to eat are offered.
    expect(
      (await load("d1-lunch"))?.proposal?.cards.map((card) => card.name).sort(),
    ).toEqual(["Kissa Ko", "Soba House"]);
    // A lunch from 12:30 takes until 13:45; this is decided from 13:30.
    mocks.getTrip.mockResolvedValue(
      trip({
        commitments: [
          {
            id: "c-1",
            kind: "RESERVATION",
            title: "teamLab Planets",
            date: "2027-05-10",
            startTime: "13:30",
            endDate: null,
            endTime: "15:00",
            reference: null,
            note: null,
            located: null,
            transport: null,
          },
        ],
      }),
    );
    const plan = await load("d1-lunch");
    const lunch = plan?.view.days[0].entries.find(
      (entry) => entry.type === "open" && entry.kind === "lunch",
    );
    // The slot is there. The restaurant's 75 minutes would overlap what is
    // decided; the cafe's shorter stop fits before it, so only it is offered.
    expect(lunch).toBeDefined();
    expect(plan?.proposal?.cards.map((card) => card.name)).toEqual([
      "Kissa Ko",
    ]);
    expect(plan?.proposal?.short).toBe(true);
    // The other days' lunches are untouched.
    expect((await load("d2-lunch"))?.proposal?.cards.length).toBeGreaterThan(0);
  });
});

describe("a place the traveller has already decided", () => {
  it("is not offered again as a card, whatever the case of its name", async () => {
    const names = async () =>
      (await load("d1-morning"))?.proposal?.cards.map((card) => card.name);
    expect(await names()).toContain("Senso-ji");
    mocks.getTrip.mockResolvedValue(
      trip({
        commitments: [
          {
            id: "c-1",
            kind: "RESERVATION",
            title: " senso-JI",
            date: "2027-05-11",
            startTime: "15:00",
            endDate: null,
            endTime: "16:00",
            reference: null,
            note: null,
            located: null,
            transport: null,
          },
        ],
      }),
    );
    const offered = await names();
    expect(offered).not.toContain("Senso-ji");
    expect(offered?.length).toBeGreaterThan(0);
  });
});

describe("a breakfast place on another day", () => {
  const picked = (id: string) => ({ placeId: id, minutes: null });
  const names = async (slot: string) =>
    (await load(slot))?.proposal?.cards.map((card) => card.name) ?? [];
  const pickedAt = (slot: string) => {
    mocks.readTripTaste.mockResolvedValue({
      breakfast: { values: ["suggest"], source: "told" },
      food: { values: [], source: "told" },
    });
    mocks.readPlanState.mockResolvedValue({
      state: state({ picks: { [slot]: picked("f2") } }),
      canUndo: false,
    });
    mocks.getPlaces.mockResolvedValue([food[1]]);
  };

  it("is offered again for another day's breakfast, never for the same day or another meal", async () => {
    pickedAt("d1-breakfast");
    expect(await names("d2-breakfast")).toContain("Kissa Ko");
    expect(await names("d2-lunch")).not.toContain("Kissa Ko");
    expect(await names("d1-lunch")).not.toContain("Kissa Ko");
  });

  it("is not offered for breakfast when it is a lunch place", async () => {
    pickedAt("d1-lunch");
    expect(await names("d2-breakfast")).not.toContain("Kissa Ko");
  });
});

describe("what the plan says of its chosen places", () => {
  const picked = (id: string) => ({ placeId: id, minutes: null });
  const withPick = () => {
    mocks.readPlanState.mockResolvedValue({
      state: state({ picks: { "d1-morning": picked("s1") } }),
      canUndo: false,
    });
    mocks.getPlaces.mockResolvedValue([sights[0]]);
  };

  it("says I chose a built place left in place, and You chose one the traveller picked", async () => {
    withPick();
    expect((await load())?.chosen.s1.reason).toBe("You chose this for day 1.");
    mocks.readBuild.mockResolvedValue({
      nextDay: 2,
      built: { "d1-morning": "s1" },
      close: [],
      empty: [],
      unreachable: false,
    });
    expect((await load())?.chosen.s1.reason).toBe("I chose this for day 1.");
    // The traveller moved it elsewhere: it is theirs now.
    mocks.readBuild.mockResolvedValue({
      nextDay: 2,
      built: { "d1-afternoon": "s1" },
      close: [],
      empty: [],
      unreachable: false,
    });
    expect((await load())?.chosen.s1.reason).toBe("You chose this for day 1.");
  });

  it("times travel from the stop before, and not from a place before a booking", async () => {
    withPick();
    const slot = "d1-afternoon";
    expect((await load(slot))?.proposal?.cards[0].travel).not.toBeNull();
    mocks.getTrip.mockResolvedValue(
      trip({
        commitments: [
          {
            id: "c-1",
            kind: "RESERVATION",
            title: "teamLab Planets",
            date: "2027-05-10",
            startTime: "13:00",
            endDate: null,
            endTime: "14:00",
            reference: null,
            note: null,
            located: null,
            transport: null,
          },
        ],
      }),
    );
    const plan = await load(slot);
    expect(plan?.proposal?.slotId).toBe(slot);
    expect(plan?.proposal?.cards[0].travel).toBeNull();
    expect(plan?.proposal?.cards[0].reason).toMatch(/^It fits your afternoon/);
  });
});

describe("removing a place the traveller added", () => {
  const picked = (id: string) => ({ placeId: id, minutes: null });
  const control = { operationId: "op-1", expectedRevision: 1 };
  const tx = { name: "tx" };
  /** Runs the change the use-case hands to the ledger, as the ledger would. */
  const remove = async () => {
    mocks.runTripAction.mockImplementation(({ apply }) => apply(tx));
    return removeTripPlace({
      userId: "user-1",
      tripId: "trip-1",
      placeId: "own",
      control,
    });
  };

  it("reopens its slots, leaves the shelf, and says it was removed", async () => {
    mocks.removeOwnPlace.mockResolvedValue("Aunt's flat");
    mocks.readPlanState.mockResolvedValue({
      state: state({
        picks: { "d1-morning": picked("own"), "d2-morning": picked("s1") },
        shelf: [{ placeId: "own", reason: null }],
      }),
      canUndo: false,
    });
    expect(await remove()).toEqual({ summary: "Aunt's flat was removed." });
    expect(mocks.removeOwnPlace).toHaveBeenCalledWith(tx, "user-1", "own");
    expect(mocks.writePlanVersion).toHaveBeenCalledWith(
      tx,
      "trip-1",
      expect.objectContaining({
        picks: { "d2-morning": picked("s1") },
        shelf: [],
      }),
      "Aunt's flat was removed.",
    );
  });

  it("refuses a place that is not the traveller's own, and changes no plan", async () => {
    mocks.removeOwnPlace.mockResolvedValue(null);
    expect(await remove()).toMatchObject({
      message: "That place is not one you added.",
    });
    expect(mocks.writePlanVersion).not.toHaveBeenCalled();
  });

  it("saves no new plan when the plan never held it", async () => {
    mocks.removeOwnPlace.mockResolvedValue("Aunt's flat");
    expect(await remove()).toEqual({ summary: "Aunt's flat was removed." });
    expect(mocks.writePlanVersion).not.toHaveBeenCalled();
  });

  it("reopens the slot in every other trip that holds it, and says so there", async () => {
    mocks.removeOwnPlace.mockResolvedValue("Aunt's flat");
    mocks.listTrips.mockResolvedValue([
      { id: "trip-1", title: "Tokyo" },
      { id: "trip-2", title: "Lisbon and Porto" },
      { id: "trip-3", title: "Never used it" },
    ]);
    const plans: Record<string, PlanState> = {
      "trip-1": state({ picks: { "d1-morning": picked("own") } }),
      "trip-2": state({
        picks: { "d2-lunch": picked("own"), "d1-morning": picked("s1") },
      }),
      "trip-3": state({ picks: { "d1-morning": picked("s1") } }),
    };
    mocks.readPlanState.mockImplementation(async (_db, id: string) => ({
      state: plans[id],
      canUndo: false,
    }));
    await remove();
    const written = mocks.writePlanVersion.mock.calls.map(([, id, next]) => [
      id,
      Object.keys(next.picks),
    ]);
    expect(written).toEqual([
      ["trip-2", ["d1-morning"]],
      ["trip-1", []],
    ]);
    expect(mocks.writePlanVersion.mock.calls[0][3]).toBe(
      "Aunt's flat was removed.",
    );
    expect(mocks.appendMessages).toHaveBeenCalledWith(tx, "trip-2", [
      {
        from: "agent",
        body: { kind: "text", text: "Aunt's flat was removed." },
      },
    ]);
    expect(mocks.advanceTripRevision).toHaveBeenCalledWith(
      tx,
      "user-1",
      "trip-2",
      undefined,
    );
    expect(mocks.advanceTripRevision).not.toHaveBeenCalledWith(
      tx,
      "user-1",
      "trip-3",
      undefined,
    );
  });

  it("names the other trips that hold a place of the traveller's own, for the confirm step", async () => {
    mocks.getPlaces.mockResolvedValue([
      { ...place("own", "museum"), origin: "USER" },
    ]);
    mocks.listTrips.mockResolvedValue([
      { id: "trip-1", title: "Tokyo" },
      { id: "trip-2", title: "Lisbon and Porto" },
      { id: "trip-3", title: "Never used it" },
    ]);
    mocks.readPlanState.mockImplementation(async (_db, id: string) => ({
      state:
        id === "trip-3"
          ? state()
          : state({ shelf: [{ placeId: "own", reason: null }] }),
      canUndo: false,
    }));
    expect(await tripsAlsoHolding("user-1", "trip-1", "own")).toEqual([
      { id: "trip-2", title: "Lisbon and Porto" },
    ]);
    // Not a place of their own: nothing to say.
    mocks.getPlaces.mockResolvedValue([place("own", "museum")]);
    expect(await tripsAlsoHolding("user-1", "trip-1", "own")).toEqual([]);
  });

  it("leaves an archived trip alone, and does not name it", async () => {
    mocks.removeOwnPlace.mockResolvedValue("Aunt's flat");
    mocks.getPlaces.mockResolvedValue([
      { ...place("own", "museum"), origin: "USER" },
    ]);
    mocks.listTrips.mockResolvedValue([
      { id: "trip-2", title: "Old trip", archived: true },
    ]);
    mocks.readPlanState.mockResolvedValue({
      state: state({ picks: { "d1-morning": picked("own") } }),
      canUndo: false,
    });
    expect(await tripsAlsoHolding("user-1", "trip-1", "own")).toEqual([]);
    await remove();
    expect(mocks.writePlanVersion.mock.calls.map(([, id]) => id)).toEqual([
      "trip-1",
    ]);
    expect(mocks.advanceTripRevision).not.toHaveBeenCalled();
  });

  it("answers null for a trip that is not the traveller's", async () => {
    mocks.getTrip.mockResolvedValue(null);
    expect(await tripsAlsoHolding("user-1", "trip-9", "own")).toBeNull();
    expect(mocks.listTrips).not.toHaveBeenCalled();
  });
});

describe("a read that shows no reasons", () => {
  it("never asks the model, even with wording on (the city for a place search)", async () => {
    mocks.wordingMode.mockReturnValue("on");
    mocks.modelCall.mockReturnValue(vi.fn());
    mocks.readWordings.mockResolvedValue([]);
    mocks.findPlacesByName.mockResolvedValue({ status: "ok", places: [] });
    await findTripPlaces("user-1", "trip-1", "d1-morning", "senso");
    expect(mocks.findPlacesByName).toHaveBeenCalledTimes(1);
    expect(mocks.modelCall).not.toHaveBeenCalled();
    expect(mocks.readWordings).not.toHaveBeenCalled();
  });
});
