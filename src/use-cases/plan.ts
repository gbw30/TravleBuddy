import {
  applyPlanAction,
  buildPlanView,
  kindSuitsSlot,
  provisionalStart,
  readPlanState,
  settle,
  undoPlan,
  writePlanVersion,
  type PlanContext,
} from "@/features/itinerary";
import type {
  PlanAction,
  PlanDay,
  PlanEntry,
  PlanState,
  PlanView,
} from "@/features/itinerary/contracts";
import {
  gatherFoodNear,
  gatherSights,
  getPlaces,
  listFoodNear,
  listSights,
  type GatherOutcome,
} from "@/features/places";
import { cityKeyOf, type PlaceDto } from "@/features/places/contracts";
import {
  proposeCards,
  readDiscards,
  recordCard,
  recordDiscards,
  recordPresented,
  toCard,
  type CardHistory,
} from "@/features/recommendations";
import {
  discardReason,
  type CardDto,
  type CardSet,
  type DiscardReason,
} from "@/features/recommendations/contracts";
import { findEditable, getTrip } from "@/features/trips";
import type { TripDetail } from "@/features/trips/contracts";
import { db } from "@/lib/db";

import { Refusal, runTripAction, type TripActionOutcome } from "./trip-action";

// Reading and changing a trip's plan spans four services: Trips holds the
// facts and commitments, Places the saved places, Itinerary the choices and
// the rules that lay them out, and Recommendations the cards.

/** Everything the workspace screen needs to show a plan. */
export type PlanSnapshot = {
  view: PlanView;
  /** A card for every place in the plan and on the shelf, by place id. */
  chosen: Record<string, CardDto>;
  /**
   * The cards for the slot in focus. `status` says whether places could be
   * gathered: when not, the cards come from saved places only and the screen
   * says so (TB-TRU-06, TB-SYS-11). Null when there is no slot to fill.
   */
  proposal: (CardSet & { status: GatherOutcome["status"] }) | null;
  canUndo: boolean;
};

type SlotEntry = Extract<PlanEntry, { type: "open" | "place" }>;

const today = () => new Date().toISOString().slice(0, 10);
const isSlot = (entry: PlanEntry): entry is SlotEntry =>
  entry.type === "open" || entry.type === "place";
const isMeal = (entry: SlotEntry) =>
  entry.kind === "lunch" || entry.kind === "dinner";

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

/**
 * The slot proposals are made for: the one asked for, or else the next to
 * fill. Sights and activities come before meals (PRD 7.5).
 */
function focusSlot(
  view: PlanView,
  wanted: string | undefined,
): { day: PlanDay; entry: SlotEntry } | null {
  const slots = view.days.flatMap((day) =>
    day.entries.filter(isSlot).map((entry) => ({ day, entry })),
  );
  const asked = slots.find(({ entry }) => entry.slotId === wanted);
  if (asked) return asked;
  const open = slots.filter(({ entry }) => entry.type === "open");
  return open.find(({ entry }) => !isMeal(entry)) ?? open[0] ?? null;
}

/** What the traveller's discards on this trip say about what to offer next (TB-CRD-08). */
async function historyFor(
  tripId: string,
  userId: string,
): Promise<CardHistory> {
  const discards = await readDiscards(db, tripId);
  const strength = (reason: DiscardReason) =>
    // A set is three cards, so three entries make one "said it once".
    Math.min(
      3,
      Math.ceil(discards.filter((d) => d.reason === reason).length / 3),
    );
  const disliked = await getPlaces(
    [
      ...new Set(
        discards
          .filter((d) => d.reason === "not_my_taste")
          .map((d) => d.placeId),
      ),
    ],
    userId,
  );
  return {
    discarded: [...new Set(discards.map((d) => d.placeId))],
    tooFar: strength("too_far"),
    lessTouristy: strength("too_touristy"),
    dislikedKinds: [...new Set(disliked.map((place) => place.kind))],
  };
}

async function proposalFor(
  trip: TripDetail,
  view: PlanView,
  places: Record<string, PlaceDto>,
  userId: string,
  wanted: string | undefined,
): Promise<PlanSnapshot["proposal"]> {
  const focus = focusSlot(view, wanted);
  const city = trip.facts.cities.find(
    ({ city }) => focus && cityKeyOf(city) === focus.entry.cityKey,
  )?.city;
  if (!focus || !city) return null;
  const { day, entry } = focus;

  // The stop just before the slot, when its position is known.
  const before = day.entries
    .slice(0, day.entries.indexOf(entry))
    .filter(
      (e): e is Extract<PlanEntry, { type: "place" }> => e.type === "place",
    )
    .map((e) => places[e.placeId])
    .filter((p) => p && p.latitude !== null && p.longitude !== null)
    .at(-1);
  const from = before
    ? {
        name: before.name,
        latitude: before.latitude!,
        longitude: before.longitude!,
      }
    : null;
  const centre =
    city.latitude === null || city.longitude === null
      ? null
      : { latitude: city.latitude, longitude: city.longitude };
  const near = from ?? centre;

  // One provider request at most; a failure leaves saved places usable.
  const gathered: GatherOutcome =
    isMeal(entry) && near
      ? await gatherFoodNear(city, near)
      : await gatherSights(city);
  const saved =
    isMeal(entry) && near
      ? await listFoodNear(city, near, userId)
      : await listSights(city, userId);

  const set = proposeCards({
    slot: {
      id: entry.slotId,
      kind: entry.kind,
      date: day.date,
      start: entry.start,
    },
    cityName: city.name,
    from,
    candidates: saved.filter((place) => kindSuitsSlot(place.kind, entry.kind)),
    taken: [
      ...view.days.flatMap((d) =>
        d.entries.flatMap((e) => (e.type === "place" ? [e.placeId] : [])),
      ),
      ...view.shelf.map((item) => item.placeId),
    ],
    kindsInDay: day.entries.flatMap((e) =>
      e.type === "place" && places[e.placeId] ? [places[e.placeId].kind] : [],
    ),
    history: await historyFor(trip.id, userId),
  });
  await recordPresented(
    db,
    trip.id,
    entry.slotId,
    set.cards.map((card) => card.placeId),
  );
  return { ...set, status: gathered.status };
}

/** A card for each place already chosen, so the traveller can look at it again. */
function chosenCards(
  view: PlanView,
  places: Record<string, PlaceDto>,
  trip: TripDetail,
): Record<string, CardDto> {
  const cityName = (key: string) =>
    trip.facts.cities.find(({ city }) => cityKeyOf(city) === key)?.city.name ??
    "the city";
  const cards: Record<string, CardDto> = {};
  for (const day of view.days) {
    for (const entry of day.entries) {
      const place = entry.type === "place" ? places[entry.placeId] : undefined;
      if (entry.type !== "place" || !place) continue;
      cards[place.id] = toCard(
        place,
        cityName(place.cityKey),
        `You chose this for day ${day.day}.`,
        entry.travelIn,
      );
    }
  }
  for (const item of view.shelf) {
    const place = places[item.placeId];
    if (!place) continue;
    cards[place.id] = toCard(
      place,
      cityName(place.cityKey),
      item.reason ?? "You saved this for later.",
    );
  }
  return cards;
}

/**
 * The plan as it stands, with the cards for one slot, or null when the trip
 * is not the traveller's. Reading can gather a city's places (one provider
 * request at most) and records the cards it shows.
 */
export async function loadPlan(
  userId: string,
  tripId: string,
  focus?: string,
): Promise<PlanSnapshot | null> {
  const trip = await getTrip(userId, tripId);
  if (!trip) return null;
  const saved = await readPlanState(db, tripId);
  const state = withProvisionalStart(saved.state, trip);
  const context = await contextFor(trip, state, userId);
  const view = buildPlanView(state, context);
  return {
    view,
    chosen: chosenCards(view, context.places, trip),
    proposal: trip.archived
      ? null
      : await proposalFor(trip, view, context.places, userId, focus),
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

      if (action.type === "others") {
        // Only real places the traveller was shown can be turned down.
        const known = await getPlaces(action.placeIds, userId);
        if (known.length !== new Set(action.placeIds).size) {
          return new Refusal("Those places are not available.");
        }
        const reasons = [
          ...new Set(
            action.reasons.flatMap((text) => discardReason(text) ?? []),
          ),
        ];
        await recordDiscards(
          tx,
          tripId,
          action.slotId,
          action.placeIds,
          reasons,
          action.note,
        );
        return { summary: "Asked for other places" };
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
      if (action.type === "pick") {
        await recordCard(tx, tripId, action.slotId, action.placeId, "PICKED");
      }
      if (action.type === "save") {
        await recordCard(tx, tripId, "shelf", action.placeId, "SAVED");
      }
      return { summary: applied.summary };
    },
  });
}
