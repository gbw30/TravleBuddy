import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TripDetail, TripFacts } from "@/features/trips/contracts";

// The stores, the model and the ledger are stand-ins. The script, the rules
// and the decisions are the real ones.
const mocks = vi.hoisted(() => ({
  getTrip: vi.fn(),
  saveTripFacts: vi.fn(),
  addCommitment: vi.fn(),
  findEditable: vi.fn(),
  readTripTaste: vi.fn(),
  saveTripAnswer: vi.fn(),
  readProfile: vi.fn(),
  findCities: vi.fn(),
  planDays: vi.fn(),
  setPlanPace: vi.fn(),
  modelCall: vi.fn(),
  readUsage: vi.fn(),
  addUsage: vi.fn(),
  appendMessages: vi.fn(),
  readConversation: vi.fn(),
  readSkippedFacts: vi.fn(),
  skipFact: vi.fn(),
  lastQuestionTopic: vi.fn(),
  runTripAction: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: { name: "db" } }));
vi.mock("@/features/trips", () => ({
  getTrip: mocks.getTrip,
  saveTripFacts: mocks.saveTripFacts,
  addCommitment: mocks.addCommitment,
  findEditable: mocks.findEditable,
  todayIn: () => "2026-11-19",
}));
vi.mock("@/features/memory", async (actual) => ({
  ...(await actual<typeof import("@/features/memory")>()),
  readTripTaste: mocks.readTripTaste,
  saveTripAnswer: mocks.saveTripAnswer,
  readProfile: mocks.readProfile,
}));
vi.mock("@/features/places", () => ({ findCities: mocks.findCities }));
vi.mock("./plan", () => ({
  planDays: mocks.planDays,
  setPlanPace: mocks.setPlanPace,
}));
vi.mock("./trip-action", async (actual) => ({
  ...(await actual<typeof import("./trip-action")>()),
  runTripAction: mocks.runTripAction,
}));
vi.mock("@/features/conversation", async (actual) => ({
  ...(await actual<typeof import("@/features/conversation")>()),
  aiMode: () => (mocks.modelCall() ? "on" : "off"),
  modelCall: mocks.modelCall,
  readUsage: mocks.readUsage,
  addUsage: mocks.addUsage,
  appendMessages: mocks.appendMessages,
  readConversation: mocks.readConversation,
  readSkippedFacts: mocks.readSkippedFacts,
  skipFact: mocks.skipFact,
  lastQuestionTopic: mocks.lastQuestionTopic,
}));

import { loadConversation, takeTurn } from "./conversation";
import { Refusal } from "./trip-action";

const tokyo = {
  name: "Tokyo",
  region: null,
  country: "Japan",
  latitude: 35.68,
  longitude: 139.76,
  timeZone: "Asia/Tokyo",
};
const noFacts: TripFacts = {
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
};
/** Every fact known, so the script is on its taste questions. */
const allFacts: TripFacts = {
  ...noFacts,
  cities: [{ city: tokyo, nights: 4 }],
  startDate: "2027-05-10",
  endDate: "2027-05-14",
  datesFirmness: "FIXED",
  adults: 2,
  children: 0,
  budgetAmount: 300000,
  budgetCurrency: "JPY",
  budgetBasis: "TRIP",
  budgetFirmness: "FLEXIBLE",
  purpose: "Holiday",
};
const dinner = {
  id: "c1",
  kind: "RESERVATION" as const,
  title: "Dinner",
  date: "2027-05-13",
  startTime: "15:30",
  endDate: null,
  endTime: null,
  reference: null,
  note: null,
  transport: null,
};
const trip = (over: Partial<TripDetail> = {}) =>
  ({
    id: "trip-1",
    archived: false,
    facts: allFacts,
    commitments: [dinner],
    clashes: [],
    ...over,
  }) as TripDetail;

const control = {
  operationId: "3f0f0d4c-6f0e-4c58-9d3e-6a3f1f2b7c11",
  expectedRevision: 4,
};
const tx = { name: "tx" };
const say = (text: string) =>
  takeTurn({
    userId: "user-1",
    tripId: "trip-1",
    control,
    turn: { type: "say", text },
  });
/** A stand-in for the model that reports `intent`. */
const model = (intent: unknown, over: object = {}) =>
  vi.fn(async () => ({
    stop_reason: "end_turn",
    content: [{ type: "text", text: JSON.stringify({ intent }) }],
    usage: { input_tokens: 900, output_tokens: 40 },
    ...over,
  }));
/** The messages saved by the turn, as [from, text]. */
const saved = () =>
  (mocks.appendMessages.mock.calls.at(-1)?.[2] ?? []).map(
    (message: { from: string; body: { kind: string; text: string } }) => [
      message.from,
      message.body.kind,
      message.body.text,
    ],
  );

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getTrip.mockResolvedValue(trip());
  mocks.readTripTaste.mockResolvedValue({});
  mocks.readProfile.mockResolvedValue({ entries: [] });
  mocks.readSkippedFacts.mockResolvedValue([]);
  mocks.readConversation.mockResolvedValue([]);
  mocks.readUsage.mockResolvedValue({ inputTokens: 0, outputTokens: 0 });
  mocks.findEditable.mockResolvedValue(null);
  mocks.saveTripFacts.mockResolvedValue({ saved: true });
  mocks.lastQuestionTopic.mockResolvedValue(null);
  mocks.modelCall.mockReturnValue(null);
  // The ledger runs the change once and answers with the next revision.
  mocks.runTripAction.mockImplementation(async ({ apply }) => {
    const data = await apply(tx);
    if (typeof data === "string") return { status: data };
    if (data instanceof Refusal) {
      return { status: "refused", message: data.message };
    }
    return { status: "ok", data, revision: 5 };
  });
});

describe("reading the conversation", () => {
  it("answers the thread, the waiting question and what is still needed", async () => {
    mocks.getTrip.mockResolvedValue(trip({ facts: noFacts, commitments: [] }));
    mocks.readConversation.mockResolvedValue([{ id: "1" }]);
    expect(await loadConversation("user-1", "trip-1")).toMatchObject({
      messages: [{ id: "1" }],
      waiting: { topic: "where" },
      needs: ["where you are going", "when, or for how long"],
      limited: true,
    });
  });

  it("is null for a trip that is not the traveller's, and asks nothing of an archived one", async () => {
    mocks.getTrip
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(trip({ archived: true }));
    expect(await loadConversation("user-1", "trip-1")).toBeNull();
    expect((await loadConversation("user-1", "trip-1"))?.waiting).toBeNull();
  });

  it("is limited at the monthly cap even with the model switched on", async () => {
    mocks.modelCall.mockReturnValue(model({ type: "none" }));
    expect((await loadConversation("user-1", "trip-1"))?.limited).toBe(false);
    // Ten dollars of input tokens: the default cap.
    mocks.readUsage.mockResolvedValue({
      inputTokens: 100_000_000,
      outputTokens: 0,
    });
    expect((await loadConversation("user-1", "trip-1"))?.limited).toBe(true);
  });
});

describe("a traveller the site already knows", () => {
  const relaxed = {
    id: "e1",
    topic: "pace",
    value: "relaxed",
    sureness: "think",
    source: { type: "trip", tripId: "t0", tripTitle: "Lisbon in spring" },
  };

  it("is asked to confirm what is remembered, and yes saves it for this trip as told", async () => {
    mocks.readProfile.mockResolvedValue({ entries: [relaxed] });
    const conversation = await loadConversation("user-1", "trip-1");
    expect(conversation?.waiting).toMatchObject({
      topic: "pace",
      prompt:
        "Pace: from your trip “Lisbon in spring” I remember relaxed. Same for this trip?",
      remembered: ["relaxed"],
    });
    expect(mocks.readProfile).toHaveBeenCalledWith({ name: "db" }, "user-1");

    await takeTurn({
      userId: "user-1",
      tripId: "trip-1",
      control,
      turn: { type: "answer", topic: "pace", values: ["relaxed"] },
    });
    expect(mocks.saveTripAnswer).toHaveBeenCalledWith(tx, "trip-1", "pace", {
      values: ["relaxed"],
      source: "told",
    });
    expect(saved()[0]).toEqual([
      "agent",
      "question",
      "Pace: from your trip “Lisbon in spring” I remember relaxed. Same for this trip?",
    ]);
  });

  it("goes by the memory when the question is skipped, and by the typed yes", async () => {
    mocks.readProfile.mockResolvedValue({ entries: [relaxed] });
    await takeTurn({
      userId: "user-1",
      tripId: "trip-1",
      control,
      turn: { type: "skip", topic: "pace" },
    });
    expect(mocks.saveTripAnswer).toHaveBeenLastCalledWith(
      tx,
      "trip-1",
      "pace",
      {
        values: ["relaxed"],
        source: "default",
      },
    );
    await say("yes");
    expect(mocks.saveTripAnswer).toHaveBeenLastCalledWith(
      tx,
      "trip-1",
      "pace",
      {
        values: ["relaxed"],
        source: "told",
      },
    );
  });
});

describe("a tapped answer", () => {
  it("saves the taste, and the question, the answer and the reply in order, in one ledger action", async () => {
    const turn = {
      type: "answer" as const,
      topic: "pace" as const,
      values: ["relaxed"],
    };
    const outcome = await takeTurn({
      userId: "user-1",
      tripId: "trip-1",
      control,
      turn,
    });

    expect(outcome).toEqual({
      status: "ok",
      data: { focus: null, changed: true },
      revision: 5,
    });
    expect(mocks.runTripAction).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        tripId: "trip-1",
        kind: "conversation_turn",
        control,
        request: turn,
      }),
    );
    expect(mocks.saveTripAnswer).toHaveBeenCalledWith(tx, "trip-1", "pace", {
      values: ["relaxed"],
      source: "told",
    });
    expect(mocks.appendMessages).toHaveBeenCalledWith(
      tx,
      "trip-1",
      expect.any(Array),
    );
    expect(saved()).toEqual([
      ["agent", "question", "How packed should the days be?"],
      ["traveller", "text", "Relaxed"],
      ["agent", "text", "Noted: relaxed."],
    ]);
    expect(mocks.modelCall).not.toHaveBeenCalled();
  });

  it("sets the plan's pace from the pace answer, and says so only when it changed", async () => {
    const turn = {
      type: "answer" as const,
      topic: "pace" as const,
      values: ["relaxed"],
    };
    mocks.setPlanPace.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await takeTurn({ userId: "user-1", tripId: "trip-1", control, turn });
    expect(mocks.setPlanPace).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ id: "trip-1" }),
      "user-1",
      "relaxed",
    );
    expect(saved().at(-1)?.[2]).toBe(
      "Noted: relaxed. The plan now follows a relaxed pace.",
    );
    await takeTurn({ userId: "user-1", tripId: "trip-1", control, turn });
    expect(saved().at(-1)?.[2]).toBe("Noted: relaxed.");
  });

  it("does not save the question a second time", async () => {
    mocks.lastQuestionTopic.mockResolvedValue("pace");
    await takeTurn({
      userId: "user-1",
      tripId: "trip-1",
      control,
      turn: { type: "skip", topic: "pace" },
    });
    expect(mocks.saveTripAnswer).toHaveBeenCalledWith(tx, "trip-1", "pace", {
      values: ["balanced"],
      source: "default",
    });
    expect(saved()).toEqual([
      ["traveller", "text", "Skip"],
      ["agent", "text", "I will keep a balanced pace."],
    ]);
  });

  it("is refused when it answers a question that is not the one waiting, or with a value that is not a choice", async () => {
    const stale = await takeTurn({
      userId: "user-1",
      tripId: "trip-1",
      control,
      turn: { type: "answer", topic: "food", values: ["vegan"] },
    });
    const unknown = await takeTurn({
      userId: "user-1",
      tripId: "trip-1",
      control,
      turn: { type: "answer", topic: "pace", values: ["warp"] },
    });
    expect(stale).toMatchObject({ status: "refused" });
    expect(unknown).toEqual({
      status: "refused",
      message: "That is not one of the choices.",
    });
    expect(mocks.appendMessages).not.toHaveBeenCalled();
    expect(mocks.saveTripAnswer).not.toHaveBeenCalled();
  });

  it("lets the ledger answer a repeat of a turn that went through, even though its question has moved on", async () => {
    // The first attempt saved the pace; on the repeat the script waits on the next question.
    mocks.readTripTaste.mockResolvedValue({
      pace: { values: ["relaxed"], source: "told" },
    });
    mocks.runTripAction.mockResolvedValue({
      status: "ok",
      data: { focus: null, changed: true },
      revision: 5,
    });
    const repeat = await takeTurn({
      userId: "user-1",
      tripId: "trip-1",
      control,
      turn: { type: "answer", topic: "pace", values: ["relaxed"] },
    });
    expect(repeat).toEqual({
      status: "ok",
      data: { focus: null, changed: true },
      revision: 5,
    });
    expect(mocks.runTripAction).toHaveBeenCalledTimes(1);
  });

  it("remembers a skipped fact question", async () => {
    mocks.getTrip.mockResolvedValue(
      trip({ facts: { ...allFacts, purpose: null } }),
    );
    await takeTurn({
      userId: "user-1",
      tripId: "trip-1",
      control,
      turn: { type: "skip", topic: "purpose" },
    });
    expect(mocks.skipFact).toHaveBeenCalledWith(tx, "trip-1", "purpose");
    expect(saved().at(-1)).toEqual([
      "agent",
      "text",
      "I will plan it as a holiday.",
    ]);
  });

  it("points to Already decided when something is decided, and moves on", async () => {
    mocks.getTrip.mockResolvedValue(
      trip({ facts: { ...allFacts, purpose: null }, commitments: [] }),
    );
    await takeTurn({
      userId: "user-1",
      tripId: "trip-1",
      control,
      turn: { type: "answer", topic: "decided", values: ["something"] },
    });
    expect(mocks.skipFact).toHaveBeenCalledWith(tx, "trip-1", "decided");
    expect(saved().slice(1)).toEqual([
      ["traveller", "text", "Yes, I will add it"],
      ["agent", "text", "Add it under Already decided."],
    ]);
  });
});

describe("a typed message with the model off", () => {
  it("is read by the rules, saved through the trip's own checks, and says when places can be suggested", async () => {
    mocks.getTrip.mockResolvedValue(
      trip({ facts: { ...noFacts, cities: allFacts.cities }, commitments: [] }),
    );
    await say("10 May 2027 to 14 May 2027");
    expect(mocks.saveTripFacts).toHaveBeenCalledWith(tx, "user-1", "trip-1", {
      startDate: "2027-05-10",
      endDate: "2027-05-14",
    });
    expect(saved()).toEqual([
      ["agent", "question", expect.stringMatching(/^When are you going/)],
      ["traveller", "text", "10 May 2027 to 14 May 2027"],
      [
        "agent",
        "text",
        "Got it: Mon, 10 May 2027 to Fri, 14 May 2027. I know enough to start suggesting places for your days.",
      ],
    ]);
  });

  it("looks the typed city up before saving it, and saves nothing when it is not found", async () => {
    mocks.getTrip.mockResolvedValue(trip({ facts: noFacts, commitments: [] }));
    mocks.findCities.mockResolvedValueOnce({
      status: "ok",
      cities: [tokyo, { ...tokyo, name: "Tokyo Bay" }],
    });
    await say("Tokyo");
    expect(mocks.findCities).toHaveBeenCalledWith("Tokyo");
    expect(mocks.saveTripFacts).toHaveBeenCalledWith(tx, "user-1", "trip-1", {
      cities: [{ city: tokyo, nights: null }],
    });

    mocks.saveTripFacts.mockClear();
    mocks.findCities.mockResolvedValueOnce({ status: "ok", cities: [] });
    await say("Atlantis");
    expect(mocks.saveTripFacts).not.toHaveBeenCalled();
    expect(saved().at(-1)).toEqual([
      "agent",
      "text",
      'I could not find "Atlantis". Please pick it under the facts.',
    ]);
  });

  it("says it is in a limited mode when it cannot read the message, and changes nothing", async () => {
    await say("I booked teamLab for Thursday at 3");
    expect(mocks.addCommitment).not.toHaveBeenCalled();
    expect(mocks.saveTripAnswer).not.toHaveBeenCalled();
    const outcome = await say("still not readable");
    expect(outcome).toMatchObject({ data: { focus: null, changed: false } });
    expect(saved().at(-1)?.[2]).toMatch(
      /^I am in a limited mode and can only read simple answers\./,
    );
    expect(mocks.addUsage).not.toHaveBeenCalled();
  });
});

describe("a typed message with the model on", () => {
  it("adds a commitment told in conversation through the form's own function, and names a clash", async () => {
    const teamLab = {
      ...dinner,
      id: "c2",
      title: "teamLab Planets",
      startTime: "15:00",
    };
    mocks.modelCall.mockReturnValue(
      model({
        type: "commitment",
        kind: "RESERVATION",
        title: "teamLab Planets",
        date: "2027-05-13",
        startTime: "15:00",
      }),
    );
    mocks.addCommitment.mockResolvedValue({
      commitments: [dinner, teamLab],
      clashes: [{ first: "c1", second: "c2" }],
    });

    await say("I booked teamLab Planets for Thursday at 3");

    expect(mocks.addCommitment).toHaveBeenCalledWith(tx, "user-1", "trip-1", {
      kind: "RESERVATION",
      title: "teamLab Planets",
      date: "2027-05-13",
      startTime: "15:00",
      endDate: null,
      endTime: null,
      reference: null,
      note: null,
    });
    expect(saved().at(-1)?.[2]).toBe(
      "Added to what is already decided: teamLab Planets on Thu, 13 May 2027 at 15:00. It overlaps with something else you have decided. Have a look under Already decided.",
    );
    // The call is counted against this month's cap.
    expect(mocks.addUsage).toHaveBeenCalledWith(
      { name: "db" },
      expect.stringMatching(/^\d{4}-\d{2}$/),
      { inputTokens: 900, outputTokens: 40 },
    );
  });

  it("changes nothing when the model names a date that does not exist", async () => {
    mocks.modelCall.mockReturnValue(
      model({ type: "facts", startDate: "2027-02-30" }),
    );
    await say("we leave on the 30th of February");
    expect(mocks.saveTripFacts).not.toHaveBeenCalled();
    expect(saved().at(-1)?.[2]).toMatch(
      /^That does not fit: Not a real date\./,
    );
  });

  it("falls back to the rules when the reply does not fit, still counting its cost", async () => {
    mocks.modelCall.mockReturnValue(model({ type: "delete_everything" }));
    await say("relaxed");
    expect(mocks.saveTripAnswer).toHaveBeenCalledWith(tx, "trip-1", "pace", {
      values: ["relaxed"],
      source: "told",
    });
    expect(mocks.addUsage).toHaveBeenCalledTimes(1);
  });

  it("carries on in limited mode within the same turn when the call fails", async () => {
    mocks.modelCall.mockReturnValue(
      vi.fn(async () => Promise.reject(new Error("529 overloaded"))),
    );
    await say("relaxed");
    expect(mocks.saveTripAnswer).toHaveBeenCalledWith(tx, "trip-1", "pace", {
      values: ["relaxed"],
      source: "told",
    });
    expect(mocks.addUsage).not.toHaveBeenCalled();

    await say("something the rules cannot read");
    expect(saved().at(-1)?.[2]).toMatch(/^I am in a limited mode/);
  });

  it("does not call the model once the month's cap is reached", async () => {
    const call = model({ type: "taste", topic: "pace", values: ["packed"] });
    mocks.modelCall.mockReturnValue(call);
    mocks.readUsage.mockResolvedValue({
      inputTokens: 100_000_000,
      outputTokens: 0,
    });
    await say("relaxed");
    expect(call).not.toHaveBeenCalled();
    expect(mocks.saveTripAnswer).toHaveBeenCalledWith(tx, "trip-1", "pace", {
      values: ["relaxed"],
      source: "told",
    });
  });

  it("points the workspace at the day the traveller names", async () => {
    mocks.modelCall.mockReturnValue(model({ type: "go_to", day: 2 }));
    mocks.planDays.mockResolvedValue([
      { day: 1, date: "2027-05-10", city: "Tokyo", entries: [] },
      {
        day: 2,
        date: "2027-05-11",
        city: "Tokyo",
        entries: [
          {
            type: "open",
            slotId: "d2-morning",
            kind: "morning",
            start: "09:00",
            cityKey: "tokyo|japan",
          },
        ],
      },
    ]);
    expect(await say("let's do day 2 first")).toEqual({
      status: "ok",
      data: { focus: "d2-morning", changed: false },
      revision: 5,
    });
    expect(saved().at(-1)).toEqual(["agent", "text", "Day 2 it is."]);
  });

  it("does not replace the cities a trip already has", async () => {
    mocks.modelCall.mockReturnValue(
      model({ type: "facts", cities: ["Kyoto"] }),
    );
    await say("also Kyoto");
    expect(mocks.findCities).not.toHaveBeenCalled();
    expect(mocks.saveTripFacts).not.toHaveBeenCalled();
    expect(saved().at(-1)?.[2]).toBe(
      "The cities are already set. You can change them under the facts.",
    );
  });
});

describe("a turn on a trip that cannot change", () => {
  it("answers not found, archived, and whatever the trip's own check refuses", async () => {
    mocks.getTrip
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(trip({ archived: true }));
    expect(await say("relaxed")).toEqual({ status: "not_found" });
    expect(mocks.runTripAction).not.toHaveBeenCalled();

    // An archived trip is refused by the trip's own check, and nothing is read for it.
    mocks.modelCall.mockReturnValue(model({ type: "none" }));
    mocks.findEditable.mockResolvedValue("archived");
    expect(await say("relaxed")).toEqual({ status: "archived" });
    expect(mocks.readUsage).not.toHaveBeenCalled();

    mocks.findEditable.mockResolvedValue("not_found");
    expect(await say("relaxed")).toEqual({ status: "not_found" });
    expect(mocks.appendMessages).not.toHaveBeenCalled();
  });

  it("passes on the ledger's answer for a stale revision", async () => {
    mocks.runTripAction.mockResolvedValue({ status: "stale" });
    expect(await say("relaxed")).toEqual({ status: "stale" });
  });
});
