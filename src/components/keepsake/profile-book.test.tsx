import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ProfileTopicInfo } from "@/features/memory/contracts";
import type { ProfileView, ShownEntry } from "@/use-cases/profile-view";

import { ProfileBook, profileSentence } from "./profile-book";

const info = (
  topic: ProfileTopicInfo["topic"],
  name: string,
  choices: [string, string][],
  over: Partial<ProfileTopicInfo> = {},
): ProfileTopicInfo => ({
  topic,
  name,
  kind: "taste",
  several: false,
  choices: choices.map(([value, label]) => ({ value, label })),
  freeText: false,
  ...over,
});
const topics = [
  info("pace", "Pace", [
    ["relaxed", "Relaxed"],
    ["balanced", "Balanced"],
    ["packed", "Packed"],
  ]),
  info("day_shape", "Shape of the day", [
    ["early", "Early starts"],
    ["late", "Late nights"],
    ["neither", "Neither"],
  ]),
  info(
    "interests",
    "Interests",
    [
      ["museums", "Museums and exhibitions"],
      ["views", "Views"],
    ],
    { several: true },
  ),
  info("dietary_rules", "Dietary rules", [["vegetarian", "Vegetarian"]], {
    kind: "hard_limit",
    several: true,
  }),
  info("allergies", "Allergies", [], {
    kind: "hard_limit",
    several: true,
    freeText: true,
  }),
];
const told = (
  id: string,
  topic: ShownEntry["topic"],
  value: string,
  label = value,
): ShownEntry => ({
  id,
  topic,
  value,
  label,
  sureness: "always",
  source: { type: "told" },
});
const learned = (
  id: string,
  topic: ShownEntry["topic"],
  value: string,
  label: string,
  sureness: ShownEntry["sureness"] = "think",
): ShownEntry => ({
  id,
  topic,
  value,
  label,
  sureness,
  source: { type: "trip", tripId: "t-lisbon", tripTitle: "Lisbon in spring" },
});
const view = (over: Partial<ProfileView> = {}): ProfileView => ({
  revision: 1,
  entries: [],
  notes: [],
  topics,
  ...over,
});
const render = (initial: ProfileView, name: string | null = "Ana") =>
  renderToStaticMarkup(<ProfileBook initial={initial} name={name} />);
const count = (html: string, part: string) => html.split(part).length - 1;

describe("the profile's one-sentence picture", () => {
  it("is written from the entries: pace, the shape of the day, and the first hard limit", () => {
    expect(
      profileSentence([
        told("1", "pace", "relaxed", "Relaxed"),
        told("2", "day_shape", "late", "Late nights"),
        told("3", "allergies", "shellfish"),
      ]),
    ).toEqual(["You travel slowly", "stay out late", "never eat shellfish"]);
    expect(
      profileSentence([told("1", "dietary_rules", "vegetarian", "Vegetarian")]),
    ).toEqual(["eat vegetarian"]);
    expect(
      profileSentence([
        told("1", "interests", "museums", "Museums and exhibitions"),
      ]),
    ).toEqual([]);
  });
});

describe("ProfileBook", () => {
  it("starts fresh when nothing is known, and still lets the traveller tell it something", () => {
    const html = render(view());
    expect(html).toContain("getting to know");
    expect(html).toContain(
      "Nothing yet. I will start fresh on your next trip.",
    );
    expect(html).toContain("Nothing learned from trips yet");
    expect(html).toContain("Tell me something");
    expect(html).toContain("Make it a rule I never break");
    expect(html).not.toContain('id="rules-heading"');
    expect(html).not.toContain('id="tastes-heading"');
  });

  it("lists every entry with its topic, where it came from and how sure, and the means to change and remove it", () => {
    const html = render(
      view({
        entries: [
          told("e1", "pace", "relaxed", "Relaxed"),
          learned(
            "e2",
            "interests",
            "museums",
            "Museums and exhibitions",
            "usually",
          ),
          told("e3", "dietary_rules", "vegetarian", "Vegetarian"),
          told("e4", "allergies", "shellfish"),
        ],
      }),
    );
    // Hard limits and tastes are separate sections.
    expect(html.indexOf('id="rules-heading"')).toBeLessThan(
      html.indexOf('id="tastes-heading"'),
    );
    expect(html).toContain("2 rules · apply to every trip");
    // Pace is a habit with its own slider; one taste is left in the list.
    expect(html).toContain("1 taste");
    expect(html.indexOf('id="habits-heading"')).toBeLessThan(
      html.indexOf('id="tastes-heading"'),
    );
    for (const text of [
      "Relaxed",
      "Museums and exhibitions",
      "Vegetarian",
      "No shellfish",
    ]) {
      expect(html, text).toContain(text);
    }
    expect(html).toContain("you told me");
    expect(html).toContain("from your trip “Lisbon in spring”");
    expect(html).toContain("usually");
    expect(html).toContain("always");
    for (const label of [
      "Museums and exhibitions",
      "Vegetarian",
      "shellfish",
    ]) {
      expect(html, label).toContain(`aria-label="Change ${label}"`);
      expect(html, label).toContain(`aria-label="Remove ${label}"`);
    }
    // A habit is changed with its slider and removed by its topic's name.
    expect(html).toContain('aria-label="Remove Pace"');
    expect(html).not.toContain('aria-label="Change Relaxed"');
    // The trip it learned from is stamped on the passport, once.
    expect(html).toContain("Learned from 1 trip");
    expect(count(html, 'aria-label="Lisbon in spring"')).toBe(1);
    expect(html).toContain(
      "<em>You travel slowly</em>, and never eat shellfish.",
    );
  });

  it("never calls a place safe for an allergy", () => {
    const html = render(
      view({ entries: [told("e4", "allergies", "shellfish")] }),
    );
    expect(html).toContain("I never call a place safe for an allergy");
    expect(html).toContain('aria-label="A rule I never break"');
  });

  it("asks the traveller to confirm a guess, with a way to correct or remove it", () => {
    const html = render(
      view({
        entries: [learned("e2", "interests", "views", "Views")],
      }),
    );
    expect(html).toContain("Still a guess. Is this right?");
    expect(html).toContain('aria-label="Yes, Views is right"');
    expect(html).toContain('aria-label="Views is not quite right"');
    expect(html).toContain('aria-label="Remove Views"');
  });

  describe("habits", () => {
    const slider = (html: string, name: string) =>
      html.match(
        new RegExp(`<input type="range"[^>]*aria-label="${name}"[^>]*>`),
      )?.[0] ?? "";

    it("shows pace and the shape of the day as sliders, even before anything is known", () => {
      const html = render(view());
      expect(html).toContain("How you like your <em>days</em>");
      expect(html).toContain("3 habits · drag to correct");
      // Where the site stands when nothing is said, and that it is not a memory.
      expect(slider(html, "Pace")).toContain('aria-valuetext="Balanced"');
      expect(slider(html, "Shape of the day")).toContain(
        'aria-valuetext="Neither"',
      );
      // The two habits and the daily budget.
      expect(count(html, "Not set yet. Move the slider to tell me.")).toBe(3);
      expect(html).toContain("A balanced pace");
      expect(html).toContain(
        "Up to three main sights a day, with an hour to wander.",
      );
    });

    it("stands at what is remembered, and says what that does to a plan", () => {
      const html = render(
        view({
          entries: [
            told("e1", "pace", "packed", "Packed"),
            told("e2", "day_shape", "early", "Early starts"),
          ],
        }),
      );
      expect(slider(html, "Pace")).toContain('value="2"');
      expect(slider(html, "Pace")).toContain('aria-valuetext="Packed"');
      expect(html).toContain("Full days");
      expect(html).toContain("Up to four main sights a day.");
      expect(slider(html, "Shape of the day")).toContain('value="0"');
      expect(html).toContain(
        "The whole day runs an hour earlier, dinner included.",
      );
      // Only the daily budget is still unset.
      expect(count(html, "Not set yet")).toBe(1);
      expect(html).toContain('aria-label="Remove Shape of the day"');
    });

    it("asks about a habit it only guessed, naming the trip it comes from", () => {
      const html = render(
        view({ entries: [learned("e2", "pace", "relaxed", "Relaxed")] }),
      );
      expect(html).toContain(
        "Still a guess, from your trip “Lisbon in spring”. Is this right?",
      );
      expect(html).toContain('aria-label="Yes, Relaxed is right"');
      expect(html).toContain('aria-label="Remove Pace"');
    });

    it("gives a daily budget its own card, and keeps older free words in the list", () => {
      const set = render(view({ entries: [told("b1", "budget", "90 EUR")] }));
      expect(set).toContain('data-qa="profile-budget"');
      expect(set).toContain('aria-label="Remove Daily budget"');
      expect(set).not.toContain('id="tastes-heading"');
      const words = render(
        view({ entries: [told("b1", "budget", "150 EUR a day")] }),
      );
      expect(words).toContain("1 taste");
      expect(words).toContain('aria-label="Change 150 EUR a day"');
    });

    it("orders the stops of the day from early to late", () => {
      const html = render(view());
      // The row of stop names under the slider.
      const from = html.indexOf('aria-label="Shape of the day"');
      const row = html.slice(html.indexOf('aria-hidden="true"', from));
      expect(row.indexOf("Early starts")).toBeLessThan(row.indexOf("Neither"));
      expect(row.indexOf("Neither")).toBeLessThan(row.indexOf("Late nights"));
    });
  });

  it("shows what the profile did to the latest trip, with a link to it, and nothing when there is nothing to show", () => {
    const html = renderToStaticMarkup(
      <ProfileBook
        initial={view()}
        name="Ana"
        shaped={{
          tripId: "trip-9",
          title: "Lisbon",
          pairs: [
            {
              memory: "A relaxed pace",
              effect: "No day has more than 2 sights or activities.",
            },
          ],
        }}
      />,
    );
    expect(html).toContain("How this shaped <em>Lisbon</em>");
    expect(html).toContain('href="/trips/trip-9"');
    expect(html).toContain("A relaxed pace");
    expect(html).toContain("So in this trip");
    expect(html).toContain("No day has more than 2 sights or activities.");
    expect(html.indexOf('id="shaped-heading"')).toBeLessThan(
      html.indexOf('id="tell-heading"'),
    );
    expect(render(view())).not.toContain("How this shaped");
    expect(
      renderToStaticMarkup(
        <ProfileBook
          initial={view()}
          name="Ana"
          shaped={{ tripId: "t", title: "Lisbon", pairs: [] }}
        />,
      ),
    ).not.toContain("How this shaped");
  });

  it("shows notes as kept but not yet affecting suggestions", () => {
    const html = render(view({ notes: [{ id: "n1", text: "I hate queues" }] }));
    expect(html).toContain("1 note · not yet affecting suggestions");
    expect(html).toContain("I hate queues");
    expect(html).toContain('aria-label="Remove the note: I hate queues"');
    expect(html).not.toContain("Nothing yet.");
  });

  it("offers the values it understands to pick from, marking those already held", () => {
    const html = render(
      view({ entries: [told("e1", "interests", "views", "Views")] }),
    );
    expect(html).toContain("Or pick from what I understand");
    expect(html).toMatch(/aria-pressed="true"[^>]*>Views<\/button>/);
    expect(html).toMatch(
      /aria-pressed="false"[^>]*>Museums and exhibitions<\/button>/,
    );
    // What a slider holds is not offered again as a list.
    expect(html).not.toMatch(/<legend[^>]*>Pace<\/legend>/);
    expect(html).not.toMatch(/<legend[^>]*>Shape of the day<\/legend>/);
    // A topic with no listed values, such as allergies, is told in words instead.
    expect(html).not.toMatch(/<legend[^>]*>Allergies<\/legend>/);
  });

  it("asks before forgetting everything", () => {
    const html = render(view());
    expect(html).toContain("Forget everything and start again");
    expect(html).toContain("your past trips");
    expect(html).toContain("This cannot be undone.");
  });

  it("uses the traveller's initial on the passport, and a plain one without a name", () => {
    expect(render(view(), "gabriel")).toMatch(/>G<\/span>/);
    expect(render(view(), null)).toMatch(/>T<\/span>/);
  });
});
