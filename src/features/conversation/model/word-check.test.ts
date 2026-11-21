import { describe, expect, it } from "vitest";

import { checkWording, type WordingCheck } from "./word-check";

const TEMPLATE = "It is about a {minutes}-minute {means} from {from}.";

describe("checkWording", () => {
  it("accepts a version that keeps the gaps and adds no fact", () => {
    expect(
      checkWording(TEMPLATE, "Roughly a {minutes}-minute {means} from {from}."),
    ).toBeNull();
  });

  it.each<[WordingCheck, string]>([
    ["gaps", "It is a {minutes}-minute {means}."],
    ["gaps", "About {minutes}-minute {minutes} {means} from {from}."],
    ["gaps", "It is a {minutes}-minute {means} from {where}."],
    ["digit", "It is about a {minutes}-minute {means} from {from}, 5 stops."],
    ["url", "It is a {minutes}-minute {means} from {from}, see example.com."],
    ["email", "A {minutes}-minute {means} from {from}, mail a@b.org."],
    ["capital", "A {minutes}-minute {means} from {from} near Monmartre."],
    ["claim", "A quiet {minutes}-minute {means} from {from}."],
    [
      "length",
      "It is about a {minutes}-minute {means} from {from}, which is a fair way to go if you like.",
    ],
    ["alphabet", "Это {minutes}-minute {means} from {from}."],
  ])("rejects %s", (check, version) => {
    expect(checkWording(TEMPLATE, version)).toBe(check);
  });

  it("allows a sentence start and I, and what the template already says", () => {
    expect(
      checkWording(
        "I chose this quiet place, and Day 2 is free for {who}.",
        "Day 2 is free for {who}. I chose this quiet place.",
      ),
    ).toBeNull();
  });

  it("rejects a negation added or dropped", () => {
    expect(
      checkWording(
        "It is open for the whole visit.",
        "It is not open for the whole visit.",
      ),
    ).toBe("negation");
    expect(
      checkWording(
        "Its opening hours are not known, so check.",
        "Its opening hours are known, so check.",
      ),
    ).toBe("negation");
    expect(
      checkWording(
        "Its opening hours are not known, so check.",
        "Its opening hours are unknown, so check.",
      ),
    ).toBeNull();
    expect(
      checkWording(
        "It does not say whether it opens.",
        "It doesn't say whether it opens.",
      ),
    ).toBeNull();
  });

  it("rejects gaps in another order", () => {
    const from = "A walk from {a} to {b}.";
    expect(checkWording(from, "A walk to {a} from {b}.")).toBe("gaps");
    expect(checkWording(from, "Walk from {a} to {b}.")).toBeNull();
  });

  it("rejects a spelled-out number the template lacks", () => {
    expect(
      checkWording(
        "It is open for the whole visit.",
        "It is open for the whole visit, twenty minutes.",
      ),
    ).toBe("number");
    expect(
      checkWording("It is open once a day.", "Once a day it is open."),
    ).toBeNull();
  });

  it("compares digits, capitals and claims as whole tokens", () => {
    expect(checkWording("Open from 12 on.", "Open from 12 on, 2 days.")).toBe(
      "digit",
    );
    expect(checkWording("Open from 12 on.", "Open on from 12.")).toBeNull();
    expect(checkWording("See Rome now.", "Now see Rome and Ro.")).toBe(
      "capital",
    );
    expect(checkWording("A bestseller read.", "A best read.")).toBe("claim");
    expect(checkWording("Mail a@b.org now.", "Mail xa@b.org now.")).toBe(
      "email",
    );
    expect(checkWording("See ex.com now.", "See ex.com.au now.")).toBe("url");
  });
});
