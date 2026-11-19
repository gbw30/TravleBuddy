import { describe, expect, it } from "vitest";

import type { PlaceDto } from "@/features/places/contracts";
import type { CommitmentDto } from "@/features/trips/contracts";

import { emptyPlanState, planActionSchema, type PlanState } from "./contracts";
import { buildPlanView, type PlanContext } from "./day-plan";
import { applyPlanAction, settle } from "./plan-actions";

const tokyo = {
  name: "Tokyo",
  region: null,
  country: "Japan",
  latitude: 35.6769,
  longitude: 139.7639,
  timeZone: "Asia/Tokyo",
};
const place = (id: string): PlaceDto => ({
  id,
  origin: "SAMPLE",
  name: id,
  kind: "museum",
  cityKey: "tokyo|japan",
  latitude: 35.7188,
  longitude: 139.7765,
  address: null,
  openingHours: "Mo-Su 09:00-18:00",
  notable: true,
  serves: [],
  servesNot: [],
  originRef: null,
  tags: {},
  lastEditedAt: null,
  fetchedAt: null,
  hoursDoubt: null,
});
const dinner: CommitmentDto = {
  id: "c1",
  kind: "RESERVATION",
  title: "Dinner at Den",
  date: "2027-05-11",
  startTime: null,
  endDate: null,
  endTime: null,
  reference: null,
  note: null,
  transport: null,
};
const context: PlanContext = {
  facts: {
    cities: [{ city: tokyo, nights: 2 }],
    startDate: "2027-05-10",
    endDate: "2027-05-12",
    lengthNights: null,
    timeOfYear: null,
  },
  commitments: [dinner],
  places: { a: place("a"), b: place("b"), c: place("c") },
};
const pick = (placeId: string, minutes: number | null = null) => ({
  placeId,
  minutes,
});
const state = (over: Partial<PlanState> = {}): PlanState => ({
  ...emptyPlanState,
  ...over,
});
const act = (s: PlanState, action: Parameters<typeof applyPlanAction>[2]) =>
  applyPlanAction(s, buildPlanView(s, context), action);
const done = (result: ReturnType<typeof act>) => {
  if ("refused" in result) throw new Error(`refused: ${result.refused}`);
  return result.state;
};

describe("picking", () => {
  it("puts a place in an open slot and changes nothing else", () => {
    const before = state({
      picks: { "d1-morning": pick("a") },
      shelf: [{ placeId: "c", reason: null }],
    });
    const after = done(
      act(before, { type: "pick", slotId: "d2-morning", placeId: "b" }),
    );
    expect(after).toEqual({
      ...before,
      picks: { "d1-morning": pick("a"), "d2-morning": pick("b") },
    });
  });

  it("takes a picked place off the shelf", () => {
    const after = done(
      act(state({ shelf: [{ placeId: "a", reason: null }] }), {
        type: "pick",
        slotId: "d2-morning",
        placeId: "a",
      }),
    );
    expect(after.shelf).toEqual([]);
  });

  it("keeps the place it replaces on the shelf", () => {
    const after = done(
      act(state({ picks: { "d2-morning": pick("a") } }), {
        type: "pick",
        slotId: "d2-morning",
        placeId: "b",
      }),
    );
    expect(after.picks).toEqual({ "d2-morning": pick("b") });
    expect(after.shelf).toEqual([
      { placeId: "a", reason: "Swapped out of day 2." },
    ]);
  });

  it("moves a place that is already in another slot, never doubling it", () => {
    const after = done(
      act(state({ picks: { "d1-morning": pick("a") } }), {
        type: "pick",
        slotId: "d2-afternoon",
        placeId: "a",
      }),
    );
    expect(after.picks).toEqual({ "d2-afternoon": pick("a") });
  });

  it("refuses a slot that holds something already decided, or that is not in the plan", () => {
    // The undated-time dinner booking holds day 2's dinner slot.
    expect(
      act(state(), { type: "pick", slotId: "d2-dinner", placeId: "a" }),
    ).toEqual({
      refused: expect.stringContaining("already decided"),
    });
    expect(
      act(state(), { type: "pick", slotId: "d9-morning", placeId: "a" }),
    ).toEqual({
      refused: expect.stringContaining("not in the plan"),
    });
  });
});

describe("the shelf", () => {
  it("saves a place once, and not while it is in the plan", () => {
    const saved = done(act(state(), { type: "save", placeId: "a" }));
    expect(saved.shelf).toEqual([{ placeId: "a", reason: null }]);
    expect(done(act(saved, { type: "save", placeId: "a" })).shelf).toHaveLength(
      1,
    );
    const picked = state({ picks: { "d1-morning": pick("a") } });
    expect(done(act(picked, { type: "save", placeId: "a" })).shelf).toEqual([]);
  });

  it("takes a place off again", () => {
    const after = done(
      act(state({ shelf: [{ placeId: "a", reason: null }] }), {
        type: "unshelve",
        placeId: "a",
      }),
    );
    expect(after.shelf).toEqual([]);
  });
});

describe("moving and removing", () => {
  const two = state({
    picks: { "d1-morning": pick("a", 45), "d2-morning": pick("b") },
  });

  it("moves a place to an open slot, keeping its visit length", () => {
    const after = done(
      act(two, {
        type: "move",
        fromSlotId: "d1-morning",
        toSlotId: "d3-morning",
      }),
    );
    expect(after.picks).toEqual({
      "d3-morning": pick("a", 45),
      "d2-morning": pick("b"),
    });
  });

  it("trades places when the target slot is taken", () => {
    const after = done(
      act(two, {
        type: "move",
        fromSlotId: "d1-morning",
        toSlotId: "d2-morning",
      }),
    );
    expect(after.picks).toEqual({
      "d2-morning": pick("a", 45),
      "d1-morning": pick("b"),
    });
  });

  it("refuses a move onto something already decided and leaves the plan as it was", () => {
    const result = act(two, {
      type: "move",
      fromSlotId: "d1-morning",
      toSlotId: "d2-dinner",
    });
    expect(result).toEqual({
      refused: expect.stringContaining("already decided"),
    });
  });

  it("refuses to move or remove from an empty slot", () => {
    expect(
      "refused" in
        act(two, {
          type: "move",
          fromSlotId: "d3-morning",
          toSlotId: "d1-lunch",
        }),
    ).toBe(true);
    expect(
      "refused" in act(two, { type: "remove", slotId: "d3-morning" }),
    ).toBe(true);
  });

  it("saves a move that breaks a rule, with the flag on the new layout", () => {
    // A museum in the dinner slot of day 1 ends after it closes at 18:00.
    const after = done(
      act(two, {
        type: "move",
        fromSlotId: "d2-morning",
        toSlotId: "d1-dinner",
      }),
    );
    const view = buildPlanView(after, context);
    const moved = view.days[0].entries.find(
      (entry) => entry.type === "place" && entry.slotId === "d1-dinner",
    );
    expect(moved).toMatchObject({ flags: [{ rule: "closed" }] });
  });

  it("removes one place and nothing else", () => {
    expect(
      done(act(two, { type: "remove", slotId: "d1-morning" })).picks,
    ).toEqual({ "d2-morning": pick("b") });
  });
});

describe("other changes", () => {
  it("sets a visit length and returns to the standard one", () => {
    const one = state({ picks: { "d1-morning": pick("a") } });
    const longer = done(
      act(one, { type: "minutes", slotId: "d1-morning", minutes: 180 }),
    );
    expect(longer.picks["d1-morning"].minutes).toBe(180);
    expect(
      done(
        act(longer, { type: "minutes", slotId: "d1-morning", minutes: null }),
      ).picks["d1-morning"].minutes,
    ).toBeNull();
  });

  it("changes the pace and moves the transfer time", () => {
    expect(done(act(state(), { type: "pace", pace: "relaxed" })).pace).toBe(
      "relaxed",
    );
    expect(
      done(act(state(), { type: "transfer", day: 3, start: "08:30" }))
        .transferTimes,
    ).toEqual({ "3": "08:30" });
  });

  it("moves picks to the shelf when the new layout has no slot for them", () => {
    // Packed has a second morning slot; relaxed does not.
    const packed = state({
      pace: "packed",
      picks: { "d2-morning": pick("a"), "d2-morning-2": pick("b") },
    });
    const relaxed = done(act(packed, { type: "pace", pace: "relaxed" }));
    const settled = settle(relaxed, buildPlanView(relaxed, context));
    expect(settled.picks).toEqual({ "d2-morning": pick("a") });
    expect(settled.shelf).toEqual([
      { placeId: "b", reason: "Its slot is no longer free in the plan." },
    ]);
  });
});

describe("planActionSchema", () => {
  it("accepts each action and refuses a malformed one", () => {
    const good = [
      { type: "pick", slotId: "d2-morning", placeId: "p1" },
      { type: "move", fromSlotId: "d1-morning", toSlotId: "d12-afternoon-2" },
      { type: "minutes", slotId: "d1-lunch", minutes: null },
      { type: "pace", pace: "packed" },
      { type: "transfer", day: 3, start: "08:30" },
      { type: "undo" },
    ];
    for (const action of good)
      expect(planActionSchema.safeParse(action).success, action.type).toBe(
        true,
      );
    const bad = [
      { type: "pick", slotId: "morning", placeId: "p1" },
      { type: "minutes", slotId: "d1-lunch", minutes: 5 },
      { type: "pace", pace: "frantic" },
      { type: "transfer", day: 3, start: "25:00" },
      { type: "explode" },
    ];
    for (const action of bad)
      expect(
        planActionSchema.safeParse(action).success,
        JSON.stringify(action),
      ).toBe(false);
  });
});
