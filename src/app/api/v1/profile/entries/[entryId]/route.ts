import { z } from "zod";

import { changeEntry, loadProfile, removeEntry } from "@/use-cases/profile";

import { json, readBody, withUser } from "../../../respond";

type Context = { params: Promise<{ entryId: string }> };

const bodySchema = z.object({ value: z.string().trim().min(1).max(80) });

/** Changes an entry's value, or confirms it when the value is the same. */
export const PATCH = withUser<Context>(async (userId, request, context) => {
  const { entryId } = await context.params;
  const body = await readBody(request, bodySchema);
  if ("response" in body) return body.response;
  const changed = await changeEntry(userId, entryId, body.data.value);
  if (changed === "not_found") return json({ error: "not_found" }, 404);
  if (changed === "invalid") return json({ error: "invalid_value" }, 422);
  return json({ entry: changed, profile: await loadProfile(userId) });
});

/** Removes an entry. A learned one is not learned again from the same trips. */
export const DELETE = withUser<Context>(async (userId, _request, context) => {
  const { entryId } = await context.params;
  const removed = await removeEntry(userId, entryId);
  return removed === "not_found"
    ? json({ error: "not_found" }, 404)
    : json({ profile: await loadProfile(userId) });
});
