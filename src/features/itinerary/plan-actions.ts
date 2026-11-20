import type { PlanAction, PlanState, PlanView } from "./contracts";

// What each action does to the traveller's choices. Pure. An action changes
// only what it concerns (TB-ITN-15); the plan is laid out again afterwards.

/** An action the plan does not allow, with the reason to show (TB-ITN-10). */
export type Refused = { refused: string };
export type Applied = { state: PlanState; summary: string };

/** The actions that change the traveller's choices. */
export type Change = Exclude<PlanAction, { type: "undo" | "others" }>;

function slotIn(view: PlanView, slotId: string) {
  for (const day of view.days) {
    for (const entry of day.entries) {
      if ("slotId" in entry && entry.slotId === slotId) {
        return { day: day.day, entry };
      }
    }
  }
  return null;
}

const without = <T>(record: Record<string, T>, key: string) =>
  Object.fromEntries(Object.entries(record).filter(([k]) => k !== key));
const NOT_FREE =
  "That slot holds something already decided. Change it under Already decided.";
const NO_SLOT = "That slot is not in the plan any more.";

/**
 * Applies one action to the choices, given the plan as it is laid out now.
 * A move that breaks a rule is still applied: the traveller is in control,
 * and the new layout carries the flag. Only a move onto something already
 * decided is refused.
 */
export function applyPlanAction(
  state: PlanState,
  view: PlanView,
  action: Change,
): Applied | Refused {
  switch (action.type) {
    case "pick": {
      const target = slotIn(view, action.slotId);
      if (!target) return { refused: NO_SLOT };
      if (target.entry.type === "commitment") return { refused: NOT_FREE };

      const targetKind = target.entry.kind;
      const kindOf = (id: string) => {
        const held = slotIn(view, id)?.entry;
        return held && held.type !== "commitment" ? held.kind : null;
      };
      // A place sits in one slot only: picking it elsewhere moves it. The one
      // exception is breakfast, which may be chosen again on another day (TB-ITN-21).
      const elsewhere = Object.entries(state.picks).find(
        ([id, pick]) =>
          pick.placeId === action.placeId &&
          id !== action.slotId &&
          !(targetKind === "breakfast" && kindOf(id) === "breakfast"),
      );
      const picks = elsewhere
        ? without(state.picks, elsewhere[0])
        : state.picks;
      const replaced = state.picks[action.slotId];
      const shelf = state.shelf.filter((s) => s.placeId !== action.placeId);
      // The place it replaces is kept on the shelf, never dropped.
      if (replaced && replaced.placeId !== action.placeId) {
        shelf.push({
          placeId: replaced.placeId,
          reason: `Swapped out of day ${target.day}.`,
        });
      }
      return {
        state: {
          ...state,
          picks: {
            ...picks,
            [action.slotId]: { placeId: action.placeId, minutes: null },
          },
          shelf,
        },
        summary: `Picked a place for day ${target.day}`,
      };
    }

    case "save": {
      const held =
        state.shelf.some((s) => s.placeId === action.placeId) ||
        Object.values(state.picks).some((p) => p.placeId === action.placeId);
      return {
        state: held
          ? state
          : {
              ...state,
              shelf: [
                ...state.shelf,
                { placeId: action.placeId, reason: null },
              ],
            },
        summary: "Saved a place for later",
      };
    }

    case "unshelve":
      return {
        state: {
          ...state,
          shelf: state.shelf.filter((s) => s.placeId !== action.placeId),
        },
        summary: "Took a place off the shelf",
      };

    case "move": {
      const moving = state.picks[action.fromSlotId];
      const target = slotIn(view, action.toSlotId);
      if (!moving) return { refused: "There is nothing in that slot to move." };
      if (!target) return { refused: NO_SLOT };
      if (target.entry.type === "commitment") return { refused: NOT_FREE };
      if (action.fromSlotId === action.toSlotId) {
        return { state, summary: "Left the plan as it was" };
      }
      // Moving onto another pick trades places with it.
      const other = state.picks[action.toSlotId];
      const picks = { ...without(state.picks, action.fromSlotId) };
      picks[action.toSlotId] = moving;
      if (other) picks[action.fromSlotId] = other;
      return {
        state: { ...state, picks },
        summary: `Moved a place to day ${target.day}`,
      };
    }

    case "remove":
      if (!state.picks[action.slotId]) {
        return { refused: "There is nothing in that slot to remove." };
      }
      return {
        state: { ...state, picks: without(state.picks, action.slotId) },
        summary: "Removed a place",
      };

    case "minutes": {
      const pick = state.picks[action.slotId];
      if (!pick) return { refused: "There is nothing in that slot." };
      return {
        state: {
          ...state,
          picks: {
            ...state.picks,
            [action.slotId]: { ...pick, minutes: action.minutes },
          },
        },
        summary: "Changed a visit length",
      };
    }

    case "pace":
      return {
        state: { ...state, pace: action.pace },
        summary: `Set the pace to ${action.pace}`,
      };

    case "transfer":
      return {
        state: {
          ...state,
          transferTimes: {
            ...state.transferTimes,
            [String(action.day)]: action.start,
          },
        },
        summary: `Moved the transfer on day ${action.day}`,
      };
  }
}

/**
 * After a change, picks whose slot is gone from the new layout are moved to
 * the shelf with the reason, so the saved choices match what is shown (PRD 9.6).
 */
export function settle(state: PlanState, view: PlanView): PlanState {
  const live = new Set(
    view.days.flatMap((day) =>
      day.entries.flatMap((entry) =>
        entry.type === "place" ? [entry.slotId] : [],
      ),
    ),
  );
  if (view.blockers.length > 0) return state;
  return {
    ...state,
    picks: Object.fromEntries(
      Object.entries(state.picks).filter(([id]) => live.has(id)),
    ),
    shelf: view.shelf,
  };
}

/** The choices without a place that no longer exists: its slots reopen, and it leaves the shelf. */
export function forgetPlace(state: PlanState, placeId: string): PlanState {
  return {
    ...state,
    picks: Object.fromEntries(
      Object.entries(state.picks).filter(
        ([, pick]) => pick.placeId !== placeId,
      ),
    ),
    shelf: state.shelf.filter((item) => item.placeId !== placeId),
  };
}

/** Whether the choices hold the place in a slot or on the shelf. */
export function holdsPlace(state: PlanState, placeId: string): boolean {
  return (
    Object.values(state.picks).some((pick) => pick.placeId === placeId) ||
    state.shelf.some((item) => item.placeId === placeId)
  );
}
