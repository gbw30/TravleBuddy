import {
  applyPlanAction,
  buildPlanView,
  forgetPlace,
  holdsPlace,
  morningStayOf,
  builtPlaceIds,
  kindSuitsSlot,
  provisionalStart,
  readBuild,
  readPlanState,
  settle,
  undoPlan,
  writePlanVersion,
  type PlanContext,
} from "@/features/itinerary";
import { appendMessages, labelsOf, QUESTIONS } from "@/features/conversation";
import {
  isMeal,
  PACES,
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
  removeOwnPlace,
  usesSamplePlaces,
  type GatherOutcome,
} from "@/features/places";
import {
  cityKeyOf,
  TRAVEL_MEANS,
  type City,
  type PlaceDto,
  type PlaceKind,
  type TravelMeans,
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
  type CardSet,
  type DiscardReason,
} from "@/features/recommendations/contracts";
import {
  advanceTripRevision,
  findEditable,
  getTrip,
  listTrips,
} from "@/features/trips";
import type { CommitmentDto, TripDetail } from "@/features/trips/contracts";
import { db } from "@/lib/db";
import type { Sentence } from "@/lib/wording";

import { shownWords } from "./wording";

import { briefOf } from "./brief";
import { buildReportOf } from "./build-report";
import type { PlanSnapshot } from "./plan-snapshot";
import { Refusal, runTripAction, type TripActionOutcome } from "./trip-action";

// Reading and changing a trip's plan spans four services: Trips holds the
// facts and commitments, Places the saved places, Itinerary the choices and
// the rules that lay them out, and Recommendations the cards.

export type SlotEntry = Extract<PlanEntry, { type: "open" | "place" }>;

const today = () => new Date().toISOString().slice(0, 10);
export const isSlot = (entry: PlanEntry): entry is SlotEntry =>
  entry.type === "open" || entry.type === "place";

/** A trip with no dates is laid out from provisional ones (PRD 9.7). */
export function withProvisionalStart(
  state: PlanState,
  trip: TripDetail,
): PlanState {
  if (trip.facts.startDate || state.provisionalStart) return state;
  return { ...state, provisionalStart: provisionalStart(trip.facts, today()) };
}

/**
 * The choices a plan is laid out from. A plan nobody has changed yet starts
 * at the pace the trip goes by, a remembered one included (TB-MEM-02); once
 * a version is saved, the plan's own pace stands. A trip with no dates gets
 * provisional ones.
 */
export function startingState(
  saved: { state: PlanState; fresh?: boolean },
  trip: TripDetail,
  taste: TasteInUse,
): PlanState {
  const pace = PACES.find((item) => item === taste.pace?.values[0]);
  return withProvisionalStart(
    saved.fresh && pace ? { ...saved.state, pace } : saved.state,
    trip,
  );
}

/** How far the "shape of the day" moves the whole day (PRD 9.4). */
const DAY_SHIFT: Record<string, number> = { early: -60, late: 60 };
const BREAKFASTS = ["included", "suggest", "none"] as const;

/** The taste a trip goes by: the personal profile, with what was said for this trip on top. */
export async function tasteOf(
  userId: string,
  tripId: string,
): Promise<TasteInUse> {
  const [profile, said] = await Promise.all([
    readProfile(db, userId),
    readTripTaste(db, tripId),
  ]);
  return tasteInUse(profile.entries, said);
}

/**
 * The commitments as the plan may place them: a sample address is no
 * position once the sample places are off, so it gives no legs.
 */
const positioned = (commitments: CommitmentDto[]): CommitmentDto[] =>
  usesSamplePlaces()
    ? commitments
    : commitments.map((c) =>
        c.located?.ref.startsWith("sample/") ? { ...c, located: null } : c,
      );

/** The way of getting around the traveller named, if they named one. */
const meansOf = (taste: TasteInUse): TravelMeans | undefined =>
  TRAVEL_MEANS.find((means) => means === taste.getting_around?.values[0]);

/**
 * What a plan is laid out from. `taste` is passed by a caller that has
 * already read it; otherwise it is read here.
 */
export async function contextFor(
  trip: TripDetail,
  state: PlanState,
  userId: string,
  alsoPlaceIds: string[] = [],
  taste?: TasteInUse,
): Promise<PlanContext> {
  const ids = [
    ...Object.values(state.picks).map((pick) => pick.placeId),
    ...state.shelf.map((item) => item.placeId),
    ...alsoPlaceIds,
  ];
  const places = await getPlaces([...new Set(ids)], userId);
  const inUse = taste ?? (await tasteOf(userId, trip.id));
  return {
    facts: trip.facts,
    commitments: positioned(trip.commitments),
    places: Object.fromEntries(places.map((place) => [place.id, place])),
    dayShift: DAY_SHIFT[inUse.day_shape?.values[0] ?? ""] ?? 0,
    means: meansOf(inUse),
    breakfast: BREAKFASTS.find(
      (choice) => choice === inUse.breakfast?.values[0],
    ),
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
  return open.find(({ entry }) => !isMeal(entry.kind)) ?? open[0] ?? null;
}

/** The trip's taste in the form the ranking understands (TB-RSN-02). */
export type Limits = ReturnType<typeof limitsInUse>;

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
    means: meansOf(taste),
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
export async function historyFor(
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

/** Rules a plan breaks. Unknown opening hours are an uncertainty, not a broken rule. */
export const brokenRules = (view: PlanView) =>
  view.days
    .flatMap((day) => day.entries)
    .flatMap((entry) => (entry.type === "place" ? entry.flags : []))
    .filter((flag) => flag.rule !== "hours-unknown").length;

/**
 * The ranked cards for one slot, from the saved places of its city. With
 * `gather`, the provider is asked first: one request at most, and a failure
 * leaves the saved places usable. Null when the slot's city is not known.
 */
export async function cardsFor(
  trip: TripDetail,
  view: PlanView,
  places: Record<string, PlaceDto>,
  userId: string,
  { day, entry }: { day: PlanDay; entry: SlotEntry },
  taste: TasteInUse,
  limits: Limits,
  gather: boolean,
  history?: CardHistory,
  /**
   * The plan the cards are for. With it, a place is offered only if picking
   * it leaves no rule newly broken anywhere in the plan.
   */
  plan?: { state: PlanState; context: PlanContext },
): Promise<{
  set: CardSet & { sentences: Record<string, Sentence[]> };
  cityName: string;
  gathered: GatherOutcome | null;
} | null> {
  const city = trip.facts.cities.find(
    ({ city }) => cityKeyOf(city) === entry.cityKey,
  )?.city;
  if (!city) return null;

  // The stop just before the slot, when it has a known position. A booking
  // or a transfer in between means there is no stop to measure from. The
  // first slot of a day starts from where the traveller slept, and the slot
  // after a check-in from the stay, when its position is confirmed.
  const earlier = day.entries
    .slice(0, day.entries.indexOf(entry))
    .filter(
      (e) =>
        e.type !== "open" &&
        e.type !== "wander" &&
        e.type !== "breakfast-at-stay" &&
        !(e.type === "commitment" && e.slotId === null && e.start === null),
    );
  const last = earlier.at(-1);
  const stayAt = (stay: CommitmentDto | null | undefined) =>
    stay?.located
      ? {
          name: stay.title,
          latitude: stay.located.latitude,
          longitude: stay.located.longitude,
        }
      : null;
  const before = last?.type === "place" ? places[last.placeId] : undefined;
  const from =
    before && before.latitude !== null && before.longitude !== null
      ? {
          name: before.name,
          latitude: before.latitude,
          longitude: before.longitude,
        }
      : last === undefined
        ? stayAt(morningStayOf(positioned(trip.commitments), day.date))
        : last.type === "commitment" && last.travelIn !== undefined
          ? stayAt(trip.commitments.find((c) => c.id === last.commitmentId))
          : null;
  const centre =
    city.latitude === null || city.longitude === null
      ? null
      : { latitude: city.latitude, longitude: city.longitude };
  const near = from ?? centre;

  const gathered: GatherOutcome | null = !gather
    ? null
    : isMeal(entry.kind) && near
      ? await gatherFoodNear(city, near)
      : await gatherSights(city);
  const saved =
    isMeal(entry.kind) && near
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
    // A place the traveller has already decided, by name, is not offered again.
    candidates: saved.filter(
      (place) =>
        kindSuitsSlot(place.kind, entry.kind) &&
        !trip.commitments.some(
          (commitment) =>
            commitment.title.trim().toLowerCase() ===
            place.name.trim().toLowerCase(),
        ),
    ),
    taken: [
      ...view.days.flatMap((d) =>
        d.entries.flatMap((e) =>
          // A breakfast place may be chosen again on another day (TB-ITN-21).
          e.type === "place" &&
          !(
            entry.kind === "breakfast" &&
            e.kind === "breakfast" &&
            d.day !== day.day
          )
            ? [e.placeId]
            : [],
        ),
      ),
      ...view.shelf.map((item) => item.placeId),
    ],
    kindsInDay: day.entries.flatMap((e) =>
      e.type === "place" && places[e.placeId] ? [places[e.placeId].kind] : [],
    ),
    namesInPlan: view.days.flatMap((d) =>
      d.entries.flatMap((e) =>
        e.type === "place" && places[e.placeId] ? [places[e.placeId].name] : [],
      ),
    ),
    history: history ?? (await historyFor(trip.id, userId)),
    taste: cardTaste(taste, limits),
    fits: plan
      ? (place) => {
          const applied = applyPlanAction(plan.state, view, {
            type: "pick",
            slotId: entry.slotId,
            placeId: place.id,
          });
          if ("refused" in applied) return false;
          const after = buildPlanView(applied.state, {
            ...plan.context,
            places: { ...plan.context.places, [place.id]: place },
          });
          return brokenRules(after) <= brokenRules(view);
        }
      : undefined,
  });
  return { set, cityName: city.name, gathered };
}

async function proposalFor(
  trip: TripDetail,
  view: PlanView,
  places: Record<string, PlaceDto>,
  userId: string,
  slot: { day: PlanDay; entry: SlotEntry },
  taste: TasteInUse,
  limits: Limits,
  gather: boolean,
  plan: { state: PlanState; context: PlanContext },
): Promise<PlanSnapshot["proposal"]> {
  const found = await cardsFor(
    trip,
    view,
    places,
    userId,
    slot,
    taste,
    limits,
    gather,
    undefined,
    plan,
  );
  if (!found) return null;
  const { sentences, ...set } = found.set;
  const { cityName, gathered } = found;
  const { day, entry } = slot;
  // What is shown is recorded with its sentences (outside any transaction).
  const shown = await shownWords(
    trip.id,
    set.cards.map((card) => ({
      subject: `card:${entry.slotId}:${card.placeId}`,
      sentences: sentences[card.placeId],
    })),
  );
  set.cards = set.cards.map((card, i) => ({ ...card, reason: shown[i] }));
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
    cityName,
    // Without gathering, an empty set may only mean nobody has asked yet.
    status: gathered?.status ?? (set.cards.length === 0 ? "pending" : "ready"),
  };
}

/** A card for each place already chosen, so the traveller can look at it again. */
async function chosenCards(
  view: PlanView,
  places: Record<string, PlaceDto>,
  trip: TripDetail,
  built: Set<string>,
): Promise<Record<string, CardDto>> {
  const cityName = (key: string) =>
    trip.facts.cities.find(({ city }) => cityKeyOf(city) === key)?.city.name ??
    "the city";
  const cards: Record<string, CardDto> = {};
  const words: Record<string, { subject: string; sentences: Sentence[] }> = {};
  for (const day of view.days) {
    for (const entry of day.entries) {
      const place = entry.type === "place" ? places[entry.placeId] : undefined;
      if (entry.type !== "place" || !place) continue;
      cards[place.id] = toCard(
        place,
        cityName(place.cityKey),
        "",
        entry.travelIn,
      );
      words[place.id] = {
        subject: `card:${entry.slotId}:${place.id}`,
        sentences: [
          {
            template: "chosen",
            version: 1,
            text: "{who} chose this for day {day}.",
            facts: [
              {
                gap: "who",
                value: built.has(place.id) ? "I" : "You",
                source: {
                  type: "computation",
                  name: "chosen-by",
                  inputs: { built: built.has(place.id) ? "yes" : "no" },
                },
              },
              {
                gap: "day",
                value: String(day.day),
                source: {
                  type: "computation",
                  name: "plan-day",
                  inputs: { slotId: entry.slotId },
                },
              },
            ],
          },
        ],
      };
    }
  }
  const ids = Object.keys(words);
  const shown = await shownWords(
    trip.id,
    ids.map((id) => words[id]),
  );
  ids.forEach((id, i) => (cards[id] = { ...cards[id], reason: shown[i] }));
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
  const [saved, taste] = await Promise.all([
    readPlanState(db, trip.id),
    tasteOf(userId, trip.id),
  ]);
  const state = startingState(saved, trip, taste);
  return buildPlanView(state, await contextFor(trip, state, userId, [], taste))
    .days;
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
  try {
    return await readPlan(userId, tripId, wanted, gather);
  } catch (error) {
    // Reading a plan records the cards it shows against the trip. A trip
    // deleted while it is being read is gone, not broken: answer as for
    // any trip that does not exist.
    if (await getTrip(userId, tripId)) throw error;
    return null;
  }
}

async function readPlan(
  userId: string,
  tripId: string,
  wanted: string | undefined,
  gather: boolean,
): Promise<PlanSnapshot | null> {
  const trip = await getTrip(userId, tripId);
  if (!trip) return null;
  const saved = await readPlanState(db, tripId);
  // The taste a trip goes by starts from the personal profile; what was
  // said for this trip wins (TB-MEM-02). The layout needs it too: the
  // shape of the day moves the day (TB-ITN-08).
  const [personal, said] = await Promise.all([
    readProfile(db, userId).then((profile) => profile.entries),
    readTripTaste(db, tripId),
  ]);
  const taste: TasteInUse = tasteInUse(personal, said);
  const state = startingState(saved, trip, taste);
  const context = await contextFor(trip, state, userId, [], taste);
  const view = buildPlanView(state, context);
  const focus = trip.archived ? null : focusSlot(view, wanted);
  const progress = view.days.length > 0 ? await readBuild(db, tripId) : null;
  const limits = limitsInUse(
    personal,
    said.food?.source === "told" ? said.food.values : [],
  );
  // Guided planning proposes meals once the food question is answered or
  // skipped (TB-AGT-07). Until then the agent says what it is waiting for.
  const holding =
    focus !== null &&
    isMeal(focus.entry.kind) &&
    trip.planningMode === "GUIDED" &&
    taste.food === undefined;
  const proposing = focus !== null && !holding;
  return {
    view,
    chosen: await chosenCards(
      view,
      context.places,
      trip,
      new Set(builtPlaceIds(progress, state)),
    ),
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
          { state, context },
        )
      : null,
    holding: holding ? "food" : null,
    shelfOffer: proposing
      ? shelfOffer(view, context.places, focus.entry)
      : null,
    canUndo: saved.canUndo,
    build: progress
      ? buildReportOf({
          view,
          places: context.places,
          progress,
          style: briefOf(trip, taste, personal).style,
          dietaryRules: limits.dietaryRules,
          cities: trip.facts.cities.map(({ city }) => city.name),
          decided: trip.commitments.length,
        })
      : null,
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
  const [saved, taste] = await Promise.all([
    readPlanState(tx, trip.id),
    tasteOf(userId, trip.id),
  ]);
  const state = startingState(saved, trip, taste);
  if (state.pace === pace) return false;
  const context = await contextFor(trip, state, userId, [], taste);
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

      const [saved, taste] = await Promise.all([
        readPlanState(tx, tripId),
        tasteOf(userId, tripId),
      ]);
      const state = startingState(saved, trip, taste);
      const adding = "placeId" in action ? [action.placeId] : [];
      const context = await contextFor(trip, state, userId, adding, taste);
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

type OtherTrip = { id: string; title: string };

/** The traveller's other trips that can still change: an archived plan reads a missing place as open. */
const otherTrips = async (userId: string, tripId: string) =>
  (await listTrips(userId)).filter((t) => t.id !== tripId && !t.archived);

/** The traveller's other trips whose plans hold the place, in a slot or on the shelf. */
async function otherTripsHolding(
  client: Parameters<typeof readPlanState>[0],
  trips: { id: string; title: string }[],
  placeId: string,
): Promise<OtherTrip[]> {
  const held: OtherTrip[] = [];
  for (const { id, title } of trips) {
    const { state } = await readPlanState(client, id);
    if (holdsPlace(state, placeId)) held.push({ id, title });
  }
  return held;
}

/**
 * The other trips of this traveller that hold a place they added by hand, so
 * the confirm step can say removing it opens those slots too (TB-CRD-13).
 */
export async function tripsAlsoHolding(
  userId: string,
  tripId: string,
  placeId: string,
): Promise<OtherTrip[] | null> {
  if (!(await getTrip(userId, tripId))) return null;
  const [place] = await getPlaces([placeId], userId);
  if (place?.origin !== "USER") return [];
  const others = await otherTrips(userId, tripId);
  return otherTripsHolding(db, others, placeId);
}

/**
 * Removes a place the traveller added by hand. Any slot holding it reopens
 * and it leaves the shelf, in the same change that deletes it, so the plan
 * never holds a place that is gone (TB-CRD-13).
 */
export async function removeTripPlace(input: {
  userId: string;
  tripId: string;
  placeId: string;
  control: { operationId: string; expectedRevision: number };
}): Promise<TripActionOutcome<{ summary: string }>> {
  const { userId, tripId, placeId } = input;
  const trip = await getTrip(userId, tripId);
  if (!trip) return { status: "not_found" };
  // The place belongs to the traveller and the city, not to one trip.
  const others = await otherTrips(userId, tripId);

  return runTripAction({
    userId,
    tripId,
    kind: "place_remove",
    control: input.control,
    request: { placeId },
    apply: async (tx) => {
      const refused = await findEditable(tx, userId, tripId);
      if (refused) return refused;
      const name = await removeOwnPlace(tx, userId, placeId);
      if (!name) return new Refusal("That place is not one you added.");

      const [saved, taste] = await Promise.all([
        readPlanState(tx, tripId),
        tasteOf(userId, tripId),
      ]);
      const state = startingState(saved, trip, taste);
      const next = forgetPlace(state, placeId);
      const summary = `${name} was removed.`;
      // Every other trip holding it reopens the slot, says so, and moves on a
      // revision so a screen already open on it is brought up to date.
      for (const other of await otherTripsHolding(tx, others, placeId)) {
        const { state: theirs } = await readPlanState(tx, other.id);
        await writePlanVersion(
          tx,
          other.id,
          forgetPlace(theirs, placeId),
          summary,
        );
        await appendMessages(tx, other.id, [
          { from: "agent", body: { kind: "text", text: summary } },
        ]);
        await advanceTripRevision(tx, userId, other.id, undefined);
      }
      const held =
        Object.keys(next.picks).length !== Object.keys(state.picks).length ||
        next.shelf.length !== state.shelf.length;
      if (held) await writePlanVersion(tx, tripId, next, summary);
      return { summary };
    },
  });
}
