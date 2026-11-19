import { z } from "zod";

import { CURRENCIES } from "@/lib/currency";
import { loadProfile, setDailyBudget } from "@/use-cases/profile";

import { json, readBody, withUser } from "../../respond";

const bodySchema = z.object({
  amount: z.number().int().min(1).max(10_000_000),
  currency: z.enum(CURRENCIES),
});

/** Sets the traveller's usual daily budget, replacing an earlier one. */
export const PUT = withUser(async (userId, request) => {
  const body = await readBody(request, bodySchema);
  if ("response" in body) return body.response;
  const entry = await setDailyBudget(userId, body.data);
  return json({ entry, profile: await loadProfile(userId) });
});
