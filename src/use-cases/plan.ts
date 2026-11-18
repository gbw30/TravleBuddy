import {
  applyPlanAction,
  buildPlanView,
  provisionalStart,
  readPlanState,
  settle,
  undoPlan,
  writePlanVersion,
  type PlanContext,
} from "@/features/itinerary";
import type {
  PlanAction,
  PlanState,
  PlanView,
} from "@/features/itinerary/contracts";
import { getPlaces } from "@/features/places";
import type { PlaceDto } from "@/features/places/contracts";
import { findEditable, getTrip } from "@/features/trips";
import type { TripDetail } from "@/features/trips/contracts";
import { db } from "@/lib/db";

import { Refusal, runTripAction, type TripActionOutcome } from "./trip-action";

// Reading and changing a trip's plan spans three services: Trips holds the
// facts and commitments, Places the saved places, and Itinerary the choices
// and the rules that lay them out.

/** Everything the workspace screen needs to show a plan. */
export type PlanSnapshot = {
  view: PlanView;
  /** Every place the view and the shelf refer to, by id. */
  places: Record<string, PlaceDto>;
  canUndo: boolean;
};

const today = () => new Date().toISOString().slice(0, 10);

/** A trip with no dates is laid out from provisional ones (PRD 9.7). */
function withProvisionalStart(state: PlanState, trip: TripDetail): PlanState {
  if (trip.facts.startDate || state.provisionalStart) return state;
  return { ...state, provisionalStart: provisionalStart(trip.facts, today()) };
}

async function contextFor(
  trip: TripDetail,
  state: PlanState,
  userId: string,
  alsoPlaceIds: string[] = [],
): Promise<PlanContext> {
  const ids = [
    ...Object.values(state.picks).map((pick) => pick.placeId),
    ...state.shelf.map((item) => item.placeId),
    ...alsoPlaceIds,
  ];
  const places = await getPlaces([...new Set(ids)], userId);
  return {
    facts: trip.facts,
    commitments: trip.commitments,
    places: Object.fromEntries(places.map((place) => [place.id, place])),
  };
}

/** The plan as it stands, or null when the trip is not the traveller's. */
export async function loadPlan(
  userId: string,
  tripId: string,
): Promise<PlanSnapshot | null> {
  const trip = await getTrip(userId, tripId);
  if (!trip) return null;
  const saved = await readPlanState(db, tripId);
  const state = withProvisionalStart(saved.state, trip);
  const context = await contextFor(trip, state, userId);
  return {
    view: buildPlanView(state, context),
    places: context.places,
    canUndo: saved.canUndo,
  };
}

/**
 * One change to a plan, through the replay ledger. The plan is laid out
 * before and after: the action is checked against the first layout, and picks
 * the second has no slot for are moved to the shelf.
 */
export async function runPlanAction(input: {
  userId: string;
  tripId: string;
  control: { operationId: string; expectedRevision: number };
  action: PlanAction;
}): Promise<TripActionOutcome<{ summary: string }>> {
  const { userId, tripId, action } = input;
  const trip = await getTrip(userId, tripId);
  if (!trip) return { status: "not_found" };

  return runTripAction({
    userId,
    tripId,
    kind: `plan_${action.type}`,
    control: input.control,
    request: action,
    transactionOptions: { maxWait: 10_000, timeout: 20_000 },
    apply: async (tx) => {
      const refused = await findEditable(tx, userId, tripId);
      if (refused) return refused;

      if (action.type === "undo") {
        return (await undoPlan(tx, tripId))
          ? { summary: "Undid the last change" }
          : new Refusal("There is nothing to undo.");
      }

      const saved = await readPlanState(tx, tripId);
      const state = withProvisionalStart(saved.state, trip);
      const adding = "placeId" in action ? [action.placeId] : [];
      const context = await contextFor(trip, state, userId, adding);
      // Only a saved place the traveller may see can join a plan (TB-TRU-01).
      if (adding.some((id) => !context.places[id])) {
        return new Refusal("That place is not available.");
      }

      const applied = applyPlanAction(
        state,
        buildPlanView(state, context),
        action,
      );
      if ("refused" in applied) return new Refusal(applied.refused);
      const settled = settle(
        applied.state,
        buildPlanView(applied.state, context),
      );
      await writePlanVersion(tx, tripId, settled, applied.summary);
      return { summary: applied.summary };
    },
  });
}
