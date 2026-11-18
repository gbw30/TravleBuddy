import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class UnauthorizedError extends Error {}
  class CitiesInUseError extends Error {}
  return {
    UnauthorizedError,
    CitiesInUseError,
    user: vi.fn(),
    runTripAction: vi.fn(),
    startTrip: vi.fn(),
    removeTrip: vi.fn(),
    findCities: vi.fn(),
    runPlanAction: vi.fn(),
    loadPlan: vi.fn(),
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
  CitiesInUseError: mocks.CitiesInUseError,
  removeTrip: mocks.removeTrip,
  renameTrip: vi.fn(),
  saveTripFacts: vi.fn(),
  setPlanFinished: vi.fn(),
  setTripArchived: vi.fn(),
  addCommitment: vi.fn(),
  updateCommitment: vi.fn(),
  removeCommitment: vi.fn(),
}));
vi.mock("@/features/places", () => ({ findCities: mocks.findCities }));
vi.mock("@/use-cases/plan", () => ({
  runPlanAction: mocks.runPlanAction,
  loadPlan: mocks.loadPlan,
}));

import { GET as cities } from "./places/cities/route";
import {
  DELETE as deleteCommitment,
  PATCH as patchCommitment,
} from "./trips/[tripId]/commitments/[commitmentId]/route";
import { POST as addCommitment } from "./trips/[tripId]/commitments/route";
import {
  DELETE as deleteTrip,
  PATCH as patchTrip,
} from "./trips/[tripId]/route";
import {
  GET as getPlan,
  POST as changePlan,
} from "./trips/[tripId]/plan/route";
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

  it("answers 409 when the cities are still used by the earlier planner", async () => {
    mocks.runTripAction.mockRejectedValue(new mocks.CitiesInUseError());
    const answer = await patchTrip(
      request("PATCH", { action: "facts", facts: { cities: [] }, ...control }),
      trip,
    );
    expect(answer.status).toBe(409);
    expect(await answer.json()).toEqual({ error: "cities_in_use" });
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
