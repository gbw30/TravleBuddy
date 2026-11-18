import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TripDetail } from "@/features/trips/contracts";

// The stores, the plan and the ledger are stand-ins. The brief itself is real.
const mocks = vi.hoisted(() => ({
  getTrip: vi.fn(),
  findEditable: vi.fn(),
  saveTripFacts: vi.fn(),
  readProfile: vi.fn(),
  readTripTaste: vi.fn(),
  readTripSaid: vi.fn(),
  saveTripAnswer: vi.fn(),
  saveTripSaid: vi.fn(),
  setPlanPace: vi.fn(),
  runTripAction: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: { name: "db" } }));
vi.mock("@/features/trips", () => ({
  getTrip: mocks.getTrip,
  findEditable: mocks.findEditable,
  saveTripFacts: mocks.saveTripFacts,
}));
vi.mock("@/features/memory", async (actual) => ({
  ...(await actual<typeof import("@/features/memory")>()),
  readProfile: mocks.readProfile,
  readTripTaste: mocks.readTripTaste,
  readTripSaid: mocks.readTripSaid,
  saveTripAnswer: mocks.saveTripAnswer,
  saveTripSaid: mocks.saveTripSaid,
}));
vi.mock("./plan", () => ({ setPlanPace: mocks.setPlanPace }));
vi.mock("./trip-action", () => ({ runTripAction: mocks.runTripAction }));

import { loadBrief, saveBrief } from "./save-brief";

const trip = {
  id: "trip-1",
  revision: 4,
  title: "Tokyo in May",
  facts: {
    cities: [],
    startDate: null,
    endDate: null,
    lengthNights: null,
    timeOfYear: null,
    datesFirmness: null,
    adults: null,
    children: null,
    budgetAmount: null,
    budgetCurrency: null,
    budgetBasis: null,
    budgetFirmness: null,
    purpose: null,
  },
  commitments: [],
  clashes: [],
} as unknown as TripDetail;
const control = { operationId: "op-1", expectedRevision: 4 };
const tx = { name: "tx" };
/** Runs a save and returns what its action applied inside the ledger. */
const save = async (part: Parameters<typeof saveBrief>[0]["save"]) => {
  await saveBrief({ userId: "user-1", tripId: "trip-1", control, save: part });
  const action = mocks.runTripAction.mock.calls.at(-1)![0];
  return { action, applied: await action.apply(tx) };
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getTrip.mockResolvedValue(trip);
  mocks.findEditable.mockResolvedValue(null);
  mocks.saveTripFacts.mockResolvedValue({ saved: true });
  mocks.readProfile.mockResolvedValue({ entries: [] });
  mocks.readTripTaste.mockResolvedValue({});
  mocks.readTripSaid.mockResolvedValue(null);
  mocks.setPlanPace.mockResolvedValue(true);
});

describe("reading a trip's brief", () => {
  it("is nothing for a trip that is not the traveller's", async () => {
    mocks.getTrip.mockResolvedValue(null);
    expect(await loadBrief("user-1", "trip-9")).toBeNull();
    expect(mocks.readProfile).not.toHaveBeenCalled();
  });

  it("puts the trip, the profile, this trip's answers and the box together", async () => {
    mocks.readProfile.mockResolvedValue({
      entries: [
        {
          topic: "pace",
          value: "relaxed",
          sureness: "think",
          source: {
            type: "trip",
            tripId: "t0",
            tripTitle: "Lisbon, April 2027",
          },
        },
      ],
    });
    mocks.readTripTaste.mockResolvedValue({
      interests: { values: ["views"], source: "told" },
    });
    mocks.readTripSaid.mockResolvedValue("views and markets");

    const brief = await loadBrief("user-1", "trip-1");

    expect(mocks.getTrip).toHaveBeenCalledWith("user-1", "trip-1");
    expect(mocks.readProfile).toHaveBeenCalledWith({ name: "db" }, "user-1");
    expect(brief?.style[0]).toMatchObject({
      topic: "pace",
      values: ["relaxed"],
      from: "profile",
      source: "from your trip “Lisbon, April 2027”",
    });
    expect(brief?.style[2]).toMatchObject({ values: ["views"], from: "trip" });
    expect(
      brief?.said?.understood.map((item) => [item.value, item.inUse]),
    ).toEqual([
      ["views", true],
      ["markets", false],
    ]);
  });
});

describe("saving a step of the brief", () => {
  it("is one replay-safe action that identifies itself by what it carries", async () => {
    const part = {
      facts: { adults: 2 },
      style: { pace: ["relaxed"] },
      said: "Quiet",
    };
    const { action, applied } = await save(part);
    expect(action).toMatchObject({
      userId: "user-1",
      tripId: "trip-1",
      kind: "brief_save",
      control,
      request: part,
    });
    expect(applied).toEqual({ saved: true });
  });

  it("saves facts, each style answer and the box inside that action", async () => {
    await save({
      facts: { adults: 2 },
      style: { interests: ["museums", "views"], atmosphere: ["quiet"] },
      said: "We walk a lot",
    });
    expect(mocks.saveTripFacts).toHaveBeenCalledWith(tx, "user-1", "trip-1", {
      adults: 2,
    });
    expect(mocks.saveTripAnswer.mock.calls).toEqual([
      [
        tx,
        "trip-1",
        "interests",
        { values: ["museums", "views"], source: "told" },
        "brief",
      ],
      [
        tx,
        "trip-1",
        "atmosphere",
        { values: ["quiet"], source: "told" },
        "brief",
      ],
    ]);
    expect(mocks.saveTripSaid).toHaveBeenCalledWith(
      tx,
      "trip-1",
      "We walk a lot",
    );
  });

  it("changes only what the save names", async () => {
    await save({ style: { stay: ["hotel"] } });
    expect(mocks.saveTripFacts).not.toHaveBeenCalled();
    expect(mocks.saveTripSaid).not.toHaveBeenCalled();
    expect(mocks.setPlanPace).not.toHaveBeenCalled();
    await save({ said: null });
    expect(mocks.saveTripSaid).toHaveBeenCalledWith(tx, "trip-1", null);
  });

  it("takes this trip's own answer away when a topic is emptied", async () => {
    await save({ style: { pace: [] } });
    expect(mocks.saveTripAnswer).toHaveBeenCalledWith(
      tx,
      "trip-1",
      "pace",
      null,
      "brief",
    );
  });

  it("has the plan follow the pace the trip now goes by", async () => {
    // The answer just saved.
    mocks.readTripTaste.mockResolvedValue({
      pace: { values: ["packed"], source: "told" },
    });
    await save({ style: { pace: ["packed"] } });
    expect(mocks.readProfile).toHaveBeenCalledWith(tx, "user-1");
    expect(mocks.setPlanPace).toHaveBeenLastCalledWith(
      tx,
      trip,
      "user-1",
      "packed",
    );

    // Taken away again: the remembered pace applies.
    mocks.readTripTaste.mockResolvedValue({});
    mocks.readProfile.mockResolvedValue({
      entries: [
        {
          topic: "pace",
          value: "relaxed",
          sureness: "always",
          source: { type: "told" },
        },
      ],
    });
    await save({ style: { pace: [] } });
    expect(mocks.setPlanPace).toHaveBeenLastCalledWith(
      tx,
      trip,
      "user-1",
      "relaxed",
    );

    // Nothing answered and nothing remembered: the plan keeps its pace.
    mocks.setPlanPace.mockClear();
    mocks.readProfile.mockResolvedValue({ entries: [] });
    await save({ style: { pace: [] } });
    expect(mocks.setPlanPace).not.toHaveBeenCalled();
  });

  it("writes nothing to a trip that cannot be changed", async () => {
    mocks.findEditable.mockResolvedValue("archived");
    const { applied } = await save({
      facts: { adults: 2 },
      style: { pace: ["packed"] },
    });
    expect(applied).toBe("archived");
    expect(mocks.saveTripFacts).not.toHaveBeenCalled();
    expect(mocks.saveTripAnswer).not.toHaveBeenCalled();
  });

  it("passes on a refusal from the facts", async () => {
    mocks.saveTripFacts.mockResolvedValue("not_found");
    expect((await save({ facts: { adults: 2 } })).applied).toBe("not_found");
  });
});
