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
import { appendMessages, labelsOf, QUESTIONS } from "@/features/conversation";
import {
  SLOT_WORDS,
  type Pace,
  type PlanAction,
  type PlanDay,
  type PlanEntry,
  type PlanState,
  type PlanView,
} from "@/features/itinerary/contracts";
import {
  readProfile,
  readTripTaste,
  limitsInUse,
  tasteInUse,
  type TasteInUse,
} from "@/features/memory";
import type { ProfileEntry } from "@/features/memory/contracts";
import type { PlanningTransaction } from "@/features/planning";
import {
  addOwnPlace,
  findPlacesByName,
  gatherFoodNear,
  gatherSights,
  getPlaces,
  listFoodNear,
  listSights,
  type GatherOutcome,
} from "@/features/places";
import {
  cityKeyOf,
  type City,
  type PlaceDto,
  type PlaceKind,
} from "@/features/places/contracts";
import {
  proposeCards,
  readDiscards,
  recordCard,
  recordDiscards,
  recordPresented,
  toCard,
  type CardHistory,
  type CardTaste,
} from "@/features/recommendations";
import {
  discardReason,
  type CardDto,
  type DiscardReason,
} from "@/features/recommendations/contracts";
import { findEditable, getTrip } from "@/features/trips";
import type { TripDetail } from "@/features/trips/contracts";
import { db } from "@/lib/db";

import type { PlanSnapshot } from "./plan-snapshot";
import { Refusal, runTripAction, type TripActionOutcome } from "./trip-action";

// Reading and changing a trip's plan spans four services: Trips holds the
// facts and commitments, Places the saved places, Itinerary the choices and
// the rules that lay them out, and Recommendations the cards.

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

/** The trip's taste in the form the ranking understands (TB-RSN-02). */
type Limits = ReturnType<typeof limitsInUse>;

function cardTaste(taste: TasteInUse, limits: Limits): CardTaste {
  // The trip a remembered value was learned from, so a reason can name it (TB-MEM-06).
  const tripOf = (entries: ProfileEntry[] = [], value?: string) => {
    const entry = entries.find(
      (item) =>
        item.source.type === "trip" &&
        (value === undefined || item.value === value),
    );
    return entry?.source.type === "trip" ? entry.source.tripTitle : undefined;
  };
  const atmosphere = taste.atmosphere?.values[0];
  return {
    interests: taste.interests
      ? taste.interests.values.map((value) => ({
          value,
          label: labelsOf(QUESTIONS.interests, [value])[0].toLowerCase(),
          from: tripOf(taste.interests?.entries, value),
        }))
      : null,
    atmosphere:
      atmosphere === "lively" || atmosphere === "quiet" ? atmosphere : null,
    onFoot: taste.getting_around?.values[0] === "walk",
    // The dietary rules are hard limits: those remembered always apply,
    // with any given for this trip (TB-MEM-05).
    food: taste.food ? limits.dietaryRules : null,
    allergies: limits.allergies,
    rememberedFrom: {
      atmosphere: tripOf(taste.atmosphere?.entries),
      onFoot: tripOf(taste.getting_around?.entries),
    },
  };
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
  { day, entry }: { day: PlanDay; entry: SlotEntry },
  taste: TasteInUse,
  limits: Limits,
  gather: boolean,
): Promise<PlanSnapshot["proposal"]> {
  const city = trip.facts.cities.find(
    ({ city }) => cityKeyOf(city) === entry.cityKey,
  )?.city;
  if (!city) return null;

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
  const gathered: GatherOutcome | null = !gather
    ? null
    : isMeal(entry) && near
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
    taste: cardTaste(taste, limits),
  });
  const fresh = await recordPresented(
    db,
    trip.id,
    entry.slotId,
    set.cards.map((card) => card.placeId),
  );
  // In guided planning a new proposal joins the conversation, naming its
  // slot with the day and the time (TB-AGT-09, TB-AGT-13).
  if (trip.planningMode === "GUIDED" && fresh.length > 0) {
    await appendMessages(db, trip.id, [
      {
        from: "agent",
        body: {
          kind: "proposal",
          slotId: entry.slotId,
          text: `For day ${day.day}, ${SLOT_WORDS[entry.kind].toLowerCase()} at ${entry.start}, I suggest ${set.cards.length === 1 ? "this" : "one of these"}.`,
          placeNames: set.cards.map((card) => card.name.slice(0, 160)),
        },
      },
    ]);
  }
  return {
    ...set,
    cityName: city.name,
    // Without gathering, an empty set may only mean nobody has asked yet.
    status: gathered?.status ?? (set.cards.length === 0 ? "pending" : "ready"),
  };
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

/** The plan's days as they stand, without proposals. Empty while a fact is missing. */
export async function planDays(
  userId: string,
  trip: TripDetail,
): Promise<PlanDay[]> {
  const saved = await readPlanState(db, trip.id);
  const state = withProvisionalStart(saved.state, trip);
  return buildPlanView(state, await contextFor(trip, state, userId)).days;
}

/**
 * The plan as it stands, with the cards for one slot, or null when the trip
 * is not the traveller's. Reading can gather a city's places (one provider
 * request at most) and records the cards it shows.
 */
export async function loadPlan(
  userId: string,
  tripId: string,
  wanted?: string,
  /** False keeps the provider out of a page load; the screen then asks again. */
  gather = true,
): Promise<PlanSnapshot | null> {
  const trip = await getTrip(userId, tripId);
  if (!trip) return null;
  const saved = await readPlanState(db, tripId);
  const state = withProvisionalStart(saved.state, trip);
  const context = await contextFor(trip, state, userId);
  const view = buildPlanView(state, context);
  const focus = trip.archived ? null : focusSlot(view, wanted);
  // The taste a trip goes by starts from the personal profile; what was
  // said for this trip wins (TB-MEM-02).
  const personal = focus ? (await readProfile(db, userId)).entries : [];
  const said = focus ? await readTripTaste(db, tripId) : {};
  const taste: TasteInUse = tasteInUse(personal, said);
  const limits = limitsInUse(
    personal,
    said.food?.source === "told" ? said.food.values : [],
  );
  // Guided planning proposes meals once the food question is answered or
  // skipped (TB-AGT-07). Until then the agent says what it is waiting for.
  const holding =
    focus !== null &&
    isMeal(focus.entry) &&
    trip.planningMode === "GUIDED" &&
    taste.food === undefined;
  const proposing = focus !== null && !holding;
  return {
    view,
    chosen: chosenCards(view, context.places, trip),
    proposal: proposing
      ? await proposalFor(
          trip,
          view,
          context.places,
          userId,
          focus,
          taste,
          limits,
          gather,
        )
      : null,
    holding: holding ? "food" : null,
    shelfOffer: proposing
      ? shelfOffer(view, context.places, focus.entry)
      : null,
    canUndo: saved.canUndo,
  };
}

/** A shelved place that fits the open slot in focus, for the agent to offer (TB-ITN-14). */
function shelfOffer(
  view: PlanView,
  places: Record<string, PlaceDto>,
  entry: SlotEntry,
): PlanSnapshot["shelfOffer"] {
  if (entry.type !== "open") return null;
  const place = view.shelf
    .map((item) => places[item.placeId])
    .find(
      (place) =>
        place &&
        place.cityKey === entry.cityKey &&
        kindSuitsSlot(place.kind, entry.kind),
    );
  return place
    ? { placeId: place.id, name: place.name, slotId: entry.slotId }
    : null;
}

/**
 * Sets the plan's pace inside a change that is already under way: the pace
 * answer in conversation. False when the plan already has that pace.
 */
export async function setPlanPace(
  tx: PlanningTransaction,
  trip: TripDetail,
  userId: string,
  pace: Pace,
): Promise<boolean> {
  const saved = await readPlanState(tx, trip.id);
  if (saved.state.pace === pace) return false;
  const state = withProvisionalStart(saved.state, trip);
  const context = await contextFor(trip, state, userId);
  const applied = applyPlanAction(state, buildPlanView(state, context), {
    type: "pace",
    pace,
  });
  if ("refused" in applied) return false;
  await writePlanVersion(
    tx,
    trip.id,
    settle(applied.state, buildPlanView(applied.state, context)),
    applied.summary,
  );
  return true;
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

/** The city a slot is in, or the trip's first city when no slot is named. */
async function cityFor(
  userId: string,
  tripId: string,
  slotId: string | undefined,
): Promise<City | null> {
  const plan = await loadPlan(userId, tripId, slotId, false);
  const trip = await getTrip(userId, tripId);
  if (!plan || !trip) return null;
  const entry = plan.view.days
    .flatMap((day) => day.entries)
    .filter(isSlot)
    .find((e) => e.slotId === slotId);
  const cities = trip.facts.cities.map(({ city }) => city);
  return (
    cities.find((city) => entry && cityKeyOf(city) === entry.cityKey) ??
    cities[0] ??
    null
  );
}

export type PlaceSearch =
  | { status: "ok"; cards: CardDto[] }
  | { status: "not_found" | "unavailable" | "capped" };

/**
 * Places by name in the city of a slot, as cards the traveller can pick or
 * save (TB-CRD-10). One provider request, made when the traveller submits.
 */
export async function findTripPlaces(
  userId: string,
  tripId: string,
  slotId: string | undefined,
  text: string,
): Promise<PlaceSearch> {
  const city = await cityFor(userId, tripId, slotId);
  if (!city) return { status: "not_found" };
  const found = await findPlacesByName(city, text);
  if (found.status !== "ok") return found;
  return {
    status: "ok",
    cards: found.places.map((place) =>
      toCard(place, city.name, "You searched for this place by name."),
    ),
  };
}

/** A place the provider does not know, entered by hand and marked as the traveller's own (TB-CRD-11). */
export async function addTripPlace(
  userId: string,
  tripId: string,
  slotId: string | undefined,
  input: { name: string; kind: PlaceKind },
): Promise<CardDto | null> {
  const city = await cityFor(userId, tripId, slotId);
  if (!city) return null;
  const place = await addOwnPlace(userId, city, input);
  return toCard(place, city.name, "You added this place yourself.");
}
