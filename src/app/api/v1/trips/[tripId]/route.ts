import {
  removeTrip,
  renameTrip,
  saveTripFacts,
  setPlanFinished,
  setTripArchived,
} from "@/features/trips";
import { tripActionSchema } from "@/features/trips/contracts";
import { runTripAction } from "@/use-cases/trip-action";

import { json, outcomeResponse, readBody, withUser } from "../../respond";

type Context = { params: Promise<{ tripId: string }> };

/** One change to a trip: rename, facts, archive, restore, finish or reopen. */
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
      return outcomeResponse(
        await run(finished ? "trip_plan_finish" : "trip_plan_reopen", (tx) =>
          setPlanFinished(tx, userId, tripId, finished),
        ),
      );
    }
  }
});

/** Deletes a trip for good. Repeating it answers 404, which a client may treat as done. */
export const DELETE = withUser<Context>(async (userId, _request, context) => {
  const { tripId } = await context.params;
  return (await removeTrip(userId, tripId))
    ? new Response(null, { status: 204 })
    : json({ error: "not_found" }, 404);
});
