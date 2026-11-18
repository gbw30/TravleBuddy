import { describe, expect, it } from "vitest";

import type { ProfileTopicInfo } from "./contracts";
import { fileUnder } from "./profile-filing";

const topic = (
  name: ProfileTopicInfo["topic"],
  choices: [string, string][],
  over: Partial<ProfileTopicInfo> = {},
): ProfileTopicInfo => ({
  topic: name,
  name,
  kind: "taste",
  several: false,
  choices: choices.map(([value, label]) => ({ value, label })),
  freeText: false,
  ...over,
});
const topics = [
  topic("pace", [
    ["relaxed", "Relaxed"],
    ["packed", "Packed"],
  ]),
  topic(
    "interests",
    [
      ["museums", "Museums and exhibitions"],
      ["nature", "Parks and nature"],
    ],
    { several: true },
  ),
  topic("getting_around", [["walk", "Mostly on foot"]]),
  topic(
    "dietary_rules",
    [
      ["vegetarian", "Vegetarian"],
      ["gluten-free", "Gluten-free"],
    ],
    { kind: "hard_limit", several: true },
  ),
  topic("allergies", [], { kind: "hard_limit", several: true, freeText: true }),
];
const file = (said: string, hard = false) => fileUnder(said, hard, topics);

describe("filing what a traveller says about themselves", () => {
  it("files a plain value under its topic, by its value or the words shown for it", () => {
    expect(file("Relaxed")).toEqual({
      type: "entry",
      topic: "pace",
      value: "relaxed",
    });
    expect(file("museums and exhibitions.")).toEqual({
      type: "entry",
      topic: "interests",
      value: "museums",
    });
    expect(file("Mostly on foot")).toEqual({
      type: "entry",
      topic: "getting_around",
      value: "walk",
    });
  });

  it("looks past a short opener", () => {
    expect(file("I'm vegetarian")).toEqual({
      type: "entry",
      topic: "dietary_rules",
      value: "vegetarian",
    });
    expect(file("I am Gluten-Free!")).toEqual({
      type: "entry",
      topic: "dietary_rules",
      value: "gluten-free",
    });
    expect(file("I prefer a relaxed")).toEqual({
      type: "entry",
      topic: "pace",
      value: "relaxed",
    });
    expect(file("We like parks and nature")).toEqual({
      type: "entry",
      topic: "interests",
      value: "nature",
    });
  });

  it("keeps a sentence that only mentions a value as a note, never as liking it", () => {
    for (const said of [
      "I get tired of museums after two hours",
      "not vegetarian",
      "A relaxed pace in the mornings and packed afternoons",
      "I hate queues",
      "I need a lift, I can't do stairs",
    ]) {
      expect(file(said), said).toEqual({ type: "note", text: said });
      expect(file(said, true), said).toEqual({ type: "note", text: said });
    }
  });

  it("files an allergy in the traveller's own words", () => {
    expect(file("I am allergic to shellfish")).toEqual({
      type: "entry",
      topic: "allergies",
      value: "shellfish",
    });
    expect(file("Allergy to tree nuts.")).toEqual({
      type: "entry",
      topic: "allergies",
      value: "tree nuts",
    });
    expect(file("peanut allergy")).toEqual({
      type: "entry",
      topic: "allergies",
      value: "peanut",
    });
  });

  it("reads a bare 'no ...' as an allergy only when it is made a rule", () => {
    expect(file("No shellfish", true)).toEqual({
      type: "entry",
      topic: "allergies",
      value: "shellfish",
    });
    expect(file("No shellfish")).toEqual({
      type: "note",
      text: "No shellfish",
    });
  });

  it("trims what it keeps, and keeps an overlong allergy as a note", () => {
    expect(file("  I hate queues  ")).toEqual({
      type: "note",
      text: "I hate queues",
    });
    const long = `allergic to ${"x".repeat(90)}`;
    expect(file(long).type).toBe("note");
  });
});
