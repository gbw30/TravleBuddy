import { describe, expect, it } from "vitest";

import {
  isMealKind,
  kindFromOsmTags,
  kindLabel,
  PLACE_KINDS,
  visitMinutes,
} from "./kinds";
import { isOpenFor, parseOpeningHours } from "./opening-hours";
import { distanceKm, travelEstimate } from "./travel";

describe("kinds of place", () => {
  it("reads the kind from OpenStreetMap tags, most specific first", () => {
    const cases: [Record<string, string>, string | null][] = [
      [{ tourism: "museum" }, "museum"],
      [{ tourism: "gallery" }, "museum"],
      [{ amenity: "place_of_worship", religion: "shinto" }, "temple"],
      // A temple that is also a listed attraction is still a temple.
      [{ amenity: "place_of_worship", tourism: "attraction" }, "temple"],
      [{ tourism: "viewpoint" }, "viewpoint"],
      [{ amenity: "marketplace" }, "market"],
      [{ amenity: "restaurant", cuisine: "sushi" }, "restaurant"],
      [{ amenity: "cafe" }, "cafe"],
      [{ amenity: "pub" }, "bar"],
      [{ tourism: "aquarium" }, "activity"],
      [{ leisure: "garden" }, "park"],
      [{ historic: "castle" }, "sight"],
      [{ tourism: "attraction" }, "sight"],
      [{ amenity: "bank" }, null],
      [{}, null],
    ];
    for (const [tags, kind] of cases) {
      expect(kindFromOsmTags(tags), JSON.stringify(tags)).toBe(kind);
    }
  });

  it("gives every kind a label and a standard visit length", () => {
    for (const kind of PLACE_KINDS) {
      expect(kindLabel(kind)).not.toBe("");
      expect(visitMinutes(kind)).toBeGreaterThanOrEqual(30);
    }
    expect(visitMinutes("museum")).toBe(120);
    expect(isMealKind("restaurant")).toBe(true);
    expect(isMealKind("museum")).toBe(false);
  });
});

describe("parseOpeningHours", () => {
  it("reads day ranges, lists, several periods and closed days", () => {
    const week = parseOpeningHours(
      "Mo-Fr 09:00-12:00,13:00-17:00; Sa,Su 10:00-14:00; We off",
    );
    expect(week).toEqual([
      [
        [540, 720],
        [780, 1020],
      ],
      [
        [540, 720],
        [780, 1020],
      ],
      [],
      [
        [540, 720],
        [780, 1020],
      ],
      [
        [540, 720],
        [780, 1020],
      ],
      [[600, 840]],
      [[600, 840]],
    ]);
  });

  it("reads 24/7, hours for every day, and a week that wraps round", () => {
    expect(parseOpeningHours("24/7")?.every((day) => day[0][1] === 1440)).toBe(
      true,
    );
    expect(parseOpeningHours("10:00-18:00")?.[6]).toEqual([[600, 1080]]);
    const weekend = parseOpeningHours("Sa-Mo 11:00-15:00");
    expect(weekend?.map((day) => day.length)).toEqual([1, 0, 0, 0, 0, 1, 1]);
  });

  it("keeps hours that run past midnight", () => {
    expect(parseOpeningHours("Fr 22:00-02:00")?.[4]).toEqual([[1320, 1560]]);
  });

  it("answers unknown for no text and for anything it cannot read", () => {
    const unreadable = [
      null,
      undefined,
      "",
      "  ",
      "Mo-Fr 09:00-17:00; PH off",
      "sunrise-sunset",
      "Apr-Oct: Mo-Su 10:00-18:00",
      'Mo-Fr 09:00-17:00 "by appointment"',
      "Mo-Fr 09:00-17:00+",
      "Mo-Fr 25:00-26:00",
      "open",
    ];
    for (const text of unreadable) {
      expect(parseOpeningHours(text), String(text)).toBeNull();
    }
  });
});

describe("isOpenFor", () => {
  const museum = parseOpeningHours("Tu-Su 09:30-17:00; Mo off");
  // 10 May 2027 is a Monday.

  it("is open only when the whole visit fits", () => {
    expect(isOpenFor(museum, "2027-05-11", "09:30", 120)).toBe("open");
    expect(isOpenFor(museum, "2027-05-11", "15:00", 120)).toBe("open");
    expect(isOpenFor(museum, "2027-05-11", "15:01", 120)).toBe("closed");
    expect(isOpenFor(museum, "2027-05-11", "09:00", 60)).toBe("closed");
  });

  it("is closed on a day marked off", () => {
    expect(isOpenFor(museum, "2027-05-10", "11:00", 60)).toBe("closed");
  });

  it("follows a bar's hours past midnight into the next day", () => {
    const bar = parseOpeningHours("Fr,Sa 20:00-03:00");
    expect(isOpenFor(bar, "2027-05-14", "23:00", 120)).toBe("open");
    // Saturday 01:00 is still Friday night's opening.
    expect(isOpenFor(bar, "2027-05-15", "01:00", 90)).toBe("open");
    expect(isOpenFor(bar, "2027-05-15", "02:30", 60)).toBe("closed");
    // Monday 01:00 follows a closed Sunday.
    expect(isOpenFor(bar, "2027-05-17", "01:00", 30)).toBe("closed");
  });

  it("is unknown without readable hours, never assumed open", () => {
    expect(isOpenFor(null, "2027-05-11", "10:00", 60)).toBe("unknown");
    expect(isOpenFor(museum, "2027-05-11", "soon", 60)).toBe("unknown");
    expect(isOpenFor(museum, "not a date", "10:00", 60)).toBe("unknown");
  });
});

describe("travelEstimate", () => {
  const sensoji = { latitude: 35.7148, longitude: 139.7967 };
  const skytree = { latitude: 35.7101, longitude: 139.8107 };
  const shibuya = { latitude: 35.658, longitude: 139.7016 };

  it("measures the straight line", () => {
    expect(distanceKm(sensoji, skytree)).toBeCloseTo(1.37, 1);
    expect(distanceKm(sensoji, sensoji)).toBe(0);
  });

  it("walks a short hop and takes transit further, always as an estimate", () => {
    expect(travelEstimate(sensoji, skytree)).toEqual({
      means: "walk",
      minutes: 22,
      estimated: true,
    });
    const far = travelEstimate(sensoji, shibuya);
    expect(far.means).toBe("transit");
    expect(far.minutes).toBeGreaterThan(40);
    expect(far.minutes).toBeLessThan(60);
  });

  it("uses the traveller's means when given, and never says zero minutes", () => {
    expect(travelEstimate(sensoji, shibuya, "walk").minutes).toBeGreaterThan(
      150,
    );
    expect(travelEstimate(sensoji, sensoji, "walk").minutes).toBe(1);
  });

  it("gives the same answer every time", () => {
    expect(travelEstimate(sensoji, shibuya)).toEqual(
      travelEstimate(sensoji, shibuya),
    );
  });
});
