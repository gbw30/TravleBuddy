import { describe, expect, it } from "vitest";

import { checkWording, type WordingCheck } from "./word-check";

const TEMPLATE = "It is about a {minutes}-minute {means} from {from}.";

describe("checkWording", () => {
  it("accepts a version that keeps the gaps and adds no fact", () => {
    expect(
      checkWording(TEMPLATE, "From {from}, it is a {minutes}-minute {means}."),
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
});
