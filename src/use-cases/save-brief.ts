import { PACES } from "@/features/itinerary/contracts";
import {
  readProfile,
  readTripSaid,
  readTripTaste,
  saveTripAnswer,
  saveTripSaid,
  tasteInUse,
} from "@/features/memory";
import { TASTE_TOPICS } from "@/features/memory/contracts";
import { findEditable, getTrip, saveTripFacts } from "@/features/trips";
import { db } from "@/lib/db";

import { briefOf } from "./brief";
import type { BriefSave, BriefView } from "./brief-view";
import { setPlanPace } from "./plan";
import { runTripAction, type TripActionOutcome } from "./trip-action";

// Reading and saving the trip brief of Quick plan (PRD 11). The brief has no
// table of its own: a save writes the trip's facts (Trips) and its taste for
// this trip (Memory) in one action. It never touches the personal profile
// (TB-QPL-03).

/** The trip's brief as it stands, or null when the trip is not the traveller's. */
export async function loadBrief(
  userId: string,
  tripId: string,
): Promise<BriefView | null> {
  const trip = await getTrip(userId, tripId);
  if (!trip) return null;
  const [profile, tripTaste, said] = await Promise.all([
    readProfile(db, userId),
    readTripTaste(db, tripId),
    readTripSaid(db, tripId),
  ]);
  return briefOf(
    trip,
    tasteInUse(profile.entries, tripTaste),
    profile.entries,
    said,
  );
}

/** Saves one step of the brief as one replay-safe action (TB-QPL-04). */
export async function saveBrief(input: {
  userId: string;
  tripId: string;
  control: { operationId: string; expectedRevision: number };
  save: BriefSave;
}): Promise<TripActionOutcome<{ saved: true }>> {
  const { userId, tripId, save } = input;
  const trip = await getTrip(userId, tripId);
  return runTripAction<{ saved: true }>({
    userId,
    tripId,
    kind: "brief_save",
    control: input.control,
    request: save,
    apply: async (tx) => {
      const refused = await findEditable(tx, userId, tripId);
      if (refused) return refused;

      for (const topic of TASTE_TOPICS) {
        const values = save.style?.[topic];
        if (!values) continue;
        await saveTripAnswer(
          tx,
          tripId,
          topic,
          values.length > 0 ? { values, source: "told" } : null,
          "brief",
        );
      }
      // As in conversation, the plan follows the pace the trip now goes by:
      // the one just answered, or the remembered one when it was taken away.
      if (save.style?.pace && trip) {
        const [profile, taste] = [
          await readProfile(tx, userId),
          await readTripTaste(tx, tripId),
        ];
        const inUse = tasteInUse(profile.entries, taste).pace?.values[0];
        const pace = PACES.find((item) => item === inUse);
        if (pace) await setPlanPace(tx, trip, userId, pace);
      }
      if (save.facts) {
        const saved = await saveTripFacts(tx, userId, tripId, save.facts);
        if (typeof saved === "string") return saved;
      }
      if (save.said !== undefined) await saveTripSaid(tx, tripId, save.said);
      return { saved: true };
    },
  });
}
