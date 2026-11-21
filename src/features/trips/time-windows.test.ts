import { describe, expect, it } from "vitest";

import {
  commitmentInputSchema,
  windowOf,
  windowWords,
  type TimeWindow,
} from "./contracts";

const base = {
  kind: "STAY",
  title: "Hotel Avenida",
  date: "2027-05-10",
};
const parse = (over: object) =>
  commitmentInputSchema.safeParse({ ...base, ...over });

describe("time shapes", () => {
  it("needs the times its shape reads from", () => {
    expect(parse({ timeShape: "AFTER", startTime: "15:00" }).success).toBe(
      true,
    );
    expect(parse({ timeShape: "AFTER" }).success).toBe(false);
    expect(parse({ timeShape: "ANY" }).success).toBe(true);
    expect(parse({ timeShape: "ANY", startTime: "10:00" }).success).toBe(false);
    expect(
      parse({ timeShape: "BETWEEN", startTime: "10:00", endTime: "12:00" })
        .success,
    ).toBe(true);
    expect(
      parse({ timeShape: "BETWEEN", startTime: "12:00", endTime: "10:00" })
        .success,
    ).toBe(false);
  });

  it("lets a stay keep its check-out beside an 'after' check-in", () => {
    const stay = parse({
      timeShape: "AFTER",
      startTime: "15:00",
      endDate: "2027-05-12",
      endTime: "11:00",
    });
    expect(stay.success).toBe(true);
    expect(
      parse({
        kind: "RESERVATION",
        timeShape: "AFTER",
        startTime: "15:00",
        endDate: "2027-05-12",
      }).success,
    ).toBe(false);
  });

  it("is not for a ticket, and a set time stays the default", () => {
    expect(
      parse({
        kind: "TRANSPORT",
        transportMode: "TRAIN",
        timeShape: "ANY",
      }).success,
    ).toBe(false);
    const set = parse({ startTime: "15:00" });
    expect(set.success && set.data.timeShape).toBeNull();
  });

  it("words each shape as the design does", () => {
    const words = (shape: TimeWindow["shape"], kind = "STAY", from = "10:00") =>
      windowWords(
        { kind: kind as "STAY", title: "Hire car" },
        {
          shape,
          from: shape === "AFTER" || shape === "BETWEEN" ? from : null,
          to:
            shape === "BEFORE" ? "11:00" : shape === "BETWEEN" ? "12:00" : null,
        },
      );
    expect(words("AFTER", "STAY", "15:00").title).toBe("Check in from 15:00");
    expect(words("BEFORE").title).toBe("Check out by 11:00");
    expect(words("ANY", "OTHER")).toEqual({
      title: "Hire car",
      note: "Any time today",
    });
    expect(words("BETWEEN", "OTHER").title).toBe(
      "Hire car between 10:00 and 12:00",
    );
    expect(
      windowOf({
        kind: "OTHER",
        startTime: "9:00",
        endTime: null,
        timeShape: "ANY",
      }),
    ).toEqual({ shape: "ANY", from: null, to: null });
  });
});
