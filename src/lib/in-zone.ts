// Test support for TB-ITN-16: nothing a traveller sees or the site stores
// may depend on where the server's own clock is.

/** Zones far from every sample city, on both sides of the date line, and one with a half hour. */
export const SERVER_ZONES = [
  "UTC",
  "Pacific/Kiritimati",
  "Pacific/Pago_Pago",
  "America/Los_Angeles",
  "Asia/Kolkata",
  "Europe/London",
];

/** Runs something with the process clock in another time zone, then puts it back. */
export function inZone<T>(zone: string, run: () => T): T {
  const before = process.env.TZ;
  process.env.TZ = zone;
  try {
    return run();
  } finally {
    if (before === undefined) delete process.env.TZ;
    else process.env.TZ = before;
  }
}
