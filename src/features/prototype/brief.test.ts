import { describe, expect, it } from "vitest";

import {
  briefSummary,
  canBuild,
  emptyBrief,
  prefillFromProfile,
  validateBrief,
  type Brief,
} from "./brief";
import type { ProfileEntry } from "./sample-home";

const step1: Brief = {
  ...emptyBrief(),
  cities: [{ name: "Tokyo", nights: 3 }],
  startDate: "2027-05-10",
  travellers: 1,
};

describe("trip brief", () => {
  it("needs only the first step to build", () => {
    expect(canBuild(emptyBrief())).toBe(false);
    expect(canBuild(step1)).toBe(true);
  });

  it("explains an end date before the start date", () => {
    const errors = validateBrief({ ...step1, endDate: "2027-05-01" });
    expect(errors.endDate).toBe("The end date is before the start date.");
    expect(canBuild({ ...step1, endDate: "2027-05-01" })).toBe(false);
  });

  it("rejects zero travellers and zero nights", () => {
    expect(validateBrief({ ...step1, travellers: 0 }).travellers).toBe(
      "At least one traveller is needed.",
    );
    expect(
      validateBrief({ ...step1, cities: [{ name: "Tokyo", nights: 0 }] })
        .cities,
    ).toBe("Each city needs at least one night.");
  });

  it("summarises in plain sentences and says what will be assumed", () => {
    const lines = briefSummary(step1);
    expect(lines).toContain("3 nights in Tokyo.");
    expect(lines.some((line) => line.startsWith("Pace:"))).toBe(true);
  });

  it("prefills empty answers from the profile and names the source", () => {
    const entries: ProfileEntry[] = [
      {
        topic: "pace",
        value: "relaxed",
        kind: "taste",
        sureness: "usually",
        source: "from your Kyoto trip",
      },
    ];
    const { brief, sources } = prefillFromProfile(step1, entries);
    expect(brief.pace).toBe("relaxed");
    expect(sources.pace).toBe("from your Kyoto trip");
    expect(
      prefillFromProfile({ ...step1, pace: "packed" }, entries).brief.pace,
    ).toBe("packed");
  });
});
