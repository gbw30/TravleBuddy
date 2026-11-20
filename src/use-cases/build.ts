import {
  applyPlanAction,
  buildPlanView,
  readBuild,
  readPlanState,
  settle,
  writeBuild,
  writePlanVersion,
  type Change,
} from "@/features/itinerary";
import {
  isMeal,
  PACES,
  type BuildProgress,
} from "@/features/itinerary/contracts";
import {
  limitsInUse,
  readProfile,
  readTripTaste,
  tasteInUse,
  type TasteInUse,
} from "@/features/memory";
import { findEditable, getTrip } from "@/features/trips";
import type { TripDetail } from "@/features/trips/contracts";
import { db } from "@/lib/db";

import {
  brokenRules,
  cardsFor,
  contextFor,
  historyFor,
  isSlot,
  startingState,
} from "./plan";
import { Refusal, runTripAction, type TripActionOutcome } from "./trip-action";

// Building a trip for the traveller (PRD 11.3). One request builds one day:
// for each open slot it takes the best-ranked place that breaks no rule, by
// the same ranking and the same plan rules as a traveller's own pick
// (TB-QPL-09). No background worker is involved; the page asks for the next
// day until the build says it is done.

/** What one request built. */
export type BuildStep = {
  /** The day just built, from 1. */
  day: number;
  days: number;
  /** How many slots it filled on that day. */
  filled: number;
  done: boolean;
};

type Prepared = {
  day: number;
  days: number;
  /** The pace to set first, then the picks, in the order they were made. */
  changes: Change[];
  progress: BuildProgress;
  /** The taste the day was worked out with, so it is saved from the same layout. */
  taste: TasteInUse;
};

/**
 * Works out one day outside the transaction, because it may ask the place
 * provider. The plan is laid out again after every pick, so the next slot
 * is chosen knowing where the traveller will be.
 */
async function prepareDay(
  trip: TripDetail,
  userId: string,
  start: boolean,
): Promise<Prepared | Refusal> {
  const [saved, before, profile, said] = await Promise.all([
    readPlanState(db, trip.id),
    readBuild(db, trip.id),
    readProfile(db, userId),
    readTripTaste(db, trip.id),
  ]);
  const taste = tasteInUse(profile.entries, said);
  const limits = limitsInUse(
    profile.entries,
    said.food?.source === "told" ? said.food.values : [],
  );

  let state = startingState(saved, trip, taste);
  let context = await contextFor(trip, state, userId, [], taste);
  let view = buildPlanView(state, context);
  const changes: Change[] = [];

  // A build starts from the pace the brief shows, a remembered one included.
  const pace = PACES.find((item) => item === taste.pace?.values[0]);
  if (start && pace && pace !== state.pace) {
    const paced = applyPlanAction(state, view, { type: "pace", pace });
    if (!("refused" in paced)) {
      state = paced.state;
      view = buildPlanView(state, context);
      changes.push({ type: "pace", pace });
    }
  }

  if (view.days.length === 0) {
    return new Refusal(
      "I need the first step of the brief before I can build the trip.",
    );
  }
  if (!start && (!before || before.nextDay > view.days.length)) {
    return new Refusal("No build is in progress.");
  }
  // Starting again keeps what an earlier build put in place and the
  // traveller left there; its notes on slots are made afresh.
  const progress: BuildProgress = {
    nextDay: start ? 1 : before!.nextDay,
    built: Object.fromEntries(
      Object.entries(before?.built ?? {}).filter(
        ([slot, placeId]) => state.picks[slot]?.placeId === placeId,
      ),
    ),
    close: start ? [] : before!.close,
    empty: start ? [] : before!.empty,
    unreachable: start ? false : before!.unreachable,
  };
  const dayNumber = progress.nextDay;
  const history = await historyFor(trip.id, userId);
  const tried = new Set<string>();

  for (;;) {
    const day = view.days[dayNumber - 1];
    const open = day.entries
      .filter(isSlot)
      .filter((entry) => entry.type === "open" && !tried.has(entry.slotId));
    // Sights and activities first, then the meals near them (PRD 7.5).
    const entry = open.find((item) => !isMeal(item.kind)) ?? open[0];
    if (!entry) break;
    tried.add(entry.slotId);

    const found = await cardsFor(
      trip,
      view,
      context.places,
      userId,
      { day, entry },
      taste,
      limits,
      true,
      history,
      { state, context },
    );
    if (found?.gathered && found.gathered.status !== "ready") {
      progress.unreachable = true;
    }

    // The best-ranked place that leaves no rule broken.
    let placed = false;
    for (const card of found?.set.cards ?? []) {
      const pick: Change = {
        type: "pick",
        slotId: entry.slotId,
        placeId: card.placeId,
      };
      const applied = applyPlanAction(state, view, pick);
      if ("refused" in applied) continue;
      const withPlace = await contextFor(
        trip,
        applied.state,
        userId,
        [],
        taste,
      );
      const next = buildPlanView(applied.state, withPlace);
      if (brokenRules(next) > brokenRules(view)) continue;
      state = applied.state;
      context = withPlace;
      view = next;
      changes.push(pick);
      progress.built[entry.slotId] = card.placeId;
      if (found?.set.close) progress.close.push(entry.slotId);
      placed = true;
      break;
    }
    if (!placed) progress.empty.push(entry.slotId);
  }

  progress.nextDay = dayNumber + 1;
  return {
    day: dayNumber,
    days: view.days.length,
    changes,
    progress,
    taste,
  };
}

/**
 * Builds the next day of the trip, or the first when `start` is set. A
 * repeat of the same request gets its first answer, so a day is never built
 * twice. Only open slots are filled: what the traveller chose and what is
 * already decided are never moved.
 */
export async function buildNextDay(input: {
  userId: string;
  tripId: string;
  control: { operationId: string; expectedRevision: number };
  start: boolean;
}): Promise<TripActionOutcome<BuildStep>> {
  const { userId, tripId, start } = input;
  const trip = await getTrip(userId, tripId);
  if (!trip) return { status: "not_found" };
  const prepared = trip.archived ? null : await prepareDay(trip, userId, start);

  return runTripAction<BuildStep>({
    userId,
    tripId,
    kind: "plan_build",
    control: input.control,
    request: { start },
    transactionOptions: { maxWait: 10_000, timeout: 20_000 },
    apply: async (tx) => {
      const refused = await findEditable(tx, userId, tripId);
      if (refused) return refused;
      if (!prepared) return "archived";
      if (prepared instanceof Refusal) return prepared;

      // The plan as it is now. A slot the traveller filled in the meantime
      // is left alone.
      const saved = await readPlanState(tx, tripId);
      let state = startingState(saved, trip, prepared.taste);
      const context = await contextFor(
        trip,
        state,
        userId,
        prepared.changes.flatMap((change) =>
          change.type === "pick" ? [change.placeId] : [],
        ),
        prepared.taste,
      );
      const built = { ...prepared.progress.built };
      let filled = 0;
      let changed = false;
      for (const change of prepared.changes) {
        const view = buildPlanView(state, context);
        const stillOpen =
          change.type !== "pick" ||
          view.days
            .flatMap((day) => day.entries)
            .some(
              (entry) =>
                entry.type === "open" && entry.slotId === change.slotId,
            );
        const applied = stillOpen
          ? applyPlanAction(state, view, change)
          : { refused: "taken" };
        if ("refused" in applied) {
          if (change.type === "pick") delete built[change.slotId];
          continue;
        }
        state = applied.state;
        changed = true;
        if (change.type === "pick") filled += 1;
      }
      if (changed) {
        await writePlanVersion(
          tx,
          tripId,
          settle(state, buildPlanView(state, context)),
          `Built day ${prepared.day}`,
        );
      }
      await writeBuild(tx, tripId, { ...prepared.progress, built });
      return {
        day: prepared.day,
        days: prepared.days,
        filled,
        done: prepared.day >= prepared.days,
      };
    },
  });
}
