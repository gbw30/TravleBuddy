import { describe, expect, it } from "vitest";

import { inZone, SERVER_ZONES } from "@/lib/in-zone";

import { offsetAt } from "./local-time";

const NOON = 12 * 60;

describe("how far a place's clock is from UTC", () => {
  it("is the zone's own, with half hours and both sides of the date line", () => {
    expect(offsetAt("Asia/Tokyo", "2027-05-10", NOON)).toBe(540);
    expect(offsetAt("Asia/Kolkata", "2027-05-10", NOON)).toBe(330);
    expect(offsetAt("Pacific/Honolulu", "2027-05-10", NOON)).toBe(-600);
    expect(offsetAt("Pacific/Kiritimati", "2027-05-10", NOON)).toBe(840);
    expect(offsetAt("UTC", "2027-05-10", NOON)).toBe(0);
  });

  it("follows the clock change of the place", () => {
    // London goes forward on Sunday 28 March 2027 at 01:00.
    expect(offsetAt("Europe/London", "2027-03-27", NOON)).toBe(0);
    expect(offsetAt("Europe/London", "2027-03-28", 30)).toBe(0);
    expect(offsetAt("Europe/London", "2027-03-28", 3 * 60)).toBe(60);
    expect(offsetAt("Europe/London", "2027-03-29", NOON)).toBe(60);
    // New York goes back on Sunday 7 November 2027 at 02:00.
    expect(offsetAt("America/New_York", "2027-11-06", NOON)).toBe(-240);
    expect(offsetAt("America/New_York", "2027-11-07", 30)).toBe(-240);
    expect(offsetAt("America/New_York", "2027-11-07", 3 * 60)).toBe(-300);
    expect(offsetAt("America/New_York", "2027-11-08", NOON)).toBe(-300);
  });

  it("is nothing for a place whose zone is not known", () => {
    expect(offsetAt(null, "2027-05-10", NOON)).toBe(0);
    expect(offsetAt("Not/AZone", "2027-05-10", NOON)).toBe(0);
  });

  it("does not depend on the server's clock", () => {
    for (const zone of SERVER_ZONES) {
      inZone(zone, () => {
        expect(offsetAt("Asia/Tokyo", "2027-05-10", NOON), zone).toBe(540);
        expect(offsetAt("America/New_York", "2027-11-07", 3 * 60), zone).toBe(
          -300,
        );
      });
    }
  });
});
