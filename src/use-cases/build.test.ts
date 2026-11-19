import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BuildProgress, PlanState } from "@/features/itinerary/contracts";
import type { PlaceDto } from "@/features/places/contracts";
import type { CommitmentDto, TripDetail } from "@/features/trips/contracts";

// The stores, the places and the ledger are stand-ins that remember what is
// written. Laying the plan out, ranking the cards and applying a pick are
// the real ones.
const mocks = vi.hoisted(() => ({
  getTrip: vi.fn(),
  findEditable: vi.fn(),
  listSights: vi.fn(),
  listFoodNear: vi.fn(),
  gatherSights: vi.fn(),
  gatherFoodNear: vi.fn(),
  readTripTaste: vi.fn(),
  readProfile: vi.fn(),
  recordPresented: vi.fn(),
  appendMessages: vi.fn(),
}));
const store = vi.hoisted(() => ({
  state: null as unknown,
  build: null as unknown,
  versions: [] as string[],
  places: [] as { id: string }[],
  /** Runs between working a day out and saving it, as another tab would. */
  meanwhile: null as null | (() => void),
}));
vi.mock("@/lib/db", () => ({ db: { name: "db" } }));
vi.mock("@/features/trips", () => ({
  getTrip: mocks.getTrip,
  findEditable: mocks.findEditable,
}));
vi.mock("@/features/itinerary", async (actual) => ({
  ...(await actual<typeof import("@/features/itinerary")>()),
  readPlanState: vi.fn(async () => ({ state: store.state, canUndo: false })),
  writePlanVersion: vi.fn(async (_tx, _trip, state, summary) => {
    store.state = state;
    store.versions.push(summary);
  }),
  readBuild: vi.fn(async () => store.build),
  writeBuild: vi.fn(async (_tx, _trip, progress) => {
    store.build = progress;
  }),
  undoPlan: vi.fn(),
}));
vi.mock("@/features/places", () => ({
  getPlaces: vi.fn(async (ids: string[]) =>
    store.places.filter((place) => ids.includes(place.id)),
  ),
  listSights: mocks.listSights,
  listFoodNear: mocks.listFoodNear,
  gatherSights: mocks.gatherSights,
  gatherFoodNear: mocks.gatherFoodNear,
  addOwnPlace: vi.fn(),
  findPlacesByName: vi.fn(),
}));
vi.mock("@/features/recommendations", async (actual) => ({
  ...(await actual<typeof import("@/features/recommendations")>()),
  recordPresented: mocks.recordPresented,
  readDiscards: vi.fn(async () => []),
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
vi.mock("./trip-action", async (actual) => ({
  ...(await actual<typeof import("./trip-action")>()),
  // The ledger, reduced to what the build relies on: a repeat of an
  // operation gets its first answer and is not applied again.
  runTripAction: vi.fn(async (input) => {
    const { Refusal } = await actual<typeof import("./trip-action")>();
    const seen = ledger.get(input.control.operationId);
    if (seen) return seen;
    store.meanwhile?.();
    store.meanwhile = null;
    const applied = await input.apply({ name: "tx" });
    const outcome =
      typeof applied === "string"
        ? { status: applied }
        : applied instanceof Refusal
          ? { status: "refused", message: applied.message }
          : { status: "ok", data: applied, revision: ledger.size + 1 };
    if (outcome.status === "ok") ledger.set(input.control.operationId, outcome);
    return outcome;
  }),
}));
const ledger = new Map<string, unknown>();

import { buildNextDay, type BuildStep } from "./build";

const tokyo = {
  name: "Tokyo",
  region: null,
  country: "Japan",
  latitude: 35.68,
  longitude: 139.76,
  timeZone: "Asia/Tokyo",
};
const place = (
  id: string,
  kind: PlaceDto["kind"],
  over: Partial<PlaceDto> = {},
): PlaceDto => ({
  id,
  origin: "SAMPLE",
  name: id,
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
  ...over,
});
const sights = [
  place("temple-1", "temple"),
  place("museum-1", "museum"),
  place("park-1", "park"),
  place("view-1", "viewpoint"),
  place("market-1", "market"),
  place("sight-1", "sight"),
  place("museum-2", "museum"),
  place("park-2", "park"),
  place("temple-2", "temple"),
  place("sight-2", "sight"),
  place("view-2", "viewpoint"),
  place("market-2", "market"),
];
const food = [
  place("soba", "restaurant"),
  place("izakaya", "restaurant"),
  place("ramen", "restaurant"),
  place("sushi", "restaurant"),
  place("tempura", "restaurant"),
  place("udon", "restaurant"),
  place("kissa", "cafe"),
];
const trip = (over: Partial<TripDetail> = {}) =>
  ({
    id: "trip-1",
    archived: false,
    planningMode: "QUICK",
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
const emptyState = (over: Partial<PlanState> = {}): PlanState => ({
  pace: "balanced",
  provisionalStart: null,
  picks: {},
  shelf: [],
  transferTimes: {},
  ...over,
});
let operation = 0;
const build = (start: boolean, operationId = `op-${(operation += 1)}`) =>
  buildNextDay({
    userId: "user-1",
    tripId: "trip-1",
    control: { operationId, expectedRevision: 0 },
    start,
  });
/** Builds the whole trip, as the page does: start, then on until done. */
async function buildAll(): Promise<BuildStep[]> {
  const steps: BuildStep[] = [];
  for (let start = true; ; start = false) {
    const outcome = await build(start);
    if (outcome.status !== "ok") throw new Error(JSON.stringify(outcome));
    steps.push(outcome.data);
    if (outcome.data.done) return steps;
  }
}
const picks = () => (store.state as PlanState).picks;
const progress = () => store.build as BuildProgress;

beforeEach(() => {
  vi.clearAllMocks();
  ledger.clear();
  store.state = emptyState();
  store.build = null;
  store.versions = [];
  store.places = [...sights, ...food];
  store.meanwhile = null;
  mocks.getTrip.mockResolvedValue(trip());
  mocks.findEditable.mockResolvedValue(null);
  mocks.listSights.mockResolvedValue(sights);
  mocks.listFoodNear.mockResolvedValue(food);
  mocks.gatherSights.mockResolvedValue({ status: "ready" });
  mocks.gatherFoodNear.mockResolvedValue({ status: "ready" });
  mocks.readTripTaste.mockResolvedValue({});
  mocks.readProfile.mockResolvedValue({ entries: [] });
});

describe("building a trip one day at a time", () => {
  it("builds day 1 on the first request and says how far it is", async () => {
    const outcome = await build(true);
    expect(outcome).toMatchObject({
      status: "ok",
      data: { day: 1, done: false },
    });
    if (outcome.status !== "ok") return;
    expect(outcome.data.days).toBeGreaterThan(1);
    expect(outcome.data.filled).toBeGreaterThan(0);
    // Every pick is in day 1, and the day is saved as one version.
    expect(Object.keys(picks()).every((slot) => slot.startsWith("d1-"))).toBe(
      true,
    );
    expect(Object.keys(picks())).toHaveLength(outcome.data.filled);
    expect(store.versions).toEqual(["Built day 1"]);
    expect(progress().nextDay).toBe(2);
  });

  it("builds every day in turn, meals included, and no place twice", async () => {
    const steps = await buildAll();
    expect(steps.map((step) => step.day)).toEqual(
      steps.map((_, index) => index + 1),
    );
    expect(steps.at(-1)).toMatchObject({ done: true, day: steps[0].days });
    const chosen = Object.values(picks()).map((pick) => pick.placeId);
    expect(new Set(chosen).size).toBe(chosen.length);
    expect(Object.keys(picks()).some((slot) => slot.endsWith("-lunch"))).toBe(
      true,
    );
    expect(Object.keys(picks()).some((slot) => slot.endsWith("-dinner"))).toBe(
      true,
    );
    // Dinner is a restaurant, never a cafe.
    for (const [slot, pick] of Object.entries(picks())) {
      if (slot.endsWith("-dinner")) expect(pick.placeId).not.toBe("kissa");
    }
    expect(progress().built).toEqual(
      Object.fromEntries(
        Object.entries(picks()).map(([slot, pick]) => [slot, pick.placeId]),
      ),
    );
    expect(store.versions).toEqual(
      steps.map((step) => `Built day ${step.day}`),
    );
    // Nothing joins the conversation, and no card is recorded as shown.
    expect(mocks.appendMessages).not.toHaveBeenCalled();
    expect(mocks.recordPresented).not.toHaveBeenCalled();
  });

  it("does not build a day twice when the same request is repeated", async () => {
    const first = await build(true, "op-same");
    const after = structuredClone(store.state);
    const again = await build(true, "op-same");
    expect(again).toEqual(first);
    expect(store.state).toEqual(after);
    expect(store.versions).toEqual(["Built day 1"]);
  });

  it("resumes at the next day after the page was closed", async () => {
    await build(true);
    // A new page knows nothing but what was saved.
    const next = await build(false);
    expect(next).toMatchObject({ status: "ok", data: { day: 2 } });
    expect(Object.keys(picks()).some((slot) => slot.startsWith("d2-"))).toBe(
      true,
    );
  });

  it("refuses to continue when no build is in progress, or once it is finished", async () => {
    expect(await build(false)).toEqual({
      status: "refused",
      message: "No build is in progress.",
    });
    await buildAll();
    expect(await build(false)).toMatchObject({ status: "refused" });
    expect(
      store.versions.filter((summary) => summary === "Built day 1"),
    ).toHaveLength(1);
  });

  it("needs the first step of the brief", async () => {
    mocks.getTrip.mockResolvedValue(
      trip({ facts: { ...trip().facts, cities: [] } }),
    );
    expect(await build(true)).toMatchObject({
      status: "refused",
      message:
        "I need the first step of the brief before I can build the trip.",
    });
    expect(store.build).toBeNull();
  });

  it("answers not found or archived without building", async () => {
    mocks.getTrip.mockResolvedValueOnce(null);
    expect(await build(true)).toEqual({ status: "not_found" });
    mocks.getTrip.mockResolvedValue(trip({ archived: true }));
    mocks.findEditable.mockResolvedValue("archived");
    expect(await build(true)).toEqual({ status: "archived" });
    expect(mocks.gatherSights).not.toHaveBeenCalled();
    expect(store.versions).toEqual([]);
  });
});

describe("what a build leaves alone", () => {
  it("fills only open slots: the traveller's own picks stay where they are", async () => {
    store.state = emptyState({
      picks: { "d1-morning": { placeId: "park-2", minutes: 45 } },
    });
    await buildAll();
    expect(picks()["d1-morning"]).toEqual({ placeId: "park-2", minutes: 45 });
    expect(progress().built["d1-morning"]).toBeUndefined();
    expect((store.state as PlanState).shelf).toEqual([]);
  });

  it("does not fill again on a second build, and keeps what it knows it built", async () => {
    await buildAll();
    const after = structuredClone(store.state);
    const versions = store.versions.length;
    const steps = await buildAll();
    expect(steps.every((step) => step.filled === 0)).toBe(true);
    expect(store.state).toEqual(after);
    expect(store.versions).toHaveLength(versions);
    expect(Object.keys(progress().built)).toHaveLength(
      Object.keys(picks()).length,
    );
  });

  it("leaves a slot the traveller filled while the day was being worked out", async () => {
    store.meanwhile = () => {
      store.state = emptyState({
        picks: { "d1-morning": { placeId: "sight-2", minutes: null } },
      });
    };
    await build(true);
    expect(picks()["d1-morning"].placeId).toBe("sight-2");
    expect(progress().built["d1-morning"]).toBeUndefined();
    expect((store.state as PlanState).shelf).toEqual([]);
  });

  it("never moves or removes what is already decided", async () => {
    const booked: CommitmentDto = {
      id: "c-1",
      kind: "RESERVATION",
      title: "teamLab Planets",
      date: "2027-05-10",
      startTime: "10:00",
      endDate: null,
      endTime: "12:00",
      reference: null,
      note: null,
      transport: null,
    };
    mocks.getTrip.mockResolvedValue(trip({ commitments: [booked] }));
    const { buildPlanView } = await import("@/features/itinerary");
    await buildAll();
    const view = buildPlanView(
      store.state as PlanState,
      {
        facts: trip().facts,
        commitments: [booked],
        places: Object.fromEntries(store.places.map((item) => [item.id, item])),
      } as never,
    );
    const day1 = view.days[0].entries;
    expect(day1.find((entry) => entry.type === "commitment")).toMatchObject({
      commitmentId: "c-1",
      start: "10:00",
    });
    // Nothing the build placed breaks a rule against it.
    expect(
      day1
        .flatMap((entry) => (entry.type === "place" ? entry.flags : []))
        .filter((flag) => flag.rule !== "hours-unknown"),
    ).toEqual([]);
  });
});

describe("the rules a build keeps", () => {
  it("never takes a place known to be closed at the slot's time", async () => {
    // 10 May 2027 is a Monday. Every museum here is closed on Mondays.
    const closedMondays = sights.map((item) =>
      item.kind === "museum"
        ? { ...item, openingHours: "Tu-Su 09:00-17:00" }
        : item,
    );
    mocks.listSights.mockResolvedValue(closedMondays);
    store.places = [...closedMondays, ...food];
    await build(true);
    expect(
      Object.values(picks()).filter((pick) =>
        pick.placeId.startsWith("museum"),
      ),
    ).toEqual([]);
  });

  it("never takes a place to eat that does not serve a dietary rule of the traveller's", async () => {
    mocks.readProfile.mockResolvedValue({
      entries: [
        {
          topic: "dietary_rules",
          value: "vegetarian",
          sureness: "always",
          source: { type: "told" },
        },
      ],
    });
    const menu = food.map((item) =>
      item.id === "kissa" || item.id === "udon"
        ? { ...item, serves: ["vegetarian"] }
        : { ...item, servesNot: ["vegetarian"] },
    );
    mocks.listFoodNear.mockResolvedValue(menu);
    store.places = [...sights, ...menu];
    await buildAll();
    const meals = Object.entries(picks())
      .filter(([slot]) => /-(lunch|dinner)$/.test(slot))
      .map(([, pick]) => pick.placeId);
    expect(meals.length).toBeGreaterThan(0);
    expect(meals.every((id) => id === "kissa" || id === "udon")).toBe(true);
    // Two places cannot feed every meal: the rest stay open and are noted.
    expect(progress().empty.some((slot) => /-(lunch|dinner)$/.test(slot))).toBe(
      true,
    );
  });

  it("leaves a slot open and notes it when nothing fits", async () => {
    mocks.listFoodNear.mockResolvedValue([]);
    const steps = await buildAll();
    expect(
      Object.keys(picks()).some((slot) => /-(lunch|dinner)$/.test(slot)),
    ).toBe(false);
    expect(progress().empty).toContain("d1-lunch");
    expect(steps[0].filled).toBeGreaterThan(0);
  });

  it("uses saved places and says so when the provider cannot be reached", async () => {
    mocks.gatherSights.mockResolvedValue({ status: "unavailable" });
    await build(true);
    expect(progress().unreachable).toBe(true);
    expect(Object.keys(picks()).length).toBeGreaterThan(0);
  });

  it("starts from the pace the brief shows, a remembered one included", async () => {
    mocks.readProfile.mockResolvedValue({
      entries: [
        {
          topic: "pace",
          value: "packed",
          sureness: "think",
          source: { type: "told" },
        },
      ],
    });
    const packed = await build(true);
    expect((store.state as PlanState).pace).toBe("packed");

    store.state = emptyState();
    store.build = null;
    mocks.readProfile.mockResolvedValue({ entries: [] });
    const balanced = await build(true);
    expect((store.state as PlanState).pace).toBe("balanced");
    // A packed day has more slots to fill than a balanced one.
    if (packed.status === "ok" && balanced.status === "ok") {
      expect(packed.data.filled).toBeGreaterThan(balanced.data.filled);
    }
  });

  it("notes where the second choice was as good as the first", async () => {
    // Every sight here is alike and equally far: any two rank the same.
    await build(true);
    expect(progress().close.length).toBeGreaterThan(0);
    expect(progress().close.every((slot) => slot in progress().built)).toBe(
      true,
    );
  });
});
