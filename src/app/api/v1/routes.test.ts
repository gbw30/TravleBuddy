import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class UnauthorizedError extends Error {}
  return {
    UnauthorizedError,
    user: vi.fn(),
    runTripAction: vi.fn(),
    startTrip: vi.fn(),
    removeTrip: vi.fn(),
    findCities: vi.fn(),
    runPlanAction: vi.fn(),
    loadPlan: vi.fn(),
    findTripPlaces: vi.fn(),
    addTripPlace: vi.fn(),
    takeTurn: vi.fn(),
    loadConversation: vi.fn(),
    loadBrief: vi.fn(),
    buildNextDay: vi.fn(),
    saveBrief: vi.fn(),
    loadProfile: vi.fn(),
    tellProfile: vi.fn(),
    setDailyBudget: vi.fn(),
    changeEntry: vi.fn(),
    removeEntry: vi.fn(),
    removeNote: vi.fn(),
    forgetEverything: vi.fn(),
    learnQuietly: vi.fn(),
  };
});
vi.mock("@/lib/authorization", () => ({
  UnauthorizedError: mocks.UnauthorizedError,
  assertAuthenticatedApiUser: mocks.user,
}));
vi.mock("@/use-cases/trip-action", () => ({
  runTripAction: mocks.runTripAction,
}));
vi.mock("@/use-cases/start-trip", () => ({ startTrip: mocks.startTrip }));
vi.mock("@/features/trips", () => ({
  removeTrip: mocks.removeTrip,
  renameTrip: vi.fn(),
  saveTripFacts: vi.fn(),
  setPlanFinished: vi.fn(),
  setPlanningMode: vi.fn(),
  setTripArchived: vi.fn(),
  addCommitment: vi.fn(),
  updateCommitment: vi.fn(),
  removeCommitment: vi.fn(),
}));
vi.mock("@/features/places", () => ({ findCities: mocks.findCities }));
vi.mock("@/use-cases/plan", () => ({
  runPlanAction: mocks.runPlanAction,
  loadPlan: mocks.loadPlan,
  findTripPlaces: mocks.findTripPlaces,
  addTripPlace: mocks.addTripPlace,
}));

vi.mock("@/use-cases/conversation", () => ({
  takeTurn: mocks.takeTurn,
  loadConversation: mocks.loadConversation,
}));

vi.mock("@/use-cases/save-brief", () => ({
  loadBrief: mocks.loadBrief,
  saveBrief: mocks.saveBrief,
}));
vi.mock("@/use-cases/build", () => ({ buildNextDay: mocks.buildNextDay }));
vi.mock("@/use-cases/planning-mode", () => ({ changePlanningMode: vi.fn() }));
vi.mock("@/use-cases/learning", () => ({ learnQuietly: mocks.learnQuietly }));
vi.mock("@/use-cases/profile", () => ({
  loadProfile: mocks.loadProfile,
  tellProfile: mocks.tellProfile,
  setDailyBudget: mocks.setDailyBudget,
  changeEntry: mocks.changeEntry,
  removeEntry: mocks.removeEntry,
  removeNote: mocks.removeNote,
  forgetEverything: mocks.forgetEverything,
}));

import { GET as cities } from "./places/cities/route";
import {
  DELETE as deleteProfileEntry,
  PATCH as changeProfileEntry,
} from "./profile/entries/[entryId]/route";
import { PUT as setBudget } from "./profile/budget/route";
import { POST as tellProfile } from "./profile/entries/route";
import { DELETE as deleteProfileNote } from "./profile/notes/[noteId]/route";
import { DELETE as forgetProfile, GET as getProfile } from "./profile/route";
import {
  DELETE as deleteCommitment,
  PATCH as patchCommitment,
} from "./trips/[tripId]/commitments/[commitmentId]/route";
import { GET as getBrief, PUT as putBrief } from "./trips/[tripId]/brief/route";
import { POST as buildDay } from "./trips/[tripId]/build/route";
import { POST as addCommitment } from "./trips/[tripId]/commitments/route";
import {
  GET as getConversation,
  POST as takeTurn,
} from "./trips/[tripId]/conversation/route";
import {
  DELETE as deleteTrip,
  PATCH as patchTrip,
} from "./trips/[tripId]/route";
import {
  GET as getPlan,
  POST as changePlan,
} from "./trips/[tripId]/plan/route";
import {
  GET as findPlaces,
  POST as addPlace,
} from "./trips/[tripId]/places/route";
import { POST as createTrip } from "./trips/route";

const control = {
  operationId: "3f0f0d4c-6f0e-4c58-9d3e-6a3f1f2b7c11",
  expectedRevision: 2,
};
const request = (method: string, body?: unknown) =>
  new Request("http://localhost/api/v1/x", {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const trip = { params: Promise.resolve({ tripId: "trip-1" }) };
const commitment = {
  params: Promise.resolve({ tripId: "trip-1", commitmentId: "c-1" }),
};
const ticket = {
  mode: "FLIGHT",
  from: "New York",
  to: "Tokyo",
  departDate: "2027-05-09",
  departTime: "11:30",
  arriveDate: "2027-05-10",
  arriveTime: "14:35",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue("user-1");
  mocks.runTripAction.mockResolvedValue({
    status: "ok",
    data: {},
    revision: 3,
  });
});

describe("signed out", () => {
  it("answers 401 on every route and does nothing", async () => {
    mocks.user.mockRejectedValue(new mocks.UnauthorizedError());
    const answers = await Promise.all([
      createTrip(
        request("POST", { tickets: [], planningMode: "GUIDED" }),
        undefined,
      ),
      patchTrip(request("PATCH", { action: "archive", ...control }), trip),
      deleteTrip(request("DELETE"), trip),
      addCommitment(request("POST", {}), trip),
      patchCommitment(request("PATCH", {}), commitment),
      deleteCommitment(request("DELETE", control), commitment),
      cities(
        new Request("http://localhost/api/v1/places/cities?q=tokyo"),
        undefined,
      ),
    ]);
    expect(answers.map((answer) => answer.status)).toEqual(Array(7).fill(401));
    expect(mocks.startTrip).not.toHaveBeenCalled();
    expect(mocks.runTripAction).not.toHaveBeenCalled();
    expect(mocks.removeTrip).not.toHaveBeenCalled();
    expect(mocks.findCities).not.toHaveBeenCalled();
  });
});

describe("POST /api/v1/trips", () => {
  it("starts a trip for the signed-in traveller", async () => {
    mocks.startTrip.mockResolvedValue({ id: "trip-9" });

    const answer = await createTrip(
      request("POST", { tickets: [ticket], planningMode: "QUICK" }),
      undefined,
    );

    expect(answer.status).toBe(201);
    expect(await answer.json()).toEqual({ trip: { id: "trip-9" } });
    expect(mocks.startTrip).toHaveBeenCalledWith("user-1", {
      tickets: [{ ...ticket, reference: null }],
      planningMode: "QUICK",
    });
  });

  it("answers 422 for a body it cannot read or does not accept", async () => {
    const bad = [
      request("POST", {
        tickets: [{ ...ticket, departTime: "25:00" }],
        planningMode: "GUIDED",
      }),
      request("POST", { tickets: [] }),
      new Request("http://localhost/api/v1/trips", {
        method: "POST",
        body: "{not json",
      }),
    ];
    for (const item of bad) {
      const answer = await createTrip(item, undefined);
      expect(answer.status).toBe(422);
      expect((await answer.json()).error).toBe("invalid_request");
    }
    expect(mocks.startTrip).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/v1/trips/{tripId}", () => {
  it("runs a rename as one replay-safe action, without the control fields in the request", async () => {
    const answer = await patchTrip(
      request("PATCH", {
        action: "rename",
        title: " Tokyo in May ",
        ...control,
      }),
      trip,
    );

    expect(answer.status).toBe(200);
    expect(await answer.json()).toEqual({ data: {}, revision: 3 });
    expect(mocks.runTripAction).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        tripId: "trip-1",
        kind: "trip_rename",
        control,
        request: { action: "rename", title: "Tokyo in May" },
      }),
    );
  });

  it.each([
    ["facts", { facts: { adults: 2 } }, "trip_facts_save"],
    ["archive", {}, "trip_archive"],
    ["restore", {}, "trip_restore"],
    ["finish", {}, "trip_plan_finish"],
    ["reopen", {}, "trip_plan_reopen"],
    ["mode", { planningMode: "QUICK" }, "trip_mode_set"],
  ])("records %s under its own kind", async (action, extra, kind) => {
    await patchTrip(request("PATCH", { action, ...extra, ...control }), trip);
    expect(mocks.runTripAction).toHaveBeenCalledWith(
      expect.objectContaining({ kind }),
    );
  });

  it("answers 422 without an operation id and expected revision", async () => {
    const answer = await patchTrip(
      request("PATCH", { action: "rename", title: "Tokyo" }),
      trip,
    );
    expect(answer.status).toBe(422);
    expect(mocks.runTripAction).not.toHaveBeenCalled();
  });

  it.each([
    ["not_found", 404, "not_found"],
    ["archived", 409, "archived"],
    ["stale", 409, "stale_revision"],
    ["conflict", 409, "operation_id_conflict"],
  ])("answers a %s outcome as %i", async (status, code, error) => {
    mocks.runTripAction.mockResolvedValue({ status });
    const answer = await patchTrip(
      request("PATCH", { action: "finish", ...control }),
      trip,
    );
    expect(answer.status).toBe(code);
    expect(await answer.json()).toEqual({ error });
  });

  it("treats a repeated archive of an archived trip as done", async () => {
    mocks.runTripAction.mockResolvedValue({ status: "archived" });
    const answer = await patchTrip(
      request("PATCH", { action: "archive", ...control }),
      trip,
    );
    expect(answer.status).toBe(200);
  });

  it("answers 500 without details for an unexpected failure", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.runTripAction.mockRejectedValue(new Error("secret database detail"));
    const answer = await patchTrip(
      request("PATCH", { action: "finish", ...control }),
      trip,
    );
    expect(answer.status).toBe(500);
    expect(await answer.text()).not.toContain("secret");
    log.mockRestore();
  });
});

describe("what finished trips teach", () => {
  it("is brought up to date when a plan is finished or reopened, and not when the change did not go through", async () => {
    mocks.runTripAction.mockResolvedValue({
      status: "ok",
      data: { finished: true },
      revision: 3,
    });
    for (const action of ["finish", "reopen"]) {
      await patchTrip(request("PATCH", { action, ...control }), trip);
    }
    expect(mocks.learnQuietly).toHaveBeenCalledTimes(2);
    expect(mocks.learnQuietly).toHaveBeenCalledWith("user-1");

    mocks.learnQuietly.mockClear();
    mocks.runTripAction.mockResolvedValue({ status: "stale" });
    await patchTrip(request("PATCH", { action: "finish", ...control }), trip);
    mocks.runTripAction.mockResolvedValue({
      status: "ok",
      data: { title: "x" },
      revision: 4,
    });
    await patchTrip(
      request("PATCH", { action: "rename", title: "x", ...control }),
      trip,
    );
    expect(mocks.learnQuietly).not.toHaveBeenCalled();
  });

  it("is brought up to date when a trip is deleted, and not when nothing was", async () => {
    mocks.removeTrip.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await deleteTrip(request("DELETE"), trip);
    expect(mocks.learnQuietly).toHaveBeenCalledTimes(1);
    await deleteTrip(request("DELETE"), trip);
    expect(mocks.learnQuietly).toHaveBeenCalledTimes(1);
  });
});

describe("DELETE /api/v1/trips/{tripId}", () => {
  it("answers 204 when deleted and 404 when the trip is not the traveller's", async () => {
    mocks.removeTrip.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect((await deleteTrip(request("DELETE"), trip)).status).toBe(204);
    expect((await deleteTrip(request("DELETE"), trip)).status).toBe(404);
    expect(mocks.removeTrip).toHaveBeenCalledWith("user-1", "trip-1");
  });
});

describe("commitments", () => {
  const body = {
    commitment: {
      kind: "RESERVATION",
      title: "Dinner",
      date: "2027-05-11",
      startTime: "19:00",
    },
    ...control,
  };

  it("adds one and answers 201 with the list and its clashes", async () => {
    mocks.runTripAction.mockResolvedValue({
      status: "ok",
      data: { commitments: [], clashes: [] },
      revision: 3,
    });
    const answer = await addCommitment(request("POST", body), trip);
    expect(answer.status).toBe(201);
    expect(mocks.runTripAction).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "commitment_add", control }),
    );
  });

  it("answers 422 for a time without a date, and when the trip holds too many", async () => {
    const invalid = await addCommitment(
      request("POST", {
        commitment: { kind: "OTHER", title: "x", startTime: "19:00" },
        ...control,
      }),
      trip,
    );
    expect(invalid.status).toBe(422);

    mocks.runTripAction.mockResolvedValue({ status: "too_many" });
    expect((await addCommitment(request("POST", body), trip)).status).toBe(422);
  });

  it("updates and removes by id, each as its own kind", async () => {
    await patchCommitment(request("PATCH", body), commitment);
    await deleteCommitment(request("DELETE", control), commitment);
    expect(
      mocks.runTripAction.mock.calls.map(([input]) => [
        input.kind,
        input.request.commitmentId,
      ]),
    ).toEqual([
      ["commitment_update", "c-1"],
      ["commitment_remove", "c-1"],
    ]);
  });

  it("refuses a removal that does not say which revision it saw", async () => {
    const answer = await deleteCommitment(request("DELETE"), commitment);
    expect(answer.status).toBe(422);
    expect(mocks.runTripAction).not.toHaveBeenCalled();
  });
});

describe("GET /api/v1/places/cities", () => {
  const search = (q: string) =>
    cities(
      new Request(`http://localhost/api/v1/places/cities?q=${q}`),
      undefined,
    );

  it("answers the matching cities", async () => {
    mocks.findCities.mockResolvedValue({
      status: "ok",
      cities: [{ name: "Tokyo" }],
    });
    const answer = await search("tokyo");
    expect(await answer.json()).toEqual({ cities: [{ name: "Tokyo" }] });
    expect(mocks.findCities).toHaveBeenCalledWith("tokyo");
  });

  it("answers 503 when the lookup cannot be reached", async () => {
    mocks.findCities.mockResolvedValue({ status: "unavailable" });
    const answer = await search("tokyo");
    expect(answer.status).toBe(503);
    expect(await answer.json()).toEqual({ error: "lookup_unavailable" });
  });
});

describe("the plan", () => {
  const plan = { view: { days: [] }, places: {}, canUndo: false };
  const pick = { type: "pick", slotId: "d2-morning", placeId: "p1" };

  it("answers the plan, or 404 when the trip is not the traveller's", async () => {
    mocks.loadPlan.mockResolvedValueOnce(plan).mockResolvedValueOnce(null);
    const found = await getPlan(request("GET"), trip);
    expect(await found.json()).toEqual({ plan });
    expect((await getPlan(request("GET"), trip)).status).toBe(404);
    expect(mocks.loadPlan).toHaveBeenCalledWith("user-1", "trip-1", undefined);
  });

  it("applies one action and answers the plan as it stands afterwards", async () => {
    mocks.runPlanAction.mockResolvedValue({
      status: "ok",
      data: { summary: "Picked" },
      revision: 5,
    });
    mocks.loadPlan.mockResolvedValue(plan);

    const answer = await changePlan(
      request("POST", { action: pick, ...control }),
      trip,
    );

    expect(answer.status).toBe(200);
    expect(await answer.json()).toEqual({
      data: { summary: "Picked", plan },
      revision: 5,
    });
    expect(mocks.runPlanAction).toHaveBeenCalledWith({
      userId: "user-1",
      tripId: "trip-1",
      control,
      action: pick,
    });
  });

  it("answers 409 with the reason when the rules refuse the action", async () => {
    mocks.runPlanAction.mockResolvedValue({
      status: "refused",
      message: "That slot holds something already decided.",
    });
    const answer = await changePlan(
      request("POST", {
        action: {
          type: "move",
          fromSlotId: "d1-morning",
          toSlotId: "d2-dinner",
        },
        ...control,
      }),
      trip,
    );
    expect(answer.status).toBe(409);
    expect(await answer.json()).toEqual({
      error: "refused",
      message: "That slot holds something already decided.",
    });
    expect(mocks.loadPlan).not.toHaveBeenCalled();
  });

  it("answers 422 for an action it does not know or a missing revision", async () => {
    const bad = [
      { action: { type: "explode" }, ...control },
      {
        action: { type: "pick", slotId: "nowhere", placeId: "p1" },
        ...control,
      },
      { action: pick },
    ];
    for (const body of bad) {
      expect((await changePlan(request("POST", body), trip)).status).toBe(422);
    }
    expect(mocks.runPlanAction).not.toHaveBeenCalled();
  });

  it("answers 401 signed out", async () => {
    mocks.user.mockRejectedValue(new mocks.UnauthorizedError());
    expect((await getPlan(request("GET"), trip)).status).toBe(401);
    expect(
      (await changePlan(request("POST", { action: pick, ...control }), trip))
        .status,
    ).toBe(401);
  });
});

describe("a place of the traveller's own", () => {
  const search = (query: string) =>
    findPlaces(
      new Request(`http://localhost/api/v1/trips/trip-1/places?${query}`),
      trip,
    );

  it("searches by name in the city of the slot named", async () => {
    mocks.findTripPlaces.mockResolvedValue({
      status: "ok",
      cards: [{ placeId: "p9" }],
    });
    const answer = await search("q=Ichiran&slot=d2-lunch");
    expect(await answer.json()).toEqual({ cards: [{ placeId: "p9" }] });
    expect(mocks.findTripPlaces).toHaveBeenCalledWith(
      "user-1",
      "trip-1",
      "d2-lunch",
      "Ichiran",
    );
  });

  it("answers 404 for another traveller's trip and 503 when the lookup cannot answer", async () => {
    mocks.findTripPlaces.mockResolvedValueOnce({ status: "not_found" });
    expect((await search("q=x")).status).toBe(404);
    mocks.findTripPlaces.mockResolvedValueOnce({ status: "unavailable" });
    const down = await search("q=x");
    expect([down.status, (await down.json()).error]).toEqual([
      503,
      "lookup_unavailable",
    ]);
    mocks.findTripPlaces.mockResolvedValueOnce({ status: "capped" });
    expect((await (await search("q=x")).json()).error).toBe("lookup_capped");
  });

  it("adds a place by hand and answers its card", async () => {
    mocks.addTripPlace.mockResolvedValue({ placeId: "own" });
    const answer = await addPlace(
      request("POST", {
        name: " Aunt Keiko's flat ",
        kind: "sight",
        slotId: "d1-dinner",
      }),
      trip,
    );
    expect(answer.status).toBe(201);
    expect(mocks.addTripPlace).toHaveBeenCalledWith(
      "user-1",
      "trip-1",
      "d1-dinner",
      {
        name: "Aunt Keiko's flat",
        kind: "sight",
      },
    );
  });

  it("refuses a place with no name or an unknown kind", async () => {
    for (const body of [
      { name: "  ", kind: "sight" },
      { name: "x", kind: "spaceport" },
    ]) {
      expect((await addPlace(request("POST", body), trip)).status).toBe(422);
    }
    expect(mocks.addTripPlace).not.toHaveBeenCalled();
  });
});

describe("the conversation", () => {
  const conversation = {
    messages: [],
    waiting: null,
    needs: [],
    limited: true,
  };
  const turn = { type: "answer", topic: "pace", values: ["relaxed"] };

  it("answers the conversation, or 404 when the trip is not the traveller's", async () => {
    mocks.loadConversation
      .mockResolvedValueOnce(conversation)
      .mockResolvedValueOnce(null);
    const found = await getConversation(request("GET"), trip);
    expect(await found.json()).toEqual({ conversation });
    expect((await getConversation(request("GET"), trip)).status).toBe(404);
    expect(mocks.loadConversation).toHaveBeenCalledWith("user-1", "trip-1");
  });

  it("takes one turn and answers the conversation as it stands afterwards", async () => {
    mocks.takeTurn.mockResolvedValue({
      status: "ok",
      data: { focus: null },
      revision: 6,
    });
    mocks.loadConversation.mockResolvedValue(conversation);

    const answer = await takeTurn(request("POST", { turn, ...control }), trip);

    expect(answer.status).toBe(200);
    expect(await answer.json()).toEqual({
      data: { focus: null, conversation },
      revision: 6,
    });
    expect(mocks.takeTurn).toHaveBeenCalledWith({
      userId: "user-1",
      tripId: "trip-1",
      control,
      turn,
    });
  });

  it("accepts a yes to the agent's offer to remember something", async () => {
    mocks.takeTurn.mockResolvedValue({
      status: "ok",
      data: { focus: null, changed: true },
      revision: 8,
    });
    mocks.loadConversation.mockResolvedValue(conversation);
    const answer = await takeTurn(
      request("POST", { turn: { type: "remember" }, ...control }),
      trip,
    );
    expect(answer.status).toBe(200);
    expect(mocks.takeTurn).toHaveBeenCalledWith(
      expect.objectContaining({ turn: { type: "remember" } }),
    );
  });

  it("accepts an answer to why this trip is different", async () => {
    mocks.takeTurn.mockResolvedValue({
      status: "ok",
      data: { focus: null, changed: true },
      revision: 7,
    });
    mocks.loadConversation.mockResolvedValue(conversation);
    const different = { type: "answer", topic: "difference", values: ["Work"] };
    const answer = await takeTurn(
      request("POST", { turn: different, ...control }),
      trip,
    );
    expect(answer.status).toBe(200);
    expect(mocks.takeTurn).toHaveBeenCalledWith(
      expect.objectContaining({ turn: different }),
    );
  });

  it("answers 409 for a stale revision or a refused turn, without reading the thread", async () => {
    mocks.takeTurn
      .mockResolvedValueOnce({ status: "stale" })
      .mockResolvedValueOnce({
        status: "refused",
        message: "That is not one of the choices.",
      });
    const stale = await takeTurn(request("POST", { turn, ...control }), trip);
    const refused = await takeTurn(request("POST", { turn, ...control }), trip);
    expect(stale.status).toBe(409);
    expect(await refused.json()).toEqual({
      error: "refused",
      message: "That is not one of the choices.",
    });
    expect(mocks.loadConversation).not.toHaveBeenCalled();
  });

  it("answers 422 for a turn it does not know, an empty or overlong message, or a missing revision", async () => {
    for (const body of [
      { turn: { type: "shout", text: "hello" }, ...control },
      { turn: { type: "say", text: "   " }, ...control },
      { turn: { type: "say", text: "x".repeat(601) }, ...control },
      {
        turn: { type: "answer", topic: "weather", values: ["sunny"] },
        ...control,
      },
      { turn: { type: "answer", topic: "pace", values: [] }, ...control },
      { turn },
    ]) {
      expect((await takeTurn(request("POST", body), trip)).status).toBe(422);
    }
    expect(mocks.takeTurn).not.toHaveBeenCalled();
  });

  it("answers 401 signed out", async () => {
    mocks.user.mockRejectedValue(new mocks.UnauthorizedError());
    expect((await getConversation(request("GET"), trip)).status).toBe(401);
    expect(
      (await takeTurn(request("POST", { turn, ...control }), trip)).status,
    ).toBe(401);
    expect(mocks.takeTurn).not.toHaveBeenCalled();
  });
});

describe("the trip brief", () => {
  const brief = { tripId: "trip-1", revision: 3, canBuild: false };

  it("answers the brief, or 404 when the trip is not the traveller's", async () => {
    mocks.loadBrief.mockResolvedValueOnce(brief).mockResolvedValueOnce(null);
    expect(await (await getBrief(request("GET"), trip)).json()).toEqual({
      brief,
    });
    expect((await getBrief(request("GET"), trip)).status).toBe(404);
    expect(mocks.loadBrief).toHaveBeenCalledWith("user-1", "trip-1");
  });

  it("saves one step and answers the brief as it stands afterwards", async () => {
    mocks.saveBrief.mockResolvedValue({
      status: "ok",
      data: { saved: true },
      revision: 3,
    });
    mocks.loadBrief.mockResolvedValue(brief);
    const save = {
      facts: { adults: 2 },
      style: { pace: ["relaxed"] },
      said: "Quiet places",
    };

    const answer = await putBrief(
      request("PUT", { ...save, ...control }),
      trip,
    );

    expect(answer.status).toBe(200);
    expect(await answer.json()).toEqual({ data: { brief }, revision: 3 });
    expect(mocks.saveBrief).toHaveBeenCalledWith({
      userId: "user-1",
      tripId: "trip-1",
      control,
      save,
    });
  });

  it("answers 409 for a stale revision without reading the brief again", async () => {
    mocks.saveBrief.mockResolvedValue({ status: "stale" });
    const answer = await putBrief(
      request("PUT", { said: "Quiet", ...control }),
      trip,
    );
    expect(answer.status).toBe(409);
    expect(mocks.loadBrief).not.toHaveBeenCalled();
  });

  it("answers 422 for an answer the brief does not have, or a missing revision", async () => {
    for (const body of [
      { style: { pace: ["leisurely"] }, ...control },
      { style: { pace: ["relaxed", "packed"] }, ...control },
      { facts: { adults: 0 }, ...control },
      { said: "Quiet" },
    ]) {
      expect((await putBrief(request("PUT", body), trip)).status).toBe(422);
    }
    expect(mocks.saveBrief).not.toHaveBeenCalled();
  });

  it("answers 401 signed out", async () => {
    mocks.user.mockRejectedValue(new mocks.UnauthorizedError());
    expect((await getBrief(request("GET"), trip)).status).toBe(401);
    expect(
      (await putBrief(request("PUT", { said: "Quiet", ...control }), trip))
        .status,
    ).toBe(401);
    expect(mocks.saveBrief).not.toHaveBeenCalled();
  });
});

describe("building a trip", () => {
  const step = { day: 1, days: 3, filled: 4, done: false };

  it("builds the first day with start, the next without, and answers how far it is", async () => {
    mocks.buildNextDay.mockResolvedValue({
      status: "ok",
      data: step,
      revision: 5,
    });
    const first = await buildDay(
      request("POST", { start: true, ...control }),
      trip,
    );
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ data: step, revision: 5 });
    expect(mocks.buildNextDay).toHaveBeenLastCalledWith({
      userId: "user-1",
      tripId: "trip-1",
      control,
      start: true,
    });
    await buildDay(request("POST", control), trip);
    expect(mocks.buildNextDay).toHaveBeenLastCalledWith(
      expect.objectContaining({ start: false }),
    );
  });

  it("answers 409 with the reason when no build is in progress, and for a stale revision", async () => {
    mocks.buildNextDay.mockResolvedValueOnce({
      status: "refused",
      message: "No build is in progress.",
    });
    const refused = await buildDay(request("POST", control), trip);
    expect(refused.status).toBe(409);
    expect(await refused.json()).toEqual({
      error: "refused",
      message: "No build is in progress.",
    });
    mocks.buildNextDay.mockResolvedValueOnce({ status: "stale" });
    expect((await buildDay(request("POST", control), trip)).status).toBe(409);
  });

  it("answers 422 without a revision, 404 for another traveller's trip and 401 signed out", async () => {
    expect(
      (await buildDay(request("POST", { start: true }), trip)).status,
    ).toBe(422);
    mocks.buildNextDay.mockResolvedValueOnce({ status: "not_found" });
    expect((await buildDay(request("POST", control), trip)).status).toBe(404);
    mocks.user.mockRejectedValue(new mocks.UnauthorizedError());
    expect((await buildDay(request("POST", control), trip)).status).toBe(401);
    expect(mocks.buildNextDay).toHaveBeenCalledTimes(1);
  });
});

describe("the profile", () => {
  const profile = { revision: 3, entries: [], notes: [], topics: [] };
  const entry = { params: Promise.resolve({ entryId: "e-1" }) };
  const note = { params: Promise.resolve({ noteId: "n-1" }) };

  beforeEach(() => {
    mocks.loadProfile.mockResolvedValue(profile);
  });

  it("sets the daily budget and answers the entry with the profile", async () => {
    const saved = { id: "b1", topic: "budget", value: "90 EUR" };
    mocks.setDailyBudget.mockResolvedValue(saved);
    const answer = await setBudget(
      request("PUT", { amount: 90, currency: "EUR" }),
      undefined,
    );
    expect(answer.status).toBe(200);
    expect(await answer.json()).toEqual({ entry: saved, profile });
    expect(mocks.setDailyBudget).toHaveBeenCalledWith("user-1", {
      amount: 90,
      currency: "EUR",
    });
  });

  it("answers 422 for a budget that is no amount or a currency it does not know, and 401 signed out", async () => {
    for (const body of [
      { amount: 0, currency: "EUR" },
      { amount: 90.5, currency: "EUR" },
      { amount: 90, currency: "XYZ" },
      { amount: "90", currency: "EUR" },
      {},
    ]) {
      expect((await setBudget(request("PUT", body), undefined)).status).toBe(
        422,
      );
    }
    mocks.user.mockRejectedValue(new mocks.UnauthorizedError());
    expect(
      (
        await setBudget(
          request("PUT", { amount: 90, currency: "EUR" }),
          undefined,
        )
      ).status,
    ).toBe(401);
    expect(mocks.setDailyBudget).not.toHaveBeenCalled();
  });

  it("answers the signed-in traveller's profile, and forgets it when asked", async () => {
    expect(await (await getProfile(request("GET"), undefined)).json()).toEqual({
      profile,
    });
    expect(mocks.loadProfile).toHaveBeenCalledWith("user-1");
    const forgotten = await forgetProfile(request("DELETE"), undefined);
    expect(forgotten.status).toBe(200);
    expect(mocks.forgetEverything).toHaveBeenCalledWith("user-1");
  });

  it("files what the traveller says and answers 201 with where it went", async () => {
    const filed = { type: "note", note: { id: "n-1", text: "I hate queues" } };
    mocks.tellProfile.mockResolvedValue(filed);
    const answer = await tellProfile(
      request("POST", { text: " I hate queues ", hard: true }),
      undefined,
    );
    expect(answer.status).toBe(201);
    expect(await answer.json()).toEqual({ filed, profile });
    expect(mocks.tellProfile).toHaveBeenCalledWith(
      "user-1",
      "I hate queues",
      true,
    );
  });

  it("answers 422 for nothing said, or too much", async () => {
    for (const body of [{ text: "  " }, { text: "x".repeat(301) }, {}]) {
      expect((await tellProfile(request("POST", body), undefined)).status).toBe(
        422,
      );
    }
    expect(mocks.tellProfile).not.toHaveBeenCalled();
  });

  it("changes an entry, and answers 404 for one that is not the traveller's and 422 for a value the topic cannot hold", async () => {
    mocks.changeEntry
      .mockResolvedValueOnce({ id: "e-1", value: "packed" })
      .mockResolvedValueOnce("not_found")
      .mockResolvedValueOnce("invalid");
    const changed = await changeProfileEntry(
      request("PATCH", { value: "packed" }),
      entry,
    );
    expect(await changed.json()).toEqual({
      entry: { id: "e-1", value: "packed" },
      profile,
    });
    expect(mocks.changeEntry).toHaveBeenCalledWith("user-1", "e-1", "packed");
    expect(
      (await changeProfileEntry(request("PATCH", { value: "packed" }), entry))
        .status,
    ).toBe(404);
    const invalid = await changeProfileEntry(
      request("PATCH", { value: "warp" }),
      entry,
    );
    expect(invalid.status).toBe(422);
    expect(await invalid.json()).toEqual({ error: "invalid_value" });
    expect(
      (await changeProfileEntry(request("PATCH", { value: "" }), entry)).status,
    ).toBe(422);
  });

  it("removes an entry or a note, and answers 404 when it is not the traveller's", async () => {
    mocks.removeEntry
      .mockResolvedValueOnce({ deleted: true })
      .mockResolvedValueOnce("not_found");
    mocks.removeNote
      .mockResolvedValueOnce({ deleted: true })
      .mockResolvedValueOnce("not_found");
    expect((await deleteProfileEntry(request("DELETE"), entry)).status).toBe(
      200,
    );
    expect((await deleteProfileEntry(request("DELETE"), entry)).status).toBe(
      404,
    );
    expect((await deleteProfileNote(request("DELETE"), note)).status).toBe(200);
    expect((await deleteProfileNote(request("DELETE"), note)).status).toBe(404);
    expect(mocks.removeEntry).toHaveBeenCalledWith("user-1", "e-1");
    expect(mocks.removeNote).toHaveBeenCalledWith("user-1", "n-1");
  });

  it("answers 401 signed out on every profile route", async () => {
    mocks.user.mockRejectedValue(new mocks.UnauthorizedError());
    const answers = await Promise.all([
      getProfile(request("GET"), undefined),
      forgetProfile(request("DELETE"), undefined),
      tellProfile(request("POST", { text: "Relaxed" }), undefined),
      changeProfileEntry(request("PATCH", { value: "packed" }), entry),
      deleteProfileEntry(request("DELETE"), entry),
      deleteProfileNote(request("DELETE"), note),
    ]);
    expect(answers.map((answer) => answer.status)).toEqual(Array(6).fill(401));
    expect(mocks.loadProfile).not.toHaveBeenCalled();
    expect(mocks.forgetEverything).not.toHaveBeenCalled();
    expect(mocks.tellProfile).not.toHaveBeenCalled();
  });
});
