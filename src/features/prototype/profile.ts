import type { ProfileEntry, ProfileTopic } from "./sample-home";

/** How sure the agent is, as dots out of three and a plain word. */
export function sureness(entry: Pick<ProfileEntry, "sureness">) {
  return {
    "I think": { dots: 1, label: "Still a guess" },
    usually: { dots: 2, label: "Fairly sure" },
    always: { dots: 3, label: "Certain" },
  }[entry.sureness];
}

/** The sentence a habit on a scale reads as, such as "A relaxed pace". */
export function habitText(scale: NonNullable<ProfileEntry["scale"]>): string {
  return scale.say.replace("{stop}", scale.stops[scale.index].toLowerCase());
}

/** The traveller said so: the entry becomes certain. */
export function confirm(entry: ProfileEntry): ProfileEntry {
  return { ...entry, sureness: "always", source: "you told me" };
}

/** The traveller moved a habit to another stop. An out-of-range stop is ignored. */
export function moveHabit(entry: ProfileEntry, index: number): ProfileEntry {
  if (!entry.scale || !entry.scale.stops[index]) return entry;
  const scale = { ...entry.scale, index };
  return confirm({ ...entry, scale, value: habitText(scale) });
}

// shortcut: keyword matching stands in for the model, replace when the agent is wired in.
const topicWords: [ProfileTopic, RegExp][] = [
  [
    "food",
    /\b(eat|food|meal|allerg|vegetarian|vegan|spicy|coffee|restaurant)/i,
  ],
  ["budget", /(budget|cheap|expensive|afford|spend|¥|\$|€|£)/i],
  ["getting around", /\b(walk|train|taxi|bus|metro|subway|stairs|lift|drive)/i],
  ["stay", /\b(hotel|hostel|room|bed|stay|sleep)/i],
  ["day shape", /\b(morning|early|late|start|wake|evening|night)/i],
  ["pace", /\b(tired|slow|rest|pace|packed|rush|break)/i],
  ["atmosphere", /\b(quiet|crowd|busy|calm|noisy|lively)/i],
];

/** Where a sentence in the traveller's own words belongs. */
export function guessTopic(text: string): ProfileTopic {
  return topicWords.find(([, words]) => words.test(text))?.[0] ?? "interests";
}
