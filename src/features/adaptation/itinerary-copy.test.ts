import { describe, expect, it } from "vitest";
import { createItemReplacementProposal } from "./itinerary-copy";

type TestItem = {
  id: string;
  placeSuggestionId: string;
  sortOrder: number;
  title: string;
  accepted: boolean;
};

function item(
  id: string,
  placeSuggestionId: string,
  sortOrder: number,
): TestItem {
  return {
    id,
    placeSuggestionId,
    sortOrder,
    title: id,
    accepted: true,
  };
}

function itinerary() {
  return {
    id: "itinerary-v1",
    version: 1,
    summary: "Original",
    days: [
      {
        id: "day-1",
        dayNumber: 1,
        notes: "Keep",
        items: [item("item-1", "place-1", 0), item("item-2", "place-2", 1)],
      },
      {
        id: "day-2",
        dayNumber: 2,
        notes: "Affected",
        items: [item("item-3", "place-3", 4), item("item-4", "place-4", 8)],
      },
      {
        id: "day-3",
        dayNumber: 3,
        notes: "Keep too",
        items: [item("item-5", "place-5", 0)],
      },
    ],
  };
}

describe("copy-on-write itinerary proposals", () => {
  it("replaces only the target while preserving unrelated references", () => {
    const current = itinerary();
    const replacement = item("item-v2-3", "place-replacement", 99);
    const result = createItemReplacementProposal(current, {
      targetItemId: "item-3",
      replacement,
    });

    expect(result.status).toBe("PROPOSED");

    if (result.status !== "PROPOSED") {
      throw new Error("Expected a replacement proposal.");
    }

    expect(result.itinerary).not.toBe(current);
    expect(result.itinerary.days).not.toBe(current.days);
    expect(result.itinerary.days[0]).toBe(current.days[0]);
    expect(result.itinerary.days[2]).toBe(current.days[2]);
    expect(result.itinerary.days[1]).not.toBe(current.days[1]);
    expect(result.itinerary.days[1].items[1]).toBe(current.days[1].items[1]);
    expect(result.replacementItem).toMatchObject({
      id: "item-v2-3",
      placeSuggestionId: "place-replacement",
      sortOrder: 4,
    });
    expect(result.itinerary.days[1].items.map(({ id }) => id)).toEqual([
      "item-v2-3",
      "item-4",
    ]);
  });

  it("does not mutate deeply frozen input or replacement values", () => {
    const current = itinerary();
    const original = structuredClone(current);
    const replacement = Object.freeze(
      item("item-v2-3", "place-replacement", 99),
    );

    for (const day of current.days) {
      for (const currentItem of day.items) {
        Object.freeze(currentItem);
      }
      Object.freeze(day.items);
      Object.freeze(day);
    }
    Object.freeze(current.days);
    Object.freeze(current);

    const result = createItemReplacementProposal(current, {
      targetItemId: "item-3",
      replacement,
    });

    expect(result.status).toBe("PROPOSED");
    expect(current).toEqual(original);
    expect(replacement.sortOrder).toBe(99);
  });

  it("returns the current itinerary when the target is absent", () => {
    const current = itinerary();

    expect(
      createItemReplacementProposal(current, {
        targetItemId: "missing",
        replacement: item("new-item", "new-place", 0),
      }),
    ).toEqual({
      status: "TARGET_NOT_FOUND",
      itinerary: current,
      targetItemId: "missing",
    });
  });

  it("rejects a replacement item ID that already exists", () => {
    const current = itinerary();

    expect(
      createItemReplacementProposal(current, {
        targetItemId: "item-3",
        replacement: item("item-1", "new-place", 0),
      }),
    ).toEqual({
      status: "INVALID_REPLACEMENT",
      itinerary: current,
      reason: "ITEM_ID_CONFLICT",
    });
  });

  it("rejects a place already selected elsewhere", () => {
    const current = itinerary();

    expect(
      createItemReplacementProposal(current, {
        targetItemId: "item-3",
        replacement: item("new-item", "place-5", 0),
      }),
    ).toEqual({
      status: "INVALID_REPLACEMENT",
      itinerary: current,
      reason: "PLACE_ALREADY_SELECTED",
    });
  });

  it("detects corrupt itineraries with duplicate target item IDs", () => {
    const current = itinerary();
    current.days[0].items[0] = {
      ...current.days[0].items[0],
      id: "item-3",
    };

    expect(
      createItemReplacementProposal(current, {
        targetItemId: "item-3",
        replacement: item("new-item", "new-place", 0),
      }),
    ).toEqual({
      status: "INVALID_REPLACEMENT",
      itinerary: current,
      reason: "AMBIGUOUS_TARGET",
    });
  });
});
