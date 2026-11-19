import {
  removeTrip,
  renameTrip,
  saveTripFacts,
  setPlanFinished,
  setTripArchived,
} from "@/features/trips";
import { tripActionSchema } from "@/features/trips/contracts";
import { learnQuietly } from "@/use-cases/learning";
import { changePlanningMode } from "@/use-cases/planning-mode";
import { runTripAction } from "@/use-cases/trip-action";

import { json, outcomeResponse, readBody, withUser } from "../../respond";

type Context = { params: Promise<{ tripId: string }> };

/** One change to a trip: rename, facts, archive, restore, finish, reopen or the way it is planned. */
export const PATCH = withUser<Context>(async (userId, request, context) => {
  const { tripId } = await context.params;
  const body = await readBody(request, tripActionSchema);
  if ("response" in body) return body.response;

  const { operationId, expectedRevision, ...change } = body.data;
  const run = <T extends object>(
    kind: Parameters<typeof runTripAction>[0]["kind"],
    apply: Parameters<typeof runTripAction<T>>[0]["apply"],
  ) =>
    runTripAction<T>({
      userId,
      tripId,
      kind,
      control: { operationId, expectedRevision },
      request: change,
      apply,
    });

  switch (change.action) {
    case "rename":
      return outcomeResponse(
        await run("trip_rename", (tx) =>
          renameTrip(tx, userId, tripId, change.title),
        ),
      );
    case "facts":
      return outcomeResponse(
        await run("trip_facts_save", (tx) =>
          saveTripFacts(tx, userId, tripId, change.facts),
        ),
      );
    case "archive": {
      const outcome = await run("trip_archive", (tx) =>
        setTripArchived(tx, userId, tripId, true),
      );
      // A repeated archive finds the trip already archived: that is the result asked for.
      if (outcome.status === "archived") {
        return json({ data: { archived: true } });
      }
      return outcomeResponse(outcome);
    }
    case "restore":
      return outcomeResponse(
        await run("trip_restore", (tx) =>
          setTripArchived(tx, userId, tripId, false),
        ),
      );
    case "finish":
    case "reopen": {
      const finished = change.action === "finish";
      const outcome = await run(
        finished ? "trip_plan_finish" : "trip_plan_reopen",
        (tx) => setPlanFinished(tx, userId, tripId, finished),
      );
      // A trip counts toward what the site learns once its plan is finished,
      // and stops counting when it is reopened (PRD 12.4).
      if (outcome.status === "ok") await learnQuietly(userId);
      return outcomeResponse(outcome);
    }
    case "mode":
      return outcomeResponse(
        await run("trip_mode_set", (tx) =>
          changePlanningMode(tx, userId, tripId, change.planningMode),
        ),
      );
  }
});

/** Deletes a trip for good. Repeating it answers 404, which a client may treat as done. */
export const DELETE = withUser<Context>(async (userId, _request, context) => {
  const { tripId } = await context.params;
  if (!(await removeTrip(userId, tripId))) {
    return json({ error: "not_found" }, 404);
  }
  // A deleted trip no longer counts toward what the site has learned.
  await learnQuietly(userId);
  return new Response(null, { status: 204 });
});
