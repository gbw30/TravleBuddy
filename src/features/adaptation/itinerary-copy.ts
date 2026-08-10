export type CopyOnWriteItem = {
  id: string;
  placeSuggestionId?: string | null;
  sortOrder: number;
};

export type CopyOnWriteDay<TItem extends CopyOnWriteItem = CopyOnWriteItem> = {
  id: string;
  dayNumber: number;
  items: readonly TItem[];
};

export type CopyOnWriteItinerary<TDay extends CopyOnWriteDay = CopyOnWriteDay> =
  {
    days: readonly TDay[];
  };

export type ItemReplacementProposal<TItinerary, TDay, TItem> =
  | {
      status: "PROPOSED";
      itinerary: TItinerary;
      affectedDay: TDay;
      replacedItem: TItem;
      replacementItem: TItem;
    }
  | {
      status: "TARGET_NOT_FOUND";
      itinerary: TItinerary;
      targetItemId: string;
    }
  | {
      status: "INVALID_REPLACEMENT";
      itinerary: TItinerary;
      reason:
        | "AMBIGUOUS_TARGET"
        | "ITEM_ID_CONFLICT"
        | "PLACE_ALREADY_SELECTED";
    };

/**
 * Produces an immutable structural-sharing proposal. The itinerary and affected
 * day get new objects; unaffected days and unaffected items retain their
 * references. Persistence can materialize those values as rows in a new
 * itinerary version without mutating or deleting the active version.
 */
export function createItemReplacementProposal<
  TItem extends CopyOnWriteItem,
  TDay extends CopyOnWriteDay<TItem>,
  TItinerary extends CopyOnWriteItinerary<TDay>,
>(
  current: TItinerary,
  input: {
    targetItemId: string;
    replacement: TItem;
  },
): ItemReplacementProposal<TItinerary, TDay, TItem> {
  const matches = current.days.flatMap((day) =>
    day.items
      .filter((item) => item.id === input.targetItemId)
      .map((item) => ({ day, item })),
  );

  if (matches.length === 0) {
    return {
      status: "TARGET_NOT_FOUND",
      itinerary: current,
      targetItemId: input.targetItemId,
    };
  }

  if (matches.length > 1) {
    return {
      status: "INVALID_REPLACEMENT",
      itinerary: current,
      reason: "AMBIGUOUS_TARGET",
    };
  }

  if (
    current.days.some((day) =>
      day.items.some((item) => item.id === input.replacement.id),
    )
  ) {
    return {
      status: "INVALID_REPLACEMENT",
      itinerary: current,
      reason: "ITEM_ID_CONFLICT",
    };
  }

  if (
    input.replacement.placeSuggestionId &&
    current.days.some((day) =>
      day.items.some(
        (item) =>
          item.id !== input.targetItemId &&
          item.placeSuggestionId === input.replacement.placeSuggestionId,
      ),
    )
  ) {
    return {
      status: "INVALID_REPLACEMENT",
      itinerary: current,
      reason: "PLACE_ALREADY_SELECTED",
    };
  }

  const { day: affectedDay, item: replacedItem } = matches[0];
  const replacementItem = {
    ...input.replacement,
    sortOrder: replacedItem.sortOrder,
  };
  const nextAffectedDay = {
    ...affectedDay,
    items: affectedDay.items.map((item) =>
      item.id === input.targetItemId ? replacementItem : item,
    ),
  } as TDay;
  const nextItinerary = {
    ...current,
    days: current.days.map((day) =>
      day.id === affectedDay.id ? nextAffectedDay : day,
    ),
  } as TItinerary;

  return {
    status: "PROPOSED",
    itinerary: nextItinerary,
    affectedDay: nextAffectedDay,
    replacedItem,
    replacementItem,
  };
}
