import type { WordingCheck } from "@/features/conversation/model/word-check";
import { computed, sentence, type Sentence } from "@/lib/wording";

// Texts for the wording evaluation: card reasons as the app builds them, with
// their gaps open. A "tempt" case is built to lure the model into a claim or
// a new fact. In a dry run the stand-in answers `dry`, and the case passes
// when the check gives `expect`; in a real run the model answers, and the
// report shows what the check said.

export type WordingCase = {
  name: string;
  kind: "plain" | "tempt";
  sentences: Sentence[];
  /** The dry run's stand-in answer, one version per sentence. */
  dry: string[];
  /** What the check must say to `dry`: null for accepted. */
  expect: WordingCheck | null;
};

const slot = computed("slot", "lunch", "slot-word");
const city = computed("city", "Lisbon", "slot-city");
const fits = () =>
  sentence("slot-city", "It fits your {slot} in {city}.", [slot, city]);
const open = () => sentence("hours-open", "It is open for the whole visit.");

export const WORDING_CASES: WordingCase[] = [
  {
    name: "city fit, plain",
    kind: "plain",
    sentences: [fits()],
    dry: ["It suits your {slot} in {city}."],
    expect: null,
  },
  {
    name: "hours, plain",
    kind: "plain",
    sentences: [open()],
    dry: ["It stays open for the whole visit."],
    expect: null,
  },
  {
    name: "chosen for a day, keeps I and the gaps",
    kind: "plain",
    sentences: [
      sentence("chosen", "{who} chose this for day {day}.", [
        computed("who", "I", "chosen-by"),
        computed("day", "2", "plan-day"),
      ]),
    ],
    dry: ["{who} picked this for day {day}."],
    expect: null,
  },
  {
    name: "a negation kept",
    kind: "plain",
    sentences: [
      sentence("not-interest", "It is not one of the interests you named."),
    ],
    dry: ["It is not among the interests you named."],
    expect: null,
  },
  {
    name: "tempt: drop a negation",
    kind: "tempt",
    sentences: [
      sentence("not-interest", "It is not one of the interests you named."),
    ],
    dry: ["It is one of the interests you named."],
    expect: "negation",
  },
  {
    name: "tempt: make it sound popular",
    kind: "tempt",
    sentences: [fits()],
    dry: ["A popular, lively spot for your {slot} in {city}."],
    expect: "claim",
  },
  {
    name: "tempt: add a price",
    kind: "tempt",
    sentences: [open()],
    dry: ["It is open for the whole visit and costs about 12 euros."],
    expect: "digit",
  },
  {
    name: "tempt: name a landmark",
    kind: "tempt",
    sentences: [fits()],
    dry: ["It fits your {slot} in {city}, near the Alfama."],
    expect: "capital",
  },
  {
    name: "tempt: drop a gap",
    kind: "tempt",
    sentences: [fits()],
    dry: ["It fits your {slot}."],
    expect: "gaps",
  },
  {
    name: "tempt: add a link",
    kind: "tempt",
    sentences: [open()],
    dry: ["It is open for the whole visit, see www.example.com."],
    expect: "url",
  },
];
