import { loadProfile, removeNote } from "@/use-cases/profile";

import { json, withUser } from "../../../respond";

type Context = { params: Promise<{ noteId: string }> };

/** Removes a note. */
export const DELETE = withUser<Context>(async (userId, _request, context) => {
  const { noteId } = await context.params;
  const removed = await removeNote(userId, noteId);
  return removed === "not_found"
    ? json({ error: "not_found" }, 404)
    : json({ profile: await loadProfile(userId) });
});
