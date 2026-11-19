import { describe, expect, it } from "vitest";

import { inZone, SERVER_ZONES } from "@/lib/in-zone";

import { dateRange, dayLabel } from "./format";

// These run in the traveller's browser, whose clock may be anywhere.
describe("a date on the screen (TB-ITN-16)", () => {
  it("is the date of the place, whatever clock the reader's device keeps", () => {
    for (const zone of SERVER_ZONES) {
      inZone(zone, () => {
        expect(dayLabel("2027-05-10"), zone).toBe("Mon 10 May 2027");
        // The Sunday the clocks change in London, and the one in New York.
        expect(dayLabel("2027-03-28"), zone).toBe("Sun 28 Mar 2027");
        expect(dayLabel("2027-11-07"), zone).toBe("Sun 7 Nov 2027");
        expect(dayLabel("2027-12-31"), zone).toBe("Fri 31 Dec 2027");
        expect(dateRange("2027-03-26", "2027-03-30"), zone).toBe(
          "26–30 Mar 2027",
        );
        expect(dateRange("2027-12-30", "2028-01-02"), zone).toBe(
          "30 Dec 2027 – 2 Jan 2028",
        );
      });
    }
  });
});
