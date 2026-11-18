import { z } from "zod";

import { loadProfile, tellProfile } from "@/use-cases/profile";

import { json, readBody, withUser } from "../../respond";

const bodySchema = z.object({
  text: z.string().trim().min(1).max(300),
  /** The traveller says it is a rule never to be broken. */
  hard: z.boolean().optional(),
});

/** Something the traveller says about themselves. Answers where it was filed. */
export const POST = withUser(async (userId, request) => {
  const body = await readBody(request, bodySchema);
  if ("response" in body) return body.response;
  const filed = await tellProfile(
    userId,
    body.data.text,
    body.data.hard ?? false,
  );
  return json({ filed, profile: await loadProfile(userId) }, 201);
});
