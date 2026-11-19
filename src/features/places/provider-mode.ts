// Which place source the product uses. `PLACE_PROVIDER_MODE=mock` (or the
// QA setting of the same meaning) selects the sample places; anything else,
// or nothing, selects the real provider.

/** True when the sample places stand in for the real provider. */
export function usesSamplePlaces(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const mode = env.PLACE_PROVIDER_MODE ?? env.QA_PROVIDER_MODE ?? "";
  return mode.trim().toLowerCase() === "mock";
}
