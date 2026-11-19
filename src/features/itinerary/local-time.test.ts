import { describe, expect, it } from "vitest";

import { inZone, SERVER_ZONES } from "@/lib/in-zone";

import type { CommitmentDto } from "@/features/trips/contracts";

import { offsetAt, ticketMinutes } from "./local-time";

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

const ticket = (
  over: Partial<CommitmentDto>,
  zones: [string | null, string | null],
): CommitmentDto => ({
  id: "t",
  kind: "TRANSPORT",
  title: "Flight",
  date: "2027-06-18",
  startTime: "10:00",
  endDate: "2027-06-18",
  endTime: "13:00",
  reference: null,
  note: null,
  transport: {
    mode: "FLIGHT",
    origin: "A",
    destination: "B",
    originZone: zones[0],
    destinationZone: zones[1],
  },
  ...over,
});

describe("how long a ticket lasts", () => {
  it("is measured with the clock of each end", () => {
    // London 10:00 (UTC+1 in June) to Rome 13:00 (UTC+2): two hours, not three.
    expect(ticketMinutes(ticket({}, ["Europe/London", "Europe/Rome"]))).toBe(
      120,
    );
    // Across the date line: Tokyo 18:00 lands at Honolulu 06:30 on the same date.
    expect(
      ticketMinutes(
        ticket({ startTime: "18:00", endTime: "06:30" }, [
          "Asia/Tokyo",
          "Pacific/Honolulu",
        ]),
      ),
    ).toBe(450);
  });

  it("counts an overnight ticket and a clock change on the day", () => {
    expect(
      ticketMinutes(
        ticket(
          { startTime: "22:00", endDate: "2027-06-19", endTime: "06:00" },
          ["Europe/London", "Europe/London"],
        ),
      ),
    ).toBe(480);
    // London springs forward at 01:00 on 28 March 2027.
    expect(
      ticketMinutes(
        ticket(
          {
            date: "2027-03-28",
            endDate: "2027-03-28",
            startTime: "00:30",
            endTime: "03:30",
          },
          ["Europe/London", "Europe/London"],
        ),
      ),
    ).toBe(120);
  });

  it("is unknown when a zone or the arrival is missing", () => {
    expect(ticketMinutes(ticket({}, [null, "Europe/Rome"]))).toBeNull();
    expect(ticketMinutes(ticket({}, ["Europe/London", null]))).toBeNull();
    expect(
      ticketMinutes(
        ticket({ endTime: null }, ["Europe/London", "Europe/Rome"]),
      ),
    ).toBeNull();
    expect(
      ticketMinutes(
        ticket({ transport: null }, ["Europe/London", "Europe/Rome"]),
      ),
    ).toBeNull();
  });
});
