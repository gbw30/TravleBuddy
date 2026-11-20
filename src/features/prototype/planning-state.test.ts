import { describe, expect, it } from "vitest";

import {
  buildRest,
  changedSlots,
  currentProposal,
  initialState,
  moveItem,
  offeredCount,
  pickCard,
  placeFromShelf,
  removeItem,
  saveForLater,
  showOthers,
  undo,
} from "./planning-state";
import { sampleTrip } from "./sample-trip";
import type { SamplePlace, SampleTrip } from "./types";

const place = (id: string): SamplePlace => ({
  id,
  name: id,
  essentials: "",
  summary: "",
  reason: "",
  address: "",
  hours: null,
  priceLevel: null,
  rating: null,
  photo: null,
  photoCredit: null,
  links: null,
  hoursDoubt: null,
  visitMinutes: 60,
});

const ids = ["hotel", "p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"];
const t: SampleTrip = {
  title: "Fixture",
  days: [{ day: 1, city: "Tokyo", date: "Mon 10 May" }],
  slots: [
    { id: "a", day: 1, start: "09:00", label: "Hotel", travelIn: null },
    { id: "b", day: 1, start: "12:30", label: "Lunch", travelIn: null },
    { id: "c", day: 1, start: "15:00", label: "Afternoon", travelIn: null },
  ],
  fillOrder: ["b", "c"],
  places: Object.fromEntries(ids.map((id) => [id, place(id)])),
  proposals: {
    b: [
      ["p1", "p2", "p3"],
      ["p4", "p5"],
    ],
    c: [["p6", "p7", "p8"]],
  },
  initial: [
    { type: "item", slotId: "a", placeId: "hotel", locked: true, flag: null },
    { type: "open", slotId: "b" },
    { type: "open", slotId: "c" },
  ],
  commitments: [],
  moveFlags: { "p1@c": "Closed at this time" },
  agentLines: {},
};

describe("the prototype's sample places", () => {
  it("never assume a walk, and give a leg in the real cards' form", () => {
    const essentials = Object.values(sampleTrip.places).map(
      (place) => place.essentials,
    );
    expect(essentials.join(" ")).not.toMatch(/min walk|well-known/i);
    expect(sampleTrip.places["national-museum"].essentials).toBe(
      "Museum · about 15 min ride",
    );
  });
});

describe("prototype planning state", () => {
  it("starts on the first open slot in fill order with three cards", () => {
    const s = initialState(t);
    expect(s.activeSlotId).toBe("b");
    expect(currentProposal(t, s).map((p) => p.id)).toEqual(["p1", "p2", "p3"]);
  });

  it("picking fills the slot and moves to the next open slot", () => {
    const s = pickCard(t, initialState(t), "p2");
    expect(s.entries[1]).toEqual({
      type: "item",
      slotId: "b",
      placeId: "p2",
      locked: false,
      flag: null,
    });
    expect(s.activeSlotId).toBe("c");
  });

  it("showing others discards the set and can return fewer than three, then none", () => {
    const s1 = showOthers(t, initialState(t));
    expect(s1.discarded).toEqual(["p1", "p2", "p3"]);
    expect(currentProposal(t, s1).map((p) => p.id)).toEqual(["p4", "p5"]);
    expect(currentProposal(t, showOthers(t, s1))).toEqual([]);
  });

  it("saved places leave the proposal and join the shelf", () => {
    const s = saveForLater(initialState(t), "p1");
    expect(s.shelf).toEqual(["p1"]);
    expect(currentProposal(t, s).map((p) => p.id)).toEqual(["p2", "p3"]);
  });

  it("moving flags a broken rule and keeps the move", () => {
    const s = moveItem(t, pickCard(t, initialState(t), "p1"), "b", "c");
    expect(s.entries[2]).toMatchObject({
      type: "item",
      placeId: "p1",
      flag: "Closed at this time",
    });
    expect(s.entries[1]).toEqual({ type: "open", slotId: "b" });
  });

  it("refuses to move or remove a locked item", () => {
    const s = initialState(t);
    expect(moveItem(t, s, "a", "b")).toBe(s);
    expect(moveItem(t, s, "b", "a")).toBe(s);
    expect(removeItem(s, "a")).toBe(s);
  });

  it("places from the shelf into an open slot", () => {
    const s = placeFromShelf(t, saveForLater(initialState(t), "p1"), "p1", "c");
    expect(s.shelf).toEqual([]);
    expect(s.entries[2]).toMatchObject({
      placeId: "p1",
      flag: "Closed at this time",
    });
  });

  it("builds the rest with the top place per open slot", () => {
    const s = buildRest(t, initialState(t));
    expect(
      s.entries.map((e) => (e.type === "item" ? e.placeId : e.type)),
    ).toEqual(["hotel", "p1", "p6"]);
  });

  it("undo restores the previous state and is a no-op with no history", () => {
    const s0 = initialState(t);
    expect(undo(s0)).toBe(s0);
    expect(undo(pickCard(t, s0, "p2")).entries).toEqual(s0.entries);
  });

  it("counts itinerary slots changed since a snapshot, ignoring shelf and discards", () => {
    const s0 = initialState(t);
    expect(changedSlots(saveForLater(s0, "p1").entries, s0.entries)).toBe(0);
    expect(changedSlots(showOthers(t, s0).entries, s0.entries)).toBe(0);
    expect(changedSlots(pickCard(t, s0, "p2").entries, s0.entries)).toBe(1);
  });

  it("knows how many places a set offered before any were saved", () => {
    const s0 = initialState(t);
    expect(offeredCount(t, saveForLater(s0, "p1"))).toBe(3);
    expect(offeredCount(t, showOthers(t, s0))).toBe(2);
  });

  it("the sample trip meets its content limits", () => {
    const open = sampleTrip.initial.filter((e) => e.type === "open");
    expect(open.length).toBeGreaterThanOrEqual(5);
    expect(
      Object.values(sampleTrip.places).some((p) => p.name.length >= 45),
    ).toBe(true);
    expect(
      Object.values(sampleTrip.places).filter((p) => p.photo === null).length,
    ).toBeGreaterThanOrEqual(6);
    for (const e of open) {
      expect(sampleTrip.proposals[e.slotId].length).toBeGreaterThanOrEqual(2);
    }
    for (const id of Object.values(sampleTrip.proposals).flat(2)) {
      expect(sampleTrip.places[id], id).toBeDefined();
    }
    for (const e of sampleTrip.initial) {
      if (e.type === "item") expect(sampleTrip.places[e.placeId]).toBeDefined();
    }
    expect(sampleTrip.initial.map((e) => e.slotId)).toEqual(
      sampleTrip.slots.map((s) => s.id),
    );
  });
});
