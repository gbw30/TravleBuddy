import { forgetEverything, loadProfile } from "@/use-cases/profile";

import { json, withUser } from "../respond";

/** The signed-in traveller's personal profile. */
export const GET = withUser(async (userId) =>
  json({ profile: await loadProfile(userId) }),
);

/** Forgets everything. Past trips do not teach the profile back. */
export const DELETE = withUser(async (userId) => {
  await forgetEverything(userId);
  return json({ profile: await loadProfile(userId) });
});
