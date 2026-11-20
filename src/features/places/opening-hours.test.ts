import { describe, expect, it } from "vitest";

import { hoursDoubt } from "./opening-hours";

const today = "2027-05-11";
const osm = (over: Partial<Parameters<typeof hoursDoubt>[0]> = {}) => ({
  origin: "OSM" as const,
  openingHours: "Mo-Su 09:00-18:00",
  tags: {},
  lastEditedAt: null,
  ...over,
});

describe("hoursDoubt", () => {
  it("is null when the hours were checked within a year", () => {
    expect(
      hoursDoubt(
        osm({
          tags: { "check_date:opening_hours": "2027-01-10" },
          // The hours' own date wins over an old edit.
          lastEditedAt: "2019-01-01T00:00:00.000Z",
        }),
        today,
      ),
    ).toBeNull();
  });

  it("names the year of an old check_date", () => {
    expect(hoursDoubt(osm({ tags: { check_date: "2021-03-01" } }), today)).toBe(
      "Last updated on the map in 2021. Worth a check.",
    );
  });

  it("reads a year and month as the first of that month, so a stale check is not hidden by a newer edit", () => {
    for (const tags of [
      { check_date: "2021-03" },
      { "check_date:opening_hours": "2021-03" },
    ] as Record<string, string>[]) {
      expect(
        hoursDoubt(
          osm({ tags, lastEditedAt: "2027-04-01T10:00:00.000Z" }),
          today,
        ),
      ).toBe("Last updated on the map in 2021. Worth a check.");
    }
    expect(hoursDoubt(osm({ tags: { check_date: "2027-01" } }), today)).toBe(
      null,
    );
  });

  it("falls back to the edit time, and names its year when two years old", () => {
    expect(
      hoursDoubt(osm({ lastEditedAt: "2025-02-03T10:00:00.000Z" }), today),
    ).toBe("Last updated on the map in 2025. Worth a check.");
    expect(
      hoursDoubt(osm({ lastEditedAt: "2026-09-03T10:00:00.000Z" }), today),
    ).toBeNull();
  });

  it("says no one knows when there is no date at all", () => {
    expect(hoursDoubt(osm(), today)).toBe(
      "Not known when these hours were last checked. Worth a check.",
    );
  });

  it("says the hours are not known when absent or unreadable", () => {
    const line = "Hours not known. Check before you go.";
    expect(hoursDoubt(osm({ openingHours: null }), today)).toBe(line);
    expect(hoursDoubt(osm({ openingHours: "sunrise-sunset" }), today)).toBe(
      line,
    );
  });

  it("leaves a sample or own place with hours alone", () => {
    expect(hoursDoubt(osm({ origin: "SAMPLE" }), today)).toBeNull();
    expect(hoursDoubt(osm({ origin: "USER" }), today)).toBeNull();
  });
});
