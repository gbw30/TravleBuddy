import { describe, expect, it } from "vitest";

import {
  kindOf,
  PROFILE_TOPICS,
  profileEntrySchema,
  profileNoteSchema,
  sourceWords,
  SURENESS_WORDS,
  type ProfileEntry,
  type TasteTopic,
  type TripTaste,
} from "./contracts";
import {
  conflicts,
  learnedEntries,
  limitsInUse,
  rememberedFor,
  tasteInUse,
  type TripEvidence,
} from "./profile-rules";

const told = (topic: ProfileEntry["topic"], value: string): ProfileEntry => ({
  topic,
  value,
  sureness: "always",
  source: { type: "told" },
});
const fromTrip = (
  topic: ProfileEntry["topic"],
  value: string,
  tripTitle = "Tokyo in May",
  sureness: ProfileEntry["sureness"] = "think",
): ProfileEntry => ({
  topic,
  value,
  sureness,
  source: { type: "trip", tripId: tripTitle, tripTitle },
});
/** A finished trip named by its title, with what it showed as "topic=value". */
const trip = (
  title: string,
  finishedAt: string,
  shown: string[],
  different = false,
): TripEvidence => ({
  tripId: title,
  tripTitle: title,
  finishedAt,
  different,
  shown: shown.map((item) => {
    const [topic, value] = item.split("=");
    return { topic: topic as TasteTopic, value };
  }),
});
const tokyo = trip("Tokyo", "2027-05-14", [
  "pace=relaxed",
  "interests=museums",
  "interests=views",
]);
const lisbon = trip("Lisbon", "2027-09-02", [
  "pace=relaxed",
  "interests=museums",
]);
const rome = trip("Rome", "2028-04-20", [
  "pace=packed",
  "interests=museums",
  "interests=history",
]);
const short = (entries: ProfileEntry[]) =>
  entries.map(
    (entry) =>
      `${entry.topic}=${entry.value} (${entry.sureness}, ${entry.source.type === "trip" ? entry.source.tripTitle : "told"})`,
  );

describe("the personal profile's shapes", () => {
  it("covers the topics the requirement names, and marks only dietary rules and allergies as hard limits", () => {
    for (const topic of [
      "pace",
      "day_shape",
      "interests",
      "atmosphere",
      "food",
      "dietary_rules",
      "budget",
      "getting_around",
      "stay",
    ]) {
      expect(PROFILE_TOPICS, topic).toContain(topic);
    }
    expect(
      PROFILE_TOPICS.filter((topic) => kindOf(topic) === "hard_limit"),
    ).toEqual(["dietary_rules", "allergies"]);
  });

  it("records a value, how sure, and where it came from, and refuses a topic it does not know", () => {
    expect(profileEntrySchema.safeParse(told("pace", "relaxed")).success).toBe(
      true,
    );
    expect(
      profileEntrySchema.safeParse(fromTrip("interests", "museums")).success,
    ).toBe(true);
    expect(
      profileEntrySchema.safeParse({
        ...told("pace", "relaxed"),
        topic: "queues",
      }).success,
    ).toBe(false);
    expect(
      profileEntrySchema.safeParse({
        ...told("pace", "relaxed"),
        sureness: "certain",
      }).success,
    ).toBe(false);
    expect(profileEntrySchema.safeParse({ ...told("pace", " ") }).success).toBe(
      false,
    );
    // What fits no topic is kept as a note.
    expect(profileNoteSchema.parse({ text: " I hate queues " })).toEqual({
      text: "I hate queues",
    });
  });

  it("says sureness and source in plain words", () => {
    expect(SURENESS_WORDS).toEqual({
      think: "I think",
      usually: "usually",
      always: "always",
    });
    expect(sourceWords({ type: "told" })).toBe("you told me");
    expect(sourceWords(fromTrip("pace", "relaxed").source)).toBe(
      "from your trip “Tokyo in May”",
    );
  });
});

describe("the taste a trip goes by", () => {
  const personal = [
    fromTrip("pace", "relaxed"),
    told("interests", "museums"),
    told("interests", "views"),
  ];

  it("starts from the personal profile", () => {
    expect(tasteInUse(personal, {})).toEqual({
      pace: { values: ["relaxed"], from: "profile", entries: [personal[0]] },
      interests: {
        values: ["museums", "views"],
        from: "profile",
        entries: [personal[1], personal[2]],
      },
    });
  });

  it("uses what was said for this trip where the two differ", () => {
    const tripTaste: TripTaste = {
      pace: { values: ["packed"], source: "told" },
    };
    expect(tasteInUse(personal, tripTaste).pace).toEqual({
      values: ["packed"],
      from: "trip",
      entries: [],
    });
    expect(tasteInUse(personal, tripTaste).interests?.from).toBe("profile");
  });

  it("prefers what is remembered to the default of a skipped question, and uses the default when nothing is remembered", () => {
    const skipped: TripTaste = {
      pace: { values: ["balanced"], source: "default" },
      atmosphere: { values: ["either"], source: "default" },
    };
    const inUse = tasteInUse(personal, skipped);
    expect(inUse.pace).toMatchObject({ values: ["relaxed"], from: "profile" });
    expect(inUse.atmosphere).toEqual({
      values: ["either"],
      from: "default",
      entries: [],
    });
    expect(inUse.food).toBeUndefined();
  });

  it("answers a trip's food question from the remembered dietary rules, and ignores what is not a taste", () => {
    const personal = [
      told("dietary_rules", "vegetarian"),
      told("dietary_rules", "gluten-free"),
      told("allergies", "shellfish"),
      told("budget", "150 EUR a day"),
    ];
    expect(rememberedFor(personal, "food")).toEqual(personal.slice(0, 2));
    expect(rememberedFor(personal, "pace")).toEqual([]);
    expect(tasteInUse(personal, {})).toEqual({
      food: {
        values: ["vegetarian", "gluten-free"],
        from: "profile",
        entries: personal.slice(0, 2),
      },
    });
  });
});

describe("the hard limits a trip's proposals respect", () => {
  it("are every remembered rule and allergy, plus the rules given for this trip", () => {
    const personal = [
      told("dietary_rules", "vegetarian"),
      told("allergies", "shellfish"),
      told("pace", "relaxed"),
    ];
    expect(limitsInUse(personal, ["gluten-free", "vegetarian"])).toEqual({
      dietaryRules: ["vegetarian", "gluten-free"],
      allergies: ["shellfish"],
    });
  });

  it("are never taken away by a trip that names none", () => {
    expect(
      limitsInUse([told("dietary_rules", "halal")], ["none"]).dietaryRules,
    ).toEqual(["halal"]);
    expect(limitsInUse([], ["none"])).toEqual({
      dietaryRules: [],
      allergies: [],
    });
  });
});

describe("an answer that goes against the profile", () => {
  it("is one that shares nothing with what is remembered on the topic", () => {
    expect(conflicts(["packed"], [fromTrip("pace", "relaxed")])).toBe(true);
    expect(conflicts(["relaxed"], [fromTrip("pace", "relaxed")])).toBe(false);
    expect(
      conflicts(
        ["museums", "markets"],
        [told("interests", "museums"), told("interests", "views")],
      ),
    ).toBe(false);
    expect(conflicts(["markets"], [told("interests", "museums")])).toBe(true);
  });

  it("needs something on both sides", () => {
    expect(conflicts(["packed"], [])).toBe(false);
    expect(conflicts([], [fromTrip("pace", "relaxed")])).toBe(false);
  });
});

describe("learning from finished trips", () => {
  it("learns nothing from one trip", () => {
    expect(learnedEntries([], [tokyo], [])).toEqual([]);
  });

  it("learns a value once it shows in two ordinary trips, and names the most recent", () => {
    expect(short(learnedEntries([], [tokyo, lisbon], []))).toEqual([
      "pace=relaxed (think, Lisbon)",
      "interests=museums (think, Lisbon)",
    ]);
  });

  it("grows surer when the pattern shows again, and learns each value of a topic that holds several", () => {
    expect(short(learnedEntries([], [tokyo, lisbon, rome], []))).toEqual([
      "pace=relaxed (think, Lisbon)",
      "interests=museums (usually, Rome)",
    ]);
    const kyoto = trip("Kyoto", "2028-10-01", [
      "interests=history",
      "interests=views",
    ]);
    expect(short(learnedEntries([], [tokyo, lisbon, rome, kyoto], []))).toEqual(
      [
        "pace=relaxed (think, Lisbon)",
        "interests=museums (usually, Rome)",
        "interests=history (think, Kyoto)",
        "interests=views (think, Kyoto)",
      ],
    );
  });

  it("learns one value for a topic that holds one: the most seen, the most recent on a tie", () => {
    const packedAgain = trip("Osaka", "2028-06-01", ["pace=packed"]);
    // Relaxed twice (2027), packed twice (2028): a tie, so the more recent pattern.
    expect(
      short(learnedEntries([], [tokyo, lisbon, rome, packedAgain], [])),
    ).toContain("pace=packed (think, Osaka)");
    expect(
      short(learnedEntries([], [tokyo, lisbon, rome, packedAgain], [])).filter(
        (line) => line.startsWith("pace="),
      ),
    ).toHaveLength(1);
  });

  it("counts a trip once however often it showed a value", () => {
    const twice = trip("Tokyo", "2027-05-14", ["pace=relaxed", "pace=relaxed"]);
    expect(learnedEntries([], [twice], [])).toEqual([]);
  });

  it("learns nothing from a trip marked as different", () => {
    const honeymoon = trip(
      "Honeymoon",
      "2027-09-02",
      ["pace=relaxed", "interests=museums"],
      true,
    );
    expect(learnedEntries([], [tokyo, honeymoon], [])).toEqual([]);
    expect(short(learnedEntries([], [tokyo, honeymoon, lisbon], []))).toContain(
      "pace=relaxed (think, Lisbon)",
    );
  });

  it("never learns over what the traveller stated", () => {
    // Pace holds one value: a stated pace closes the topic.
    expect(
      short(learnedEntries([told("pace", "packed")], [tokyo, lisbon], [])),
    ).toEqual(["interests=museums (think, Lisbon)"]);
    // Interests hold several: other values may be learned beside the stated one, never the stated one again.
    expect(
      short(
        learnedEntries(
          [told("interests", "museums")],
          [tokyo, lisbon, trip("Kyoto", "2028-10-01", ["interests=views"])],
          [],
        ),
      ),
    ).toEqual([
      "pace=relaxed (think, Lisbon)",
      "interests=views (think, Kyoto)",
    ]);
  });

  it("is not stopped by an entry that was itself learned", () => {
    expect(
      short(learnedEntries([fromTrip("pace", "packed")], [tokyo, lisbon], [])),
    ).toContain("pace=relaxed (think, Lisbon)");
  });

  it("does not learn a deleted entry again from the same trips, but does from new ones", () => {
    const forgotten = [
      {
        topic: "pace" as const,
        value: "relaxed",
        tripIds: ["Tokyo", "Lisbon"],
      },
    ];
    expect(short(learnedEntries([], [tokyo, lisbon], forgotten))).toEqual([
      "interests=museums (think, Lisbon)",
    ]);
    // One new trip is not enough: the two old ones no longer count.
    const porto = trip("Porto", "2028-03-01", ["pace=relaxed"]);
    expect(
      short(learnedEntries([], [tokyo, lisbon, porto], forgotten)).filter(
        (line) => line.startsWith("pace="),
      ),
    ).toEqual([]);
    const seville = trip("Seville", "2028-05-01", ["pace=relaxed"]);
    expect(
      short(learnedEntries([], [tokyo, lisbon, porto, seville], forgotten)),
    ).toContain("pace=relaxed (think, Seville)");
  });

  it("gives the same entries whatever order the trips come in", () => {
    const forwards = learnedEntries([], [tokyo, lisbon, rome], []);
    expect(learnedEntries([], [rome, tokyo, lisbon], [])).toEqual(forwards);
  });

  it("never learns a hard limit", () => {
    const entries = learnedEntries([], [tokyo, lisbon, rome], []);
    expect(entries.every((entry) => kindOf(entry.topic) === "taste")).toBe(
      true,
    );
  });
});
