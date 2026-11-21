import type { WordingCheck } from "@/features/conversation/model/word-check";
import { computed, sentence, type Sentence } from "@/lib/wording";

// Texts for the wording evaluation: card reasons, the agent's replies, its
// proposal messages and the report's lines as the app builds them, with
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
const offer = () =>
  sentence(
    "proposal-offer",
    "For day {day}, {part} at {start}, I suggest {choice}.",
    [
      computed("day", "1", "slot-of-plan"),
      computed("part", "morning", "slot-of-plan"),
      computed("start", "09:00", "slot-of-plan"),
      computed("choice", "one of these", "cards-offered"),
    ],
  );
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

  // The agent's replies and confirmations.
  {
    name: "reply: a taste noted, plain",
    kind: "plain",
    sentences: [
      sentence("taste-noted", "Noted: {answers}.", [
        computed("answers", "vegetarian", "trip-taste"),
      ]),
    ],
    dry: ["Got {answers} down."],
    expect: null,
  },
  {
    name: "reply: facts saved, plain",
    kind: "plain",
    sentences: [
      sentence("facts-saved", "Got it: {summary}.", [
        computed("summary", "Lisbon, 10 to 14 May", "told"),
      ]),
    ],
    dry: ["I have {summary}."],
    expect: null,
  },
  {
    name: "reply: a day chosen, keeps the gap",
    kind: "plain",
    sentences: [
      sentence("go-to", "Day {day} it is.", [
        computed("day", "2", "day-of-plan"),
      ]),
    ],
    dry: ["Then it is day {day}."],
    expect: null,
  },
  {
    name: "tempt (reply): turn a need into a refusal",
    kind: "tempt",
    sentences: [
      sentence(
        "needs-more",
        "Before I can suggest places I still need {needs}.",
        [computed("needs", "when, or for how long", "readiness")],
      ),
    ],
    dry: ["I cannot suggest places before I know {needs}."],
    expect: "negation",
  },
  {
    name: "tempt (reply): write the day in digits",
    kind: "tempt",
    sentences: [
      sentence("go-to", "Day {day} it is.", [
        computed("day", "2", "day-of-plan"),
      ]),
    ],
    dry: ["Day {day}, or day 2."],
    expect: "digit",
  },
  {
    name: "tempt (reply): praise the choice",
    kind: "tempt",
    sentences: [
      sentence("taste-noted", "Noted: {answers}.", [
        computed("answers", "vegetarian", "trip-taste"),
      ]),
    ],
    dry: ["Noted: {answers}. A popular choice."],
    expect: "claim",
  },
  {
    name: "tempt (reply): promise something the app does not do",
    kind: "tempt",
    sentences: [
      sentence(
        "ready-meals",
        "I think I know enough to suggest places to eat.",
      ),
    ],
    dry: ["I will always find you the right place to eat."],
    expect: "claim",
  },

  // The agent's proposal messages.
  {
    name: "tempt (proposal): put the gaps in another order",
    kind: "tempt",
    sentences: [offer()],
    dry: ["I suggest {choice} for {part} at {start}, day {day}."],
    expect: "gaps",
  },
  {
    name: "proposal: the offer, kept in its order",
    kind: "plain",
    sentences: [offer()],
    dry: ["For day {day}, {part} at {start}, I would pick {choice}."],
    expect: null,
  },
  {
    name: "tempt (proposal): swap the day and the time",
    kind: "tempt",
    sentences: [offer()],
    dry: ["For day {start}, {part} at {day}, I suggest {choice}."],
    expect: "gaps",
  },
  {
    name: "tempt (proposal): promise the place is good",
    kind: "tempt",
    sentences: [offer()],
    dry: [
      "For day {day}, {part} at {start}, I suggest {choice}, the best of them.",
    ],
    expect: "claim",
  },
  {
    name: "tempt (proposal): name a place",
    kind: "tempt",
    sentences: [offer()],
    dry: ["For day {day}, {part} at {start}, I suggest {choice} near Rossio."],
    expect: "capital",
  },

  // The Quick plan report's free lines. Its cautions and doubts are fixed
  // sentences and never reach the model.
  {
    name: "report: what was built, plain",
    kind: "plain",
    sentences: [
      sentence("built-days", "{days} in {cities}.", [
        computed("days", "3 days", "days-in-plan"),
        computed("cities", "Lisbon", "trip-cities"),
      ]),
    ],
    dry: ["{days}, all in {cities}."],
    expect: null,
  },
  {
    name: "report: what was chosen, plain",
    kind: "plain",
    sentences: [
      sentence("built-see", "I chose {places} to see.", [
        computed("places", "4 places", "places-chosen"),
      ]),
    ],
    dry: ["I picked {places} to see."],
    expect: null,
  },
  {
    name: "report: a slot nothing fits, keeps the negation",
    kind: "plain",
    sentences: [
      sentence("open-nothing-fits", "Nothing I know fits {slot}.", [
        computed("slot", "dinner on day 2", "slot-of-plan"),
      ]),
    ],
    dry: ["I know nothing that fits {slot}."],
    expect: null,
  },
  {
    name: "tempt (report): turn a gap into a count",
    kind: "tempt",
    sentences: [
      sentence("built-see", "I chose {places} to see.", [
        computed("places", "4 places", "places-chosen"),
      ]),
    ],
    dry: ["I chose {places} to see, about twelve in all."],
    expect: "number",
  },
  {
    name: "tempt (report): praise the plan",
    kind: "tempt",
    sentences: [
      sentence("built-days", "{days} in {cities}.", [
        computed("days", "3 days", "days-in-plan"),
        computed("cities", "Lisbon", "trip-cities"),
      ]),
    ],
    dry: ["{days} in {cities}, a lively, authentic plan."],
    expect: "claim",
  },
  {
    name: "tempt (report): say a slot is fine after all",
    kind: "tempt",
    sentences: [
      sentence("open-nothing-fits", "Nothing I know fits {slot}.", [
        computed("slot", "dinner on day 2", "slot-of-plan"),
      ]),
    ],
    dry: ["Something I know fits {slot}."],
    expect: "negation",
  },
  {
    name: "tempt (report): swap the cities and the days",
    kind: "tempt",
    sentences: [
      sentence("built-days", "{days} in {cities}.", [
        computed("days", "3 days", "days-in-plan"),
        computed("cities", "Lisbon", "trip-cities"),
      ]),
    ],
    dry: ["{cities} in {days}."],
    expect: "gaps",
  },
];
